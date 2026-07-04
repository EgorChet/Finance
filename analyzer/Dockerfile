FROM python:3.11-slim
WORKDIR /app
COPY analyzer/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY analyzer/service/ /app/service/
COPY analyzer/engine/ /app/engine/
ENV PYTHONPATH=/app/engine:/app
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "uvicorn service.main:app --host 0.0.0.0 --port ${PORT}"]
