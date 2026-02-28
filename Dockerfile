# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and config
COPY backend ./backend
COPY config ./config

# Environment variables
ENV PYTHONPATH=/app

# ✅ Entrypoint for Cloud Run
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
