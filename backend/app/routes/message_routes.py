from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.core.auth import get_current_user
from backend.app.core.postgres_store import get_database

router = APIRouter(prefix="/messages", tags=["Messages"])


class SendMessagePayload(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


def _pair(first_uid: str, second_uid: str) -> tuple[str, str]:
    return tuple(sorted((first_uid, second_uid)))


def _conversation_id(first_uid: str, second_uid: str) -> str:
    participant_one, participant_two = _pair(first_uid, second_uid)
    return str(uuid5(NAMESPACE_URL, f"bis-message:{participant_one}:{participant_two}"))


def _profile(connection, uid: str):
    row = connection.execute(
        "SELECT document_id, data FROM bis_documents WHERE collection_name = 'users' AND document_id = %s",
        (uid,),
    ).fetchone()
    if not row:
        return None
    data = row[1] or {}
    return {
        "uid": row[0],
        "name": data.get("full_name") or data.get("fullName") or data.get("email"),
        "role": data.get("role", "resident"),
        "photoUrl": data.get("photoUrl"),
        "barangayId": data.get("barangayId"),
    }


def _can_message(sender_role, sender_barangay_id, recipient_role, recipient_barangay_id) -> bool:
    """
    Messaging policy:
    - super_admin <-> admin: always allowed, across any barangay (the super admin's
      line to every barangay's admin, and the admin's line back up).
    - Everyone else (including admin talking to their own staff, and staff talking
      among themselves) is confined to their own barangay: both sides must share
      the same barangayId.
    - Nobody besides an admin can reach a super_admin, and a super_admin can only
      reach admins (not staff/residents directly).
    """
    sender_role = (sender_role or "").strip().lower()
    recipient_role = (recipient_role or "").strip().lower()

    if sender_role == "super_admin":
        return recipient_role == "admin"
    if recipient_role == "super_admin":
        return sender_role == "admin"

    return bool(sender_barangay_id) and sender_barangay_id == recipient_barangay_id


@router.get("/recipients")
def recipients(
    q: str = Query("", max_length=100),
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    search = f"%{q.strip().lower()}%"
    sender_role = user.get("role")
    sender_barangay_id = user.get("barangayId")
    with get_database().connection() as connection:
        # Fetch a wider candidate window than requested, since the barangay/role
        # messaging policy is applied in Python after the name/email search.
        rows = connection.execute(
            "SELECT document_id, data FROM bis_documents WHERE collection_name = 'users' "
            "AND document_id <> %s AND (lower(coalesce(data->>'full_name', '')) LIKE %s "
            "OR lower(coalesce(data->>'email', '')) LIKE %s) ORDER BY data->>'full_name' ASC LIMIT %s",
            (user["uid"], search, search, max(limit * 5, 50)),
        ).fetchall()

    results = []
    for row in rows:
        data = row[1] or {}
        if not _can_message(sender_role, sender_barangay_id, data.get("role"), data.get("barangayId")):
            continue
        results.append({
            "uid": row[0],
            "name": data.get("full_name") or data.get("email"),
            "role": data.get("role"),
            "photoUrl": data.get("photoUrl"),
        })
        if len(results) >= limit:
            break
    return results


@router.get("/conversations")
def conversations(user: dict = Depends(get_current_user)):
    uid = user["uid"]
    with get_database().connection() as connection:
        rows = connection.execute(
            "SELECT id, participant_one_uid, participant_two_uid, last_message_preview, last_message_at, "
            "(SELECT count(*) FROM direct_messages dm WHERE dm.conversation_id = mc.id AND dm.recipient_uid = %s AND dm.read_at IS NULL) "
            "FROM message_conversations mc WHERE participant_one_uid = %s OR participant_two_uid = %s "
            "ORDER BY last_message_at DESC NULLS LAST",
            (uid, uid, uid),
        ).fetchall()
        result = []
        for row in rows:
            other_uid = row[2] if row[1] == uid else row[1]
            profile = _profile(connection, other_uid)
            if not profile:
                continue
            # Hide conversations that no longer satisfy the messaging policy (e.g.
            # a participant's role/barangay changed, or the policy was tightened
            # after the conversation was created) instead of listing dead ends.
            if not _can_message(user.get("role"), user.get("barangayId"), profile.get("role"), profile.get("barangayId")):
                continue
            result.append({"id": row[0], "recipient": profile, "lastMessage": row[3], "lastMessageAt": row[4], "unreadCount": row[5]})
    return result


@router.post("/conversations/{recipient_uid}")
def create_conversation(recipient_uid: str, user: dict = Depends(get_current_user)):
    if recipient_uid == user["uid"]:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    first_uid, second_uid = _pair(user["uid"], recipient_uid)
    conversation_id = _conversation_id(first_uid, second_uid)
    with get_database().connection() as connection:
        recipient = _profile(connection, recipient_uid)
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        if not _can_message(user.get("role"), user.get("barangayId"), recipient.get("role"), recipient.get("barangayId")):
            raise HTTPException(status_code=403, detail="You are not allowed to message this account")
        connection.execute(
            "INSERT INTO message_conversations (id, participant_one_uid, participant_two_uid) VALUES (%s, %s, %s) "
            "ON CONFLICT (participant_one_uid, participant_two_uid) DO NOTHING",
            (conversation_id, first_uid, second_uid),
        )
    return {"id": conversation_id}


def _member(connection, conversation_id: str, user: dict):
    uid = user["uid"]
    row = connection.execute("SELECT participant_one_uid, participant_two_uid FROM message_conversations WHERE id = %s", (conversation_id,)).fetchone()
    if not row or uid not in row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    other_uid = row[1] if row[0] == uid else row[0]
    other = _profile(connection, other_uid)
    if not other or not _can_message(user.get("role"), user.get("barangayId"), other.get("role"), other.get("barangayId")):
        # Policy tightened (or a participant's role/barangay changed) since this
        # conversation was created — no longer a valid pairing under current rules.
        raise HTTPException(status_code=403, detail="This conversation is no longer accessible")
    return row


@router.get("/conversations/{conversation_id}/items")
def conversation_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    with get_database().connection() as connection:
        _member(connection, conversation_id, user)
        connection.execute("UPDATE direct_messages SET read_at = now() WHERE conversation_id = %s AND recipient_uid = %s AND read_at IS NULL", (conversation_id, user["uid"]))
        rows = connection.execute(
            "SELECT id, sender_uid, recipient_uid, body, sent_at, read_at FROM direct_messages WHERE conversation_id = %s ORDER BY sent_at ASC LIMIT 200",
            (conversation_id,),
        ).fetchall()
    return [{"id": row[0], "senderId": row[1], "recipientId": row[2], "body": row[3], "sentAt": row[4], "readAt": row[5]} for row in rows]


@router.post("/conversations/{conversation_id}/items")
def send_message(conversation_id: str, payload: SendMessagePayload, user: dict = Depends(get_current_user)):
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    message_id = str(uuid5(NAMESPACE_URL, f"bis-message-item:{conversation_id}:{user['uid']}:{datetime.now(timezone.utc).timestamp()}"))
    with get_database().connection() as connection:
        participants = _member(connection, conversation_id, user)
        recipient_uid = participants[1] if participants[0] == user["uid"] else participants[0]
        sent_at = datetime.now(timezone.utc)
        connection.execute(
            "INSERT INTO direct_messages (id, conversation_id, sender_uid, recipient_uid, body, sent_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (message_id, conversation_id, user["uid"], recipient_uid, body, sent_at),
        )
        connection.execute(
            "UPDATE message_conversations SET last_message_preview = %s, last_message_at = %s, updated_at = %s WHERE id = %s",
            (body[:160], sent_at, sent_at, conversation_id),
        )
    return {"id": message_id, "senderId": user["uid"], "recipientId": recipient_uid, "body": body, "sentAt": sent_at, "readAt": None}
