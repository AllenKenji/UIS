import os

class Settings:
    PAYMONGO_SECRET_KEY = os.environ.get("PAYMONGO_SECRET_KEY")
    PAYMONGO_PUBLIC_KEY = os.environ.get("PAYMONGO_PUBLIC_KEY")
    PAYMONGO_WEBHOOK_SECRET = os.environ.get("PAYMONGO_WEBHOOK_SECRET")

settings = Settings()
