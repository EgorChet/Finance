FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY analyzer_api/ /app/analyzer_api/
COPY backend/ /app/backend/
ENV PYTHONPATH=/app/backend
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "uvicorn analyzer_api.main:app --host 0.0.0.0 --port ${PORT}"]
