# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your backend code
COPY . .

# Copy Firebase credentials
COPY serviceAccountKey.json /app/serviceAccountKey.json
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json

# Set environment variables
ENV PYTHONPATH=/app
ENV PORT=8080

# ✅ Correct import path for main.py inside /app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
