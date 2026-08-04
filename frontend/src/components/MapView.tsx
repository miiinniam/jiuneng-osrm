"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef } from "react";
import { GeoJSON, LayersControl, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { LatLng, RouteGeometry } from "@/lib/types";

// Fix leaflet default icon path issues
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom SVG marker factory
function createSvgIcon(color: string, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <defs>
        <filter id="shadow" x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
      </defs>
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z" fill="${color}" filter="url(#shadow)"/>
      <circle cx="18" cy="18" r="6" fill="white" opacity="0.9"/>
      <text x="18" y="21.5" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">${label}</text>
    </svg>`;
  return L.divIcon({
    className: "custom-marker",
    html: svg,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
}

const originIcon = createSvgIcon("#16a34a", "起");
const destIcon = createSvgIcon("#dc2626", "终");
const waypointIcon = (i: number) => createSvgIcon("#6366f1", String(i + 1));

function FlyToRoute({ routeGeometry, hasDrawer }: { routeGeometry: RouteGeometry | null; hasDrawer: boolean }) {
  const map = useMap();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (!routeGeometry || routeGeometry.coordinates.length === 0) return;
    // 跳过相同路线的重复飞行（用首尾坐标拼接做简单去重）
    const sig = `${routeGeometry.coordinates.length}-${routeGeometry.coordinates[0]?.[0] ?? 0}-${routeGeometry.coordinates[routeGeometry.coordinates.length - 1]?.[0] ?? 0}`;
    if (sig === prevRef.current) return;
    prevRef.current = sig;

    const latlngs = routeGeometry.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
    const bounds = L.latLngBounds(latlngs);
    if (bounds.isValid()) {
      const bottomPad = hasDrawer ? 300 : 60;
      map.flyToBounds(bounds, {
        paddingTopLeft: [60, 420] as [number, number],
        paddingBottomRight: [bottomPad, 60] as [number, number],
        maxZoom: 12,
      });
    }
  }, [routeGeometry, hasDrawer, map]);

  return null;
}

interface MapViewProps {
  origin: LatLng | null;
  destination: LatLng | null;
  waypoints: LatLng[];
  routeGeometry: RouteGeometry | null;
  /** 备选路线几何（含当前选中），用于多路线对比叠加渲染 */
  alternativeRouteGeometries?: (RouteGeometry | null)[];
  /** 当前选中路线的索引（对应 alternativeRouteGeometries 数组） */
  selectedRouteIndex?: number;
  routeVersion: number;  // 多路线切换时强制 GeoJSON 重渲染
  pickMode: "origin" | "destination" | null;
  onPick: (lat: number, lng: number) => void;
  hasDrawer?: boolean;
}

function ClickHandler({ pickMode, onPick }: Pick<MapViewProps, "pickMode" | "onPick">) {
  useMapEvents({
    click(e) {
      if (pickMode) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({ origin, destination, waypoints, routeGeometry, alternativeRouteGeometries, selectedRouteIndex, routeVersion, pickMode, onPick, hasDrawer }: MapViewProps) {
  const { t, locale } = useLocale();

  // 备选路线颜色方案（Index 0 = 选中 = 蓝色，其余按顺序分配）
  const ALT_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#06b6d4"];

  return (
    <MapContainer center={[16.0, 108.0]} zoom={6} className="h-full w-full" scrollWheelZoom zoomControl={false}>
      {/* Custom zoom control on bottom-right to avoid overlapping with floating panel */}
      <ZoomControl position="bottomright" />
      {/* Layer control with key refresh on locale change */}
      <LayersControl position="topright" key={locale}>
        <LayersControl.BaseLayer checked name={t.mapView.layers.street}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t.mapView.layers.satellite}>
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t.mapView.layers.terrain}>
          <TileLayer
            attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={t.mapView.layers.dark}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <ClickHandler pickMode={pickMode} onPick={onPick} />

      {/* Pick mode indicator */}
      {pickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[700]">
          <div className="rounded-full bg-[var(--brand-600)]/90 backdrop-blur-sm px-4 py-1.5 text-xs text-white font-medium shadow-lg animate-in-fade">
            📍 {pickMode === "origin" ? t.quoteForm.route.pickingOrigin : t.quoteForm.route.pickingDest} — {t.mapView.escToCancel}
          </div>
        </div>
      )}

      {/* Custom markers */}
      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
          <Popup>{t.mapView.origin}</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>{t.mapView.destination}</Popup>
        </Marker>
      )}
      {waypoints.map((w, i) => (
        <Marker key={i} position={[w.lat, w.lng]} icon={waypointIcon(i)}>
          <Popup>{t.mapView.waypoint(i + 1)}</Popup>
        </Marker>
      ))}

      {/* Route geometry with enhanced styling */}
      {alternativeRouteGeometries && alternativeRouteGeometries.length > 0 ? (
        <>
          {/* Multi-route mode: render all alternative geometries */}
          {alternativeRouteGeometries.map((geom, i) => {
            if (!geom || geom.coordinates.length === 0) return null;
            const isSelected = i === (selectedRouteIndex ?? 0);
            const color = isSelected ? ALT_COLORS[0] : ALT_COLORS[1 + (i % (ALT_COLORS.length - 1))];
            return (
              <GeoJSON
                key={`alt-route-${i}-v${routeVersion}`}
                data={geom as GeoJsonObject}
                style={{
                  color,
                  weight: isSelected ? 4 : 2,
                  opacity: isSelected ? 0.9 : 0.5,
                  dashArray: isSelected ? undefined : "6 4",
                }}
              />
            );
          })}
          <FlyToRoute routeGeometry={alternativeRouteGeometries[selectedRouteIndex ?? 0]} hasDrawer={hasDrawer ?? false} />
        </>
      ) : routeGeometry ? (
        <>
          {/* Single-route mode (backward-compat) */}
          <GeoJSON
            key={`route-glow-${routeVersion}`}
            data={routeGeometry as GeoJsonObject}
            style={{ color: "#3b82f6", weight: 8, opacity: 0.2 }}
          />
          <GeoJSON
            key={`route-main-${routeVersion}`}
            data={routeGeometry as GeoJsonObject}
            style={{ color: "#3b82f6", weight: 4, opacity: 0.9 }}
          />
          <FlyToRoute routeGeometry={routeGeometry} hasDrawer={hasDrawer ?? false} />
        </>
      ) : null}
    </MapContainer>
  );
}
