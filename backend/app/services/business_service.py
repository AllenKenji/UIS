from backend.app.core.firebase import get_firestore
from backend.app.services.paymongo_service import create_payment_link
from backend.app.utils.fee_calculator import compute_business_fee

db = get_firestore()

def create_business_application(data):
    business = data.business
    documents = data.documents

    amount = compute_business_fee(business.type)

    doc_ref = db.collection("businesses").document()
    business_id = doc_ref.id

    # Create PayMongo link
    paymongo = create_payment_link(
        amount=amount,
        description=f"Business Permit for {business.name}",
        remarks=f"business_id:{business_id}"
    )

    doc_ref.set({
        "ownerUid": data.owner_uid,
        "ownerName": data.owner_name,
        "contactNumber": data.contact_number,
        "email": data.email,
        "business": business.dict(),
        "documents": documents.dict(),
        "amount": amount,
        "status": "awaiting_payment",
        "paymentStatus": "unpaid",
        "paymongoLinkId": paymongo["link_id"],
        "checkoutUrl": paymongo["checkout_url"]
    })

    return {
        "business_id": business_id,
        "checkout_url": paymongo["checkout_url"]
    }
