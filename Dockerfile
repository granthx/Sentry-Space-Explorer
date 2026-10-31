# Production Dockerfile for Space Explorer
FROM python:3.12-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SERVE_FRONTEND=true \
    PORT=8000

WORKDIR /app

# Create a non-root system user and group
RUN addgroup --system appgroup && adduser --system --group appuser

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend and frontend source code
COPY backend /app/backend
COPY frontend /app/frontend

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

USER appuser

WORKDIR /app/backend

EXPOSE 8000

# Health check using the readiness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Launch uvicorn listening on all interfaces
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

