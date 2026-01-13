from pydantic import BaseModel

class PaymentInit(BaseModel):
    business_id: str
    amount: int
