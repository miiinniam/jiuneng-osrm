import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import ai, batch, border, geocode, reference, route, templates
from app.db import Base, engine
from app.services.exchange_rate import start_daily_refresh, stop_daily_refresh

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化每日汇率刷新，关闭时停止。"""
    await start_daily_refresh()
    yield
    await stop_daily_refresh()


app = FastAPI(
    title="OSRM++ 越南运输费用预测 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:47820",
        "http://127.0.0.1:47820",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 简单滑动窗口限流（内存中，重启后重置） ──
# 全局 60 req/min，批处理 5 req/min（在 batch.py 路由层检查）。
# 适用于单机轻量部署；多实例部署时请换用 Redis 后端。
_WINDOW_S = 60
_MAX_REQUESTS = 60
_rate_buckets: dict[str, list[float]] = {}  # client_ip → [timestamps]


@app.middleware("http")
async def _rate_limit_middleware(request: Request, call_next):
    """简单滑动窗口限流：每 60s 最多 60 个请求。"""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # 清理过期记录
    bucket = _rate_buckets.get(client_ip, [])
    bucket = [ts for ts in bucket if now - ts < _WINDOW_S]

    if len(bucket) >= _MAX_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "请求过于频繁，请稍后重试", "retry_after": _WINDOW_S},
        )

    bucket.append(now)
    _rate_buckets[client_ip] = bucket

    # 定期清理过期 IP 条目（每 100 个请求触发一次），防止 _rate_buckets 无限增长
    if len(_rate_buckets) > 500:
        _rate_buckets.clear()  # 简单策略：超量时全清，下次请求自动重建

    return await call_next(request)

app.include_router(route.router, prefix="/api/v1", tags=["route"])
app.include_router(reference.router, prefix="/api/v1", tags=["reference"])
app.include_router(geocode.router, prefix="/api/v1", tags=["geocode"])
app.include_router(templates.router, prefix="/api/v1", tags=["templates"])
app.include_router(batch.router, prefix="/api/v1", tags=["batch"])
app.include_router(border.router, prefix="/api/v1", tags=["border"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
