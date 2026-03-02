# backend/app/routes/ws_routes.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from backend.app.core.websocket_manager import manager
from backend.app.core.auth import _verify_token
import logging
import json

router = APIRouter(tags=["websocket"])
logger = logging.getLogger("uvicorn.error")

@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, token: str = Query(None)):
    user_info = None
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
                await websocket.close(code=4001, reason="Missing authentication token")
                return

        if not token_value:
            await websocket.close(code=4001, reason="Missing authentication token")
            return

        logger.info("🔑 Auth method=%s", auth_method)

        # Verify token
        try:
            decoded = _verify_token(f"Bearer {token_value}")
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
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("❌ WebSocket disconnected")

    except Exception as e:
        logger.error("❌ WebSocket error uid=%s: %s", user_info.get("user_id") if user_info else "unknown", e)
        if websocket.client_state != WebSocketState.CLOSED:
            await websocket.close(code=1011)
        manager.disconnect(websocket)
