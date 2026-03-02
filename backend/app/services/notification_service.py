# backend/app/services/notification_service.py

import logging
from typing import Optional
from datetime import datetime, timezone

from backend.app.models.notification import Notification
from backend.app.utils.firestore_utils import get_db
from backend.app.core.websocket_manager import manager

logger = logging.getLogger("uvicorn.error")

class NotificationService:
    @staticmethod
    def create_notification(
        role: str,
        type: str,
        message: str,
        scope: Optional[str] = None,
        count: Optional[int] = None,
        user: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Notification:
        """Factory to build a Notification object."""
        return Notification(
            role=role,
            type=type,
            scope=scope,
            count=count,
            user=user,
            user_id=user_id,
            message=message,
            timestamp=datetime.now(timezone.utc),  # timezone-aware UTC
            read=False,
        )

    @staticmethod
    def save_to_firestore(notification: Notification) -> str:
        """Persist notification in Firestore."""
        try:
            doc_ref = get_db().collection("notifications").document(notification.id)
            payload = notification.model_dump()  # ✅ use model_dump instead of dict
            doc_ref.set(payload)
            logger.info(
                "✅ Notification saved (role=%s, type=%s, message=%s)",
                notification.role,
                notification.type,
                notification.message,
            )
            return notification.id
        except Exception as e:
            logger.error("❌ Failed to save notification: %s", e)
            raise

    @staticmethod
    async def broadcast(notification: Notification):
        """Send notification to all connected WebSocket clients."""
        try:
            await manager.broadcast(
                notification.model_dump(),
                role=notification.role,
                user_id=notification.user_id,
            )
            logger.info("📢 Notification broadcasted: %s", notification.message)
        except Exception as e:
            logger.error("❌ Failed to broadcast notification: %s", e)
            raise

    @classmethod
    async def notify(
        cls,
        role: str,
        type: str,
        message: str,
        scope: Optional[str] = None,
        count: Optional[int] = None,
        user: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Notification:
        """
        High-level helper: create, save, and broadcast a notification.
        """
        notif = cls.create_notification(role, type, message, scope, count, user, user_id)
        cls.save_to_firestore(notif)
        await cls.broadcast(notif)
        return notif
