import os
import base64
import requests
import logging

logger = logging.getLogger("uvicorn.error")

# 🔑 Load PayMongo secret key from environment
PAYMONGO_SECRET_KEY = os.getenv("PAYMONGO_SECRET_KEY", "")
BASE_URL = "https://api.paymongo.com/v1"

if not PAYMONGO_SECRET_KEY:
    logger.error("❌ PAYMONGO_SECRET_KEY not set in environment")

# ✅ Encode secret key in Base64 for Basic Auth
encoded_key = base64.b64encode(PAYMONGO_SECRET_KEY.encode()).decode()

headers = {
    "Authorization": f"Basic {encoded_key}",
    "Content-Type": "application/json"
}

def create_payment_link(amount: int, description: str, remarks: str = "", metadata: dict = None,
                        success_url: str = "https://your-app.com/payment-success",
                        cancel_url: str = "https://your-app.com/payment-cancel"):
    """
    Create a PayMongo payment link with redirect URLs.
    Amount must be in pesos; converted to centavos before sending.
    """
    payload = {
        "data": {
            "attributes": {
                "amount": amount * 100,  # PayMongo expects centavos
                "description": description,
                "remarks": remarks,
                "metadata": metadata or {},
                "success_url": success_url,
                "cancel_url": cancel_url
            }
        }
    }
    try:
        logger.info("📤 Creating PayMongo link with payload=%s", payload)
        response = requests.post(f"{BASE_URL}/links", json=payload, headers=headers)
        response.raise_for_status()
        data = response.json().get("data", {})
        return {
            "link_id": data.get("id"),
            "checkout_url": data.get("attributes", {}).get("checkout_url"),
            "success_url": success_url,
            "cancel_url": cancel_url
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error: %s", e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise
    except Exception as e:
        logger.error("❌ Unexpected error creating payment link: %s", e)
        raise


def get_payment_link(link_id: str):
    """
    Retrieve an existing PayMongo payment link by ID.
    """
    try:
        response = requests.get(f"{BASE_URL}/links/{link_id}", headers=headers)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data", {})
        return {
            "id": data.get("id"),
            "status": data.get("attributes", {}).get("status"),
            "checkout_url": data.get("attributes", {}).get("checkout_url"),
            "raw": payload  # optional: full response for debugging
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error when fetching link %s: %s", link_id, e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise
    except Exception as e:
        logger.error("❌ Unexpected error fetching payment link %s: %s", link_id, e)
        raise
