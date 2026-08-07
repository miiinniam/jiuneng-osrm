"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect } from "react";
import { useQuoteForm } from "@/hooks/useQuoteForm";
import { useIsMobile } from "@/hooks/useMediaQuery";
import FloatingPanel from "@/components/FloatingPanel";
import ResultsPanel from "@/components/ResultsPanel";
import BottomDrawer from "@/components/BottomDrawer";
import type { ChatRouteCoords } from "@/hooks/useAIChat";
import type { RouteGeometry, LatLng } from "@/lib/types";
import { API_BASE } from "@/lib/api";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function HomePage() {
  const q = useQuoteForm();
  const isMobile = useIsMobile();
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  // 移动端结果抽屉：提交出结果后收起表单、打开结果抽屉（桌面用 ResultsPanel 不涉及）
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [chatOrigin, setChatOrigin] = useState<LatLng | null>(null);
  const [chatDest, setChatDest] = useState<LatLng | null>(null);
  const [chatRouteGeometry, setChatRouteGeometry] = useState<RouteGeometry | null>(null);

  const [routeVersion, setRouteVersion] = useState(0);
  const bumpRoute = useCallback(() => setRouteVersion((v) => v + 1), []);

  const handleChatRoute = useCallback(async (coords: ChatRouteCoords) => {
    setChatOrigin(coords.origin);
    setChatDest(coords.destination);
    setChatRouteGeometry(null);
    try {
      const url = `${API_BASE}/route?origin_lat=${coords.origin.lat}&origin_lng=${coords.origin.lng}&dest_lat=${coords.destination.lat}&dest_lng=${coords.destination.lng}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setChatRouteGeometry(data.geometry as RouteGeometry);
        bumpRoute();
      }
    } catch {
      // ignore
    }
  }, [bumpRoute]);

  const {
    form,
    vehicleModelsByCategory,
    cargoTypeRates,
    pickMode,
    setPickMode,
    submitting,
    comparing,
    result,
    alternatives,
    selectedAltIndex,
    setSelectedAltIndex,
    error,
    updateForm,
    submit,
    compareAlternatives,
    quoteMode,
    setQuoteMode,
    ddpFullResult,
    ddpFullLoading,
  } = q;

  const prevResultRef = useRef(result);
  useEffect(() => {
    if (result && result !== prevResultRef.current) {
      prevResultRef.current = result;
      bumpRoute();
    }
  }, [result, bumpRoute]);

  // 移动端出结果 → 自动打开结果抽屉（并收起表单面板）
  useEffect(() => {
    if (result && isMobile) setDrawerOpen(true);
  }, [result, isMobile]);

  const handleSelectAlt = useCallback((i: number) => {
    setSelectedAltIndex(i);
    bumpRoute();
  }, [setSelectedAltIndex, bumpRoute]);

  const origin = form.originLat && form.originLng
    ? { lat: parseFloat(form.originLat), lng: parseFloat(form.originLng) }
    : null;
  const destination = form.destLat && form.destLng
    ? { lat: parseFloat(form.destLat), lng: parseFloat(form.destLng) }
    : null;
  const waypoints = form.waypoints
    .filter((w: { lat: number; lng: number }) => w.lat && w.lng)
    .map((w: { lat: number; lng: number }) => ({ lat: w.lat, lng: w.lng }));

  const currentResult = alternatives[selectedAltIndex] ?? result;
  const routeGeometry = currentResult?.route?.geometry ?? null;
  const alternativeRouteGeometries = alternatives.length > 1
    ? alternatives.map((a) => a?.route?.geometry ?? null)
    : undefined;

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      if (pickMode === "origin") {
        updateForm({ originLat: lat.toFixed(6), originLng: lng.toFixed(6) });
      } else if (pickMode === "destination") {
        updateForm({ destLat: lat.toFixed(6), destLng: lng.toFixed(6) });
      }
    },
    [pickMode, updateForm],
  );

  const displayOrigin = origin ?? chatOrigin;
  const displayDest = destination ?? chatDest;
  const displayRoute = routeGeometry ?? chatRouteGeometry;

  const handleAIAction = useCallback((action: import("@/lib/chatTypes").ChatAction) => {
    if (action.tool === "apply_vehicle" && action.payload.vehicle_model_id) {
      updateForm({ vehicleModelId: action.payload.vehicle_model_id as string });
    } else if (action.tool === "view_quote" && action.payload) {
      // TODO: 将AI返回的费用数据映射为QuoteResponse显示到ResultsPanel
    }
  }, [updateForm]);

  return (
    <div className="absolute inset-0">
      <MapView
        origin={displayOrigin}
        destination={displayDest}
        waypoints={waypoints}
        routeGeometry={displayRoute}
        alternativeRouteGeometries={alternativeRouteGeometries}
        selectedRouteIndex={selectedAltIndex}
        routeVersion={routeVersion}
        pickMode={pickMode}
        onPick={handleMapPick}
        hasDrawer={isMobile && drawerOpen}
      />

      <FloatingPanel
        vehicleModelsByCategory={vehicleModelsByCategory}
        cargoTypeRates={cargoTypeRates}
        form={form}
        onChange={updateForm}
        pickMode={pickMode}
        onSetPickMode={setPickMode}
        onSubmit={submit}
        onCompareAlternatives={compareAlternatives}
        submitting={submitting}
        comparing={comparing}
        onLoadTemplate={updateForm}
        onChatRouteFound={handleChatRoute}
        onAIAction={handleAIAction}
        quoteMode={quoteMode}
        onQuoteModeChange={setQuoteMode}
        error={error}
        setError={q.setError}
        collapsed={isMobile && drawerOpen}
        onCollapsedChange={(c) => {
          // 用户主动展开表单 → 收起结果抽屉，避免两个底部面板重叠
          if (!c) setDrawerOpen(false);
        }}
      />

      {/* 桌面：右侧 ResultsPanel；移动端：BottomDrawer 结果抽屉 */}
      {!isMobile && result && (
        <ResultsPanel
          result={result}
          alternatives={alternatives}
          selectedAltIndex={selectedAltIndex}
          onSelectAlt={handleSelectAlt}
          loadingMode={form.loadingMode}
          collapsed={resultsCollapsed}
          onToggle={() => setResultsCollapsed((c) => !c)}
          ddpFullResult={ddpFullResult}
          ddpFullLoading={ddpFullLoading}
          isDDPFull={quoteMode === "ddp_full"}
        />
      )}

      {/* 移动端：结果抽屉（可拖动 80px/50vh/85vh 快照） */}
      {isMobile && drawerOpen && result && (
        <BottomDrawer
          result={result}
          alternatives={alternatives}
          selectedAltIndex={selectedAltIndex}
          onSelectAlt={handleSelectAlt}
          loadingMode={form.loadingMode}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[900] rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 shadow-lg">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
