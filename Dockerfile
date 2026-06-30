FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV SEAPEDIA_HOST=0.0.0.0
ENV SEAPEDIA_PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host ${SEAPEDIA_HOST:-0.0.0.0} --port ${SEAPEDIA_PORT:-8000}"]
