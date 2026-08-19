/* =========================================================================
 * loader-adapter.js — 官网 → Carbox 3D 桥 (货运一站式 一期)
 * 负责人: @codex-02 · 契约见 design doc「双路径契约」
 *
 * 功能:
 *   1. URL 参数 ?vehicle=<OSRM++ model_id> → 映射 Carbox 车型 → Planner.setTruck
 *      (映射表与 31 车型库 CSV 对齐, 见 freight-planner-unified-design.md §映射)
 *   2. postMessage {type:'load-plan', truck, placements} → Planner.importPlan
 *      读模式原始写入, 跳过 centeredPlacement/推挤/沉降一切变换 —
 *      保证外部方案 (AI/报价引擎) 布局与 3D 渲染逐件坐标一致 (验收标准 2)
 * 单位: cm/kg (与 data.js 内核一致); 尺寸由 Carbox 预设接管, 不透传外部尺寸
 * ========================================================================= */
(function () {
  'use strict';

  /* OSRM++ 31 车型库 → Carbox 9 车型 映射 (一期近似; 二期原生按车厢类型细分) */
  var VEHICLE_MAP = {
    container_40hc: '40hq',
    container_40ft: '40gp',
    container_20ft: '20gp',
    flatbed_13m: '13m',
    flatbed_12m5: '12.5p',
    flatbed_low_17m5: '17.5p',
    high_side_18t: '9.6m',
    small_box_8t: '6.8m',
    small_box_3t5: '4.2m'
  };

  function applyVehicleParam() {
    try {
      var q = new URLSearchParams(location.search);
      var v = q.get('vehicle');
      if (!v) return;
      var carboxId = VEHICLE_MAP[v];
      if (carboxId && window.Planner && Planner.setTruck) {
        Planner.setTruck(carboxId);
      }
    } catch (e) { /* URLSearchParams 不可用时静默跳过 */ }
  }

  function init() {
    if (!window.Planner) { setTimeout(init, 100); return; }
    applyVehicleParam();

    // 读模式: 接收外部装载方案, 原始写入 (不触发任何坐标变换)
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.type !== 'load-plan') return;
      if (window.Planner && Planner.importPlan) {
        var ok = Planner.importPlan({ truck: d.truck, placements: d.placements });
        if (!ok) console.warn('[loader-adapter] importPlan 未接受: 缺 placements');
      } else {
        console.warn('[loader-adapter] Planner.importPlan 未提供 (data.js 版本过旧)');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
