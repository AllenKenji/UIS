import logging
from typing import Dict
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from starlette.websockets import WebSocketState

logger = logging.getLogger("uvicorn.error")

class ConnectionManager:
    def __init__(self):
        # Map WebSocket -> user info (role, user_id, auth_method, etc.)
        self.active_connections: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, user_info: dict):
        """
        Accept and store a new WebSocket connection with user metadata.
        user_info should include: uid, role, user_id, and optionally auth_method.
        """
        if websocket.client_state == WebSocketState.CONNECTING:
            await websocket.accept()
        self.active_connections[websocket] = user_info
        logger.info(
            "🔌 WebSocket connected (role=%s, user_id=%s, auth=%s). Total connections: %d",
            user_info.get("role"),
            user_info.get("user_id"),
            user_info.get("auth_method", "unknown"),
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            info = self.active_connections.pop(websocket, None)
            logger.info(
                "❌ WebSocket disconnected (role=%s, user_id=%s, auth=%s). Total connections: %d",
                info.get("role") if info else None,
                info.get("user_id") if info else None,
                info.get("auth_method") if info else None,
                len(self.active_connections),
            )

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket client."""
        try:
            await websocket.send_json(jsonable_encoder(message))
        except Exception as e:
            logger.error("⚠️ Failed to send personal message: %s", e)

    async def broadcast(self, message: dict, role: str = None, user_id: str = None):
        """
        Broadcast a message to all connected clients.
        Optionally filter by role and/or user_id.
        """
        logger.debug(
            "📢 Broadcasting message (role=%s, user_id=%s) to %d clients: %s",
            role,
            user_id,
            len(self.active_connections),
            message,
        )
        for connection, info in list(self.active_connections.items()):
            try:
                if role and info.get("role") != role:
                    continue
                if user_id and info.get("user_id") != user_id:
                    continue
                await connection.send_json(jsonable_encoder(message))
            except Exception as e:
                logger.error("⚠️ Failed to send message to client: %s", e)
                self.disconnect(connection)


manager = ConnectionManager()
