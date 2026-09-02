# backend/app/core/roles.py

import json
from pathlib import Path
from typing import Dict

CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "role_permissions.json"

def load_role_permissions(path: Path = CONFIG_PATH) -> Dict[str, Dict[str, bool]]:
    with open(path, "r", encoding="utf-8") as f:
        overrides = json.load(f)

    # Collect all permissions mentioned across roles
    all_perms = {perm for keys in overrides.values() for perm in keys}

    # Build full map: each role gets True/False for every permission
    role_maps = {
        role: {perm: perm in keys for perm in all_perms}
        for role, keys in overrides.items()
    }

    # super_admin is not hand-maintained in role_permissions.json — it always
    # gets every permission that exists, so it can never drift out of date.
    role_maps["super_admin"] = {perm: True for perm in all_perms}

    return role_maps, all_perms

ROLE_PERMISSIONS, ALL_PERMISSIONS = load_role_permissions()

def get_permissions(role: str) -> Dict[str, bool]:
    role = role.lower().strip()
    return ROLE_PERMISSIONS.get(role, {perm: False for perm in ALL_PERMISSIONS})

