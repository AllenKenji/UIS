import logging
from google.cloud import firestore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

# Initialize Firestore client
db = firestore.Client()

# ✅ Seed data
DOCUMENT_TYPES = [
    {"id": "barangay_clearance", "documentType": "Barangay Clearance", "fee": 100},
    {"id": "residency_certificate", "documentType": "Residency Certificate", "fee": 150},
    {"id": "building_permit", "documentType": "Building Permit", "fee": 500},
]

BUSINESS_TYPES = [
    {"id": "retail_store", "businessType": "Retail Store", "registrationFee": 500, "annualFee": 1000},
    {"id": "food_stall", "businessType": "Food Stall", "registrationFee": 300, "annualFee": 600},
    {"id": "service_provider", "businessType": "Service Provider", "registrationFee": 400, "annualFee": 800},
]


def seed_document_types():
    for doc_type in DOCUMENT_TYPES:
        doc_id = doc_type.pop("id")
        db.collection("document_types").document(doc_id).set(doc_type)
        logger.info(f"✅ Seeded document type: {doc_type['documentType']} (fee={doc_type['fee']})")


def seed_business_types():
    for biz_type in BUSINESS_TYPES:
        doc_id = biz_type.pop("id")
        db.collection("business_types").document(doc_id).set(biz_type)
        logger.info(
            f"✅ Seeded business type: {biz_type['businessType']} "
            f"(registrationFee={biz_type['registrationFee']}, annualFee={biz_type['annualFee']})"
        )


def run_seed():
    logger.info("🚀 Starting Firestore seeding...")
    seed_document_types()
    seed_business_types()
    logger.info("🎉 Seeding complete!")


if __name__ == "__main__":
    run_seed()
