"use client";

import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { LatLng, RouteGeometry } from "@/lib/types";

const originIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#08c792;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`,
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
            color: "#08c792",
            weight: 4,
            opacity: 0.9,
          }}
        />
      )}
    </MapContainer>
  );
}
