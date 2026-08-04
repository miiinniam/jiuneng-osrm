"""地理编码服务（DEVELOPMENT_GOALS.md §5.3）。

当前直接调用公共 Nominatim API，支持中文/越南语/英文地址搜索。
Nominatim 的使用政策要求带上有区分度的 User-Agent，且不要高频调用
（<= 1 req/s）；后续如果调用量上来了，再按文档 §5.3 换成自建的
Photon/Nominatim 实例。

2026-07-16: 纯异步实现 + 手写 TTL 缓存（24h 按天分桶），
消除 lru_cache + 同步 httpx 阻塞事件循环的问题。
"""

import asyncio
import json
import time
from dataclasses import dataclass

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "OSRM-plus-plus/0.1 (jiuneng-international internal logistics tool)"

# ── 异步 TTL 缓存 ──
# 按天分桶（query + limit + date），每天自然刷新，无需手动驱逐。
# Nominatim 公共实例严格限制 1 req/s，缓存命中可避免重复查询。
CACHE_TTL_SECONDS = 86400  # 24h
CACHE_MAXSIZE = 2000

_cache: dict[str, tuple[float, str]] = {}  # key → (expires_at, json_str)
_cache_lock = asyncio.Lock()


class GeocoderError(RuntimeError):
    pass


@dataclass
class GeocodeResult:
    lat: float
    lng: float
    display_name: str


def _make_cache_key(query: str, limit: int) -> str:
    """按天分桶：同一天同一 query+limit 命中缓存。"""
    bucket = time.strftime("%Y%m%d")  # "20260716"
    return f"{bucket}|{query.strip()}|{limit}"


def _evict_if_needed(now: float) -> None:
    """容量保护：删除最早过期的条目。注意调用方必须持有 _cache_lock。"""
    if len(_cache) <= CACHE_MAXSIZE:
        return
    expired = [(k, exp) for k, (exp, _) in _cache.items() if now >= exp]
    if expired:
        expired.sort(key=lambda x: x[1])
        overflow = len(_cache) - CACHE_MAXSIZE
        for k, _ in expired[: min(overflow, len(expired))]:
            del _cache[k]


async def search_address(query: str, limit: int = 5) -> list[GeocodeResult]:
    """异步地址搜索，带 24h TTL 缓存。"""
    if not query.strip():
        return []

    cache_key = _make_cache_key(query, limit)
    now = time.time()

    # 检查缓存
    async with _cache_lock:
        if cache_key in _cache:
            expires_at, raw = _cache[cache_key]
            if now < expires_at:
                items = json.loads(raw)
                return [
                    GeocodeResult(
                        lat=float(item["lat"]),
                        lng=float(item["lon"]),
                        display_name=item["display_name"],
                    )
                    for item in items
                ]

    # 缓存未命中 → 请求 Nominatim
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "q": query.strip(),
                    "format": "json",
                    "limit": limit,
                    "accept-language": "zh,vi,en",
                },
                headers={"User-Agent": USER_AGENT},
            )
    except httpx.HTTPError as exc:
        raise GeocoderError(f"地理编码服务请求失败: {exc}") from exc

    if response.status_code != 200:
        raise GeocoderError(f"地理编码服务返回异常状态码: {response.status_code}")

    items = response.json()
    raw = json.dumps(items, ensure_ascii=False)

    # 写入缓存
    async with _cache_lock:
        _evict_if_needed(now)
        _cache[cache_key] = (now + CACHE_TTL_SECONDS, raw)

    return [
        GeocodeResult(
            lat=float(item["lat"]),
            lng=float(item["lon"]),
            display_name=item["display_name"],
        )
        for item in items
    ]
