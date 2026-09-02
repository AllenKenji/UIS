from typing import Dict
from backend.app.utils.firestore_utils import get_db

# ✅ Centralized permission key registry
ALL_PERMISSION_KEYS = [
    "viewDashboard",
    "fileComplaints",
    "generateCertificates",
    "manageResidents",
    "approveClearance",
    # Extend as needed
]

class SettingsService:
    def __init__(self):
        db = get_db()
        self.settings_ref = db.collection("settings")
        self.permissions_doc = self.settings_ref.document("permissions")
        self.fees_doc = self.settings_ref.document("fees")

    # 🔐 Role Permissions
    def get_permissions(self) -> Dict[str, Dict[str, bool]]:
        try:
            doc = self.permissions_doc.get()
            return doc.to_dict() if doc.exists else {}
        except Exception as e:
            print(f"❌ [get_permissions] Firestore error: {e}")
            return {}

    def update_permissions(self, role: str, permission_map: Dict[str, bool]) -> bool:
        try:
            # ✅ Validate keys against known registry
            unknown_keys = [key for key in permission_map if key not in ALL_PERMISSION_KEYS]
            if unknown_keys:
                print(f"⚠️ [update_permissions] Unknown keys for role '{role}': {unknown_keys}")

            # ✅ Filter and normalize permission map
            valid_permissions = {
                key: bool(permission_map.get(key, False))
                for key in ALL_PERMISSION_KEYS
            }

            self.permissions_doc.update({role: valid_permissions})
            print(f"✅ [update_permissions] Permissions saved for role '{role}': {valid_permissions}")
            return True
        except Exception as e:
            print(f"❌ [update_permissions] Failed for role '{role}': {e}")
            return False

    # 💰 Document Fees
    def get_fees(self) -> Dict[str, float]:
        try:
            doc = self.fees_doc.get()
            return doc.to_dict() if doc.exists else {}
        except Exception as e:
            print(f"❌ [get_fees] Firestore error: {e}")
            return {}

    def update_fee(self, document_type: str, fee: float) -> bool:
        if not isinstance(fee, (int, float)) or fee <= 0:
            print(f"⚠️ [update_fee] Invalid fee value for '{document_type}': {fee}")
            return False

        try:
            self.fees_doc.update({document_type: fee})
            print(f"✅ [update_fee] Updated fee for '{document_type}' to ₱{fee}")
            return True
        except Exception as e:
            print(f"❌ [update_fee] Failed for '{document_type}': {e}")
            return False
