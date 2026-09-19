"use client";

import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
// ⚠️ 必须导入 Leaflet 的 CSS：缺它则 .leaflet-tile 没有 position:absolute，
// 瓦片会按文档流竖直堆叠（实测相对偏移 0/256/512/768/1024/1280 = 0~5×256），
// 表现即"地图只有左上角一小块、其余空白"。MapView.tsx 有这行，MiniMap 原先漏了。
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { LatLng, RouteGeometry } from "@/lib/types";

const originIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#2080f8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,16,48,.35);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const destIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** 路线变化时自动飞行到可视范围 */
function FitRoute({ routeGeometry, origin, destination }: { routeGeometry: RouteGeometry | null; origin: LatLng | null; destination: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (routeGeometry && routeGeometry.coordinates.length > 0) {
      const coords = routeGeometry.coordinates as [number, number][];
      const bounds = L.latLngBounds(
        coords.map((c) => [c[1], c[0]]),
      );
      map.fitBounds(bounds, { padding: [36, 36] });
    } else if (origin && destination) {
      map.fitBounds(
        L.latLngBounds([
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ]),
        { padding: [48, 48] },
      );
    } else if (origin) {
      map.setView([origin.lat, origin.lng], 7);
    }
  }, [routeGeometry, origin, destination, map]);
  return null;
}

export default function MiniMap({
  origin,
  destination,
  routeGeometry,
}: {
  origin: LatLng | null;
  destination: LatLng | null;
  routeGeometry: RouteGeometry | null;
}) {
  return (
    <MapContainer
      center={[21.0, 105.8]}
      zoom={6}
      minZoom={4}
      maxZoom={16}
      className="h-full w-full"
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
    >
      {/* 瓦片源：{s}.tile.openstreetmap.org 实测 HTTP 000（连接失败）→
          CARTO Voyager 有「API KEY REQUIRED」水印 → 最终 ArcGIS World Street Map */}
      <TileLayer
        attribution="Tiles &copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        // 小窗口低缩放即可，降低瓦片尺寸与数量
        maxZoom={16}
        keepBuffer={0}
        updateWhenIdle
      />
      <FitRoute routeGeometry={routeGeometry} origin={origin} destination={destination} />

      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
          <Popup>起点</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>终点</Popup>
        </Marker>
      )}
      {routeGeometry && routeGeometry.coordinates.length > 0 && (
        <GeoJSON
          data={routeGeometry as unknown as GeoJSON.GeoJsonObject}
          style={{
            color: "#0040c0",
            weight: 4,
            opacity: 0.9,
          }}
        />
      )}
    </MapContainer>
  );
}
