from fastapi import APIRouter, HTTPException, status, Depends
from backend.app.models.settings import RolePermission, DocumentFee
from backend.app.services.settings_service import SettingsService

router = APIRouter(tags=["Settings"])

# 🔐 Centralized role-permission map
ALLOWED_ROLE_KEYS = {
    "admin": ["viewDashboard", "manageResidents", "approveClearance", "generateCertificates"],
    "staff": ["viewDashboard", "fileComplaints", "generateCertificates"],
    "resident": ["viewDashboard", "fileComplaints"],
    # Extend as needed
}

# 🔧 Dependency injection
def get_settings_service():
    return SettingsService()

# 🔐 Get all role permissions
@router.get("/permissions", response_model=dict)
def get_permissions(service: SettingsService = Depends(get_settings_service)):
    try:
        return service.get_permissions()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch permissions: {str(e)}"
        )

# 🔐 Update permissions for a specific role
@router.post("/permissions")
def update_permissions(
    data: RolePermission,
    service: SettingsService = Depends(get_settings_service)
):
    role = data.role
    permission_map = data.permissions

    # 🚫 Prevent admin override
    if role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions cannot be overridden."
        )

    # 🔍 Validate role
    allowed_keys = ALLOWED_ROLE_KEYS.get(role)
    if not allowed_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role: '{role}'"
        )

    # 🔍 Validate keys in payload
    invalid_keys = [key for key in permission_map.keys() if key not in allowed_keys]
    if invalid_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid permission keys for role '{role}': {invalid_keys}"
        )

    try:
        success = service.update_permissions(role, permission_map)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Permission update failed"
            )
        return {"message": f"✅ Permissions updated for role: {role}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update permissions: {str(e)}"
        )

# 💰 Get all document fees
@router.get("/fees", response_model=dict)
def get_fees(service: SettingsService = Depends(get_settings_service)):
    try:
        return service.get_fees()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch fees: {str(e)}"
        )

# 💰 Update fee for a specific document type
@router.post("/fees")
def update_fee(
    data: DocumentFee,
    service: SettingsService = Depends(get_settings_service)
):
    try:
        success = service.update_fee(data.document_type, data.fee)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Fee update failed"
            )
        return {"message": f"✅ Fee updated for document: {data.document_type}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update fee: {str(e)}"
        )
