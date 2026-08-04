"""OSRM Route API 封装（DEVELOPMENT_GOALS.md §5.2）。

对接 start.ps1 启动的本地 osrm-routed（默认 http://localhost:5001）。
内置 httpx 传输层重试（连接错误/5xx 自动重试 2 次）。
OSRM 不可用时降级为 Haversine 直线距离 × 1.3（§10.2 降级方案）。
"""

import math
from dataclasses import dataclass

import httpx

from app.config import settings

# OSRM 降级系数：越南公路网实际距离 ≈ 直线距离 × 1.3（经验值）
ROAD_FACTOR = 1.3
# 降级时假设平均车速 60 km/h
FALLBACK_SPEED_KMH = 60.0

# 传输层重试：对幂等 GET 请求安全，自动应对 OSRM 偶发抖动
_transport = httpx.AsyncHTTPTransport(retries=2)


class OSRMError(RuntimeError):
    pass


@dataclass
class RouteResult:
    distance_m: float
    duration_s: float
    geometry: dict
    fallback: bool = False  # True 表示使用降级估算，非 OSRM 实测路线


class OSRMClient:
    def __init__(self, base_url: str | None = None, *, enable_fallback: bool = True):
        self.base_url = base_url or settings.osrm_base_url
        self.enable_fallback = enable_fallback

    @staticmethod
    def _haversine_distance_m(
        lng1: float, lat1: float, lng2: float, lat2: float
    ) -> float:
        """Haversine 公式：两点间球面直线距离（米）。

        用于 OSRM 降级时估算总里程和行驶时间。详见 DEVELOPMENT_GOALS.md §10.2。
        """
        R = 6_371_000  # 地球平均半径 (m)
        φ1, φ2 = math.radians(lat1), math.radians(lat2)
        Δφ = math.radians(lat2 - lat1)
        Δλ = math.radians(lng2 - lng1)
        a = (
            math.sin(Δφ / 2) ** 2
            + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    @staticmethod
    def _fallback_route(
        coordinates: list[tuple[float, float]],
    ) -> RouteResult:
        """降级估算：累计所有路段的 Haversine 直线距离，乘以道路曲折系数。

        行驶时间按 60 km/h 估算。距离和时间都是近似值，仅供 OSRM 不可用时的
        临时兜底——最终报价精度会受影响，API 响应中显式标注 fallback=true。
        """
        total_straight = sum(
            OSRMClient._haversine_distance_m(c1[0], c1[1], c2[0], c2[1])
            for c1, c2 in zip(coordinates, coordinates[1:])
        )
        distance_m = total_straight * ROAD_FACTOR
        duration_s = (distance_m / 1000) / FALLBACK_SPEED_KMH * 3600
        return RouteResult(
            distance_m=distance_m,
            duration_s=duration_s,
            geometry={"type": "LineString", "coordinates": []},
            fallback=True,
        )

    async def _request(
        self,
        coordinates: list[tuple[float, float]],
        profile: str | None,
        alternatives: bool,
    ) -> list[dict]:
        """coordinates: [(lng, lat), ...]，至少两个点（起点+终点，可含途经点）。"""
        if len(coordinates) < 2:
            raise ValueError("至少需要起点和终点两个坐标")

        profile = profile or settings.osrm_profile
        coords_str = ";".join(f"{lng},{lat}" for lng, lat in coordinates)
        url = f"{self.base_url}/route/v1/{profile}/{coords_str}"

        async with httpx.AsyncClient(timeout=10.0, transport=_transport) as client:
            try:
                response = await client.get(
                    url,
                    params={
                        "alternatives": "true" if alternatives else "false",
                        "steps": "false",
                        "overview": "full",
                        "geometries": "geojson",
                    },
                )
            except httpx.HTTPError as exc:
                raise OSRMError(f"无法连接 OSRM 服务 ({self.base_url}): {exc}") from exc

        data = response.json()
        if data.get("code") != "Ok":
            raise OSRMError(f"OSRM 请求失败: {data.get('code')} - {data.get('message', '')}")

        return data["routes"]

    async def get_route(
        self,
        coordinates: list[tuple[float, float]],
        profile: str | None = None,
    ) -> RouteResult:
        try:
            routes = await self._request(coordinates, profile, alternatives=False)
        except OSRMError:
            if not self.enable_fallback:
                raise
            return self._fallback_route(coordinates)
        route = routes[0]
        return RouteResult(
            distance_m=route["distance"],
            duration_s=route["duration"],
            geometry=route["geometry"],
        )

    async def get_routes(
        self,
        coordinates: list[tuple[float, float]],
        profile: str | None = None,
    ) -> list[RouteResult]:
        """§9 Phase X 多路线对比 —— 请求 OSRM 的候选路线（数量由 OSRM 决定，通常 1-3 条）。

        注意：降级模式下多路线退化为单条估算路线（因为无法从 OSRM 获取候选路线）。
        """
        try:
            routes = await self._request(coordinates, profile, alternatives=True)
        except OSRMError:
            if not self.enable_fallback:
                raise
            return [self._fallback_route(coordinates)]
        return [
            RouteResult(distance_m=r["distance"], duration_s=r["duration"], geometry=r["geometry"])
            for r in routes
        ]
