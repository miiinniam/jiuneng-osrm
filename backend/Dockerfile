FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 生产模式：单 worker（SQLite 不支持多进程并发写），去掉 --reload
ENV WATCHFILES_FORCE_POLLING=false

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
