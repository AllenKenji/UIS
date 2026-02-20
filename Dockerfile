# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your backend code
COPY backend ./backend

COPY config ./config

# Copy Firebase credentials
COPY backend/serviceAccountKey.json ./serviceAccountKey.json
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json

# Set environment variables
ENV PYTHONPATH=/app

# ✅ Correct import path for main.py inside /app
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]

