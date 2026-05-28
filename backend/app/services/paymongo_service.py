import os
import base64
import requests
import logging

logger = logging.getLogger("uvicorn.error")

BASE_URL = "https://api.paymongo.com/v1"

def _get_secret_key() -> str: 
    """Retrieve PayMongo secret key from environment at runtime.""" 
    key = os.getenv("PAYMONGO_SECRET_KEY") 
    if not key: 
        logger.error("❌ PAYMONGO_SECRET_KEY not set in environment") 
        raise RuntimeError("PAYMONGO_SECRET_KEY missing") 
    return key

def _make_headers(secret_key: str) -> dict:
    """Build headers for PayMongo API requests."""
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()
    return {
        "Authorization": f"Basic {encoded_key}",
        "Content-Type": "application/json"
    }

def create_payment_link(amount: int, description: str, remarks: str = "", metadata: dict = None,
                        success_url: str = "https://your-app.com/payment-success",
                        cancel_url: str = "https://your-app.com/payment-cancel") -> dict:
    """Create a PayMongo payment link with redirect URLs."""
    headers = _make_headers(_get_secret_key())
    payload = {
        "data": {
            "attributes": {
                "amount": amount * 100,
                "description": description,
                "remarks": remarks,
                "metadata": metadata or {},
                "success_url": success_url,
                "cancel_url": cancel_url
            }
        }
    }

    # logger.info("📤 Sending PayMongo link payload: %s", payload) 

    try:
        response = requests.post(f"{BASE_URL}/links", json=payload, headers=headers)
        response.raise_for_status()
        data = response.json().get("data", {})
        attrs = data.get("attributes", {})
        return {
            "checkoutUrl": attrs.get("checkout_url"),
            "referenceNumber": attrs.get("reference_number"),
            "paymentStatus": attrs.get("status") or "awaiting_payment",
            "paymongoLinkId": data.get("id")
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error: %s", e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise RuntimeError("Failed to create payment link")
    except Exception as e:
        logger.exception("❌ Unexpected error creating payment link")
        raise RuntimeError("Failed to create payment link")

def get_payment_link(link_id: str) -> dict:
    """Retrieve an existing PayMongo payment link by ID."""
    headers = _make_headers(_get_secret_key())
    try:
        response = requests.get(f"{BASE_URL}/links/{link_id}", headers=headers)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data", {})
        attrs = data.get("attributes", {})
        return {
            "checkoutUrl": attrs.get("checkout_url"),
            "referenceNumber": attrs.get("reference_number"),
            "paymentStatus": attrs.get("status"),
            "paymongoLinkId": data.get("id"),
            "raw": payload
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error when fetching link %s: %s", link_id, e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise RuntimeError("Failed to fetch payment link")
    except Exception as e:
        logger.exception("❌ Unexpected error fetching payment link %s", link_id)
        raise RuntimeError("Failed to fetch payment link")

def get_payment_link_payments(link_id: str) -> dict:
    """Retrieve payments associated with a PayMongo payment link."""
    headers = _make_headers(_get_secret_key())
    try:
        response = requests.get(f"{BASE_URL}/links/{link_id}/payments", headers=headers)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data", [])

        statuses = []
        for item in data:
            if not isinstance(item, dict):
                continue
            attrs = item.get("attributes", {})
            status = attrs.get("status") or item.get("status")
            if status:
                statuses.append(str(status).strip().lower())

        return {
            "statuses": statuses,
            "raw": payload,
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error when fetching link payments %s: %s", link_id, e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise RuntimeError("Failed to fetch payment link payments")
    except Exception:
        logger.exception("❌ Unexpected error fetching link payments %s", link_id)
        raise RuntimeError("Failed to fetch payment link payments")

def get_payment_intent(payment_intent_id: str) -> dict:
    """Retrieve an existing PayMongo payment intent by ID."""
    headers = _make_headers(_get_secret_key())
    try:
        response = requests.get(f"{BASE_URL}/payment_intents/{payment_intent_id}", headers=headers)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data", {})
        attrs = data.get("attributes", {})
        return {
            "paymentIntentId": data.get("id"),
            "paymentStatus": attrs.get("status"),
            "referenceNumber": attrs.get("reference_number"),
            "metadata": attrs.get("metadata", {}),
            "raw": payload,
        }
    except requests.exceptions.HTTPError as e:
        logger.error("❌ PayMongo API error when fetching intent %s: %s", payment_intent_id, e)
        logger.error("📦 Response status=%s body=%s", response.status_code, response.text)
        raise RuntimeError("Failed to fetch payment intent")
    except Exception as e:
        logger.exception("❌ Unexpected error fetching payment intent %s", payment_intent_id)
        raise RuntimeError("Failed to fetch payment intent")

def create_payment_intent(amount: int, description: str, remarks: str = "",
                          metadata: dict = None) -> dict:
    headers = _make_headers(_get_secret_key())
    payload = {
        "data": {
            "attributes": {
                "amount": amount * 100,
                "currency": "PHP",
                "payment_method_allowed": ["gcash", "grab_pay"],
                "description": description,
                "statement_descriptor": remarks or description,
                "metadata": metadata or {},
                "capture_type": "automatic"
            }
        }
    }

    # logger.info("📤 Sending PayMongo intent payload: %s", payload)

    try:
        resp = requests.post(f"{BASE_URL}/payment_intents", json=payload, headers=headers)
        resp.raise_for_status()
        response_json = resp.json()

        # logger.info("📥 PayMongo response: %s", response_json)

        if "errors" in response_json:
            logger.error("❌ PayMongo intent creation failed: %s", response_json["errors"])
            raise RuntimeError("Failed to create payment intent")

        data = response_json.get("data", {})
        attrs = data.get("attributes", {})
        next_action = attrs.get("next_action") or {}
        redirect = next_action.get("redirect") or {}
        checkout_url = redirect.get("url") or ""

        return {
            "checkoutUrl": checkout_url,
            "referenceNumber": attrs.get("reference_number"),
            "paymentStatus": attrs.get("status"),
            "paymentIntentId": data.get("id"),
            "paymongoClientKey": attrs.get("client_key"),
            "amount": (attrs.get("amount") or 0) / 100,
            "description": attrs.get("description"),
            "metadata": attrs.get("metadata", {})
        }
    except requests.exceptions.HTTPError as e:
        response_text = resp.text if 'resp' in locals() and resp is not None else "<no response body>"
        logger.error("❌ PayMongo API error. Payload=%s Response=%s", payload, response_text)
        raise RuntimeError("Failed to create payment intent")
    except Exception as e:
        logger.exception("❌ Unexpected error creating payment intent")
        raise RuntimeError("Failed to create payment intent")

def attach_payment_method(
    payment_intent_id: str,
    client_key: str,
    method: str,
    billing: dict,
    return_url: str
) -> dict:
    """
    Create a payment method and attach it to a Payment Intent.
    Must include a valid return_url so PayMongo generates a redirect URL.
    """
    headers = _make_headers(_get_secret_key())

    # Step 1: Create payment method
    pm_payload = {
        "data": {
            "attributes": {
                "type": method,  # "gcash" or "grab_pay"
                "billing": billing
            }
        }
    }
    pm_res = requests.post(f"{BASE_URL}/payment_methods", json=pm_payload, headers=headers)
    pm_res.raise_for_status()
    pm_data = pm_res.json()
    logger.info("📥 Payment method response: %s", pm_data)

    if "errors" in pm_data:
        raise RuntimeError(f"Payment method creation failed: {pm_data['errors']}")

    payment_method_id = pm_data["data"]["id"]

    # Step 2: Attach to intent
    attach_payload = {
        "data": {
            "attributes": {
                "payment_method": payment_method_id,
                "client_key": client_key,
                "return_url": return_url  # must be a real frontend route
            }
        }
    }
    intent_res = requests.post(
        f"{BASE_URL}/payment_intents/{payment_intent_id}/attach",
        json=attach_payload,
        headers=headers
    )
    intent_res.raise_for_status()
    intent_data = intent_res.json()
    logger.info("📥 Attach response: %s", intent_data)

    if "errors" in intent_data:
        raise RuntimeError(f"Payment intent attach failed: {intent_data['errors']}")

    attrs = intent_data["data"]["attributes"]
    redirect_url = attrs.get("next_action", {}).get("redirect", {}).get("url")

    if not redirect_url:
        # Helpful log to see why redirect is missing
        logger.warning("⚠️ No redirect URL returned. Status=%s", attrs.get("status"))

    return {
        "status": attrs.get("status"),
        "redirectUrl": redirect_url,
        "referenceNumber": attrs.get("reference_number"),
        "paymentIntentId": payment_intent_id
    }
