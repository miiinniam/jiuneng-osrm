FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 源码目录运行时会被 -v 绑定挂载覆盖成宿主机的实时版本，这里的 COPY 只是为了让镜像本身
# 也能独立跑（不依赖挂载）。WATCHFILES_FORCE_POLLING 是因为宿主机源码在 Windows 的 D 盘，
# 挂载进 WSL2 容器走的是网络文件系统协议，inotify 文件变化通知传不进来，--reload 必须退化成
# 轮询模式才能感知到代码改动。
ENV WATCHFILES_FORCE_POLLING=true

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
