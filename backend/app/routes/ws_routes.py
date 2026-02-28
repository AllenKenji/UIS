# backend/app/routes/ws_routes.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from backend.app.core.websocket_manager import ConnectionManager
from backend.app.core.auth import _verify_token
import logging
import json

router = APIRouter(tags=["websocket"])
manager = ConnectionManager()
logger = logging.getLogger("uvicorn.error")

@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, token: str = Query(None)):
    try:
        await websocket.accept()

        token_value = None
        auth_method = None

        # First, check query string
        if token:
            token_value = token
            auth_method = "query"
        else:
            # Otherwise, expect the client to send token as first message
            try:
                initial_msg = await websocket.receive_text()
                payload = json.loads(initial_msg)
                token_value = payload.get("token")
                auth_method = "message"
            except Exception:
                raise HTTPException(status_code=403, detail="Missing authentication token")

        if not token_value:
            raise HTTPException(status_code=403, detail="Missing authentication token")

        logger.info("🔑 Auth method=%s", auth_method)
        logger.info("🔑 Raw token=%s", token_value[:30])

        # Verify token
        try:
            decoded = _verify_token(f"Bearer {token_value}")
            logger.info("✅ Token decoded: uid=%s role=%s email_verified=%s",
                        decoded.get("uid"), decoded.get("role"), decoded.get("email_verified"))
        except Exception as e:
            logger.error("❌ Token verification failed: %s", e)
            await websocket.close(code=4001, reason="Invalid token")
            return

        uid = decoded.get("uid")
        role = decoded.get("role", "resident")
        user_info = {"uid": uid, "role": role, "user_id": uid, "auth_method": auth_method}

        await manager.connect(websocket, user_info)
        logger.info("✅ WebSocket connected for uid=%s role=%s via %s", uid, role, auth_method)

        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message({"echo": data}, websocket)

    except HTTPException as e:
        await websocket.close(code=4001, reason=e.detail)
        manager.disconnect(websocket)
        logger.warning("⚠️ WebSocket rejected: %s", e.detail)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("❌ WebSocket disconnected")

    except Exception as e:
        await websocket.close(code=4001, reason="Unexpected error")
        manager.disconnect(websocket)
        logger.error("❌ WebSocket error: %s", e)
