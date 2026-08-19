/* =========================================================================
 * data.js — 数据层: 车型库 / 货物CRUD / 摆放状态 / 统计 / 校验 / 持久化
 * 负责人: @car-box-02   (契约见 /Users/fayypp/carbox/设计计划.md §6)
 *
 * 对外暴露 window.Planner:
 *   truck / cargo / placements      —— 当前状态 (只读使用, 修改走 API)
 *   on(event, fn) / off(event, fn)  —— 订阅: 'truck' | 'cargo' | 'placement'
 *   onTruckChange / onCargoChange / onPlacementChange —— 兼容单回调槽 (可赋函数)
 *   setTruck(id) / setCustomTruck({name,L,W,H,maxWeight})
 *   addCargo({name,l,w,h,weight,qty}) / updateCargo(id,patch) / removeCargo(id)
 *   addPlacement({cargoId,x,y,z,dx,dz}) / updatePlacement(id,patch) / removePlacement(id)
 *   clearAll()                       —— 清空摆放 (保留车型与货物)
 *   getPending()                     —— 待摆放实例统计 [{cargoId,name,l,w,h,weight,color,count}]
 *   validatePlacement(p, ignoreId)   —— { ok, reason } 越界/重叠 (拖拽用, ignoreId=自身)
 *   inBounds(p) / overlaps(a,b)      —— 基础几何判定
 *   getStats()                       —— 统计: 件数/体积利用率/总重/超重/剩余
 *   packAuto()                       —— 贪心自动装载 (见 packer.js), 写入 placements
 *   getPackReport()                  —— 上次自动装载的未装入列表
 *   exportCSV()                      —— 生成装箱单 CSV 文本
 * ========================================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'cargoPlanner.v1';
  var PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#c0392b', '#16a085', '#8e44ad',
    '#d35400', '#27ae60', '#2980b9', '#f1c40f', '#2c3e50'
  ];

  /* ---------- 车型库 (复用已验证数据: ~/Desktop/Ai/装载计算器) ---------- */
  var VEHICLES = [
    { id: '40hq',  name: '40HQ 集装箱',      L: 1203, W: 235, H: 269, maxWeight: 26500, type: 'container' },
    { id: '40gp',  name: '40GP 集装箱',      L: 1203, W: 235, H: 239, maxWeight: 26500, type: 'container' },
    { id: '20gp',  name: '20GP 集装箱',      L: 590,  W: 235, H: 239, maxWeight: 21770, type: 'container' },
    { id: '13m',   name: '13米厢式半挂车',   L: 1300, W: 235, H: 250, maxWeight: 30000, type: 'van' },
    { id: '12.5p', name: '12.5米平板车',     L: 1250, W: 240, H: 250, maxWeight: 28000, type: 'flatbed' },
    { id: '17.5p', name: '17.5米平板车',     L: 1750, W: 300, H: 250, maxWeight: 30000, type: 'flatbed' },
    { id: '9.6m',  name: '9.6米厢式货车',    L: 960,  W: 235, H: 245, maxWeight: 15000, type: 'van' },
    { id: '6.8m',  name: '6.8米厢式货车',    L: 680,  W: 235, H: 240, maxWeight: 10000, type: 'van' },
    { id: '4.2m',  name: '4.2米轻卡',        L: 420,  W: 210, H: 210, maxWeight: 4000,  type: 'van' }
  ];

  /* ---------- 状态 ---------- */
  var state = {
    truck: VEHICLES[0],
    cargo: [],
    placements: [],
    customTruck: null,          // 自定义车型 { name, L, W, H, maxWeight }
    seq: 1,                     // placement id 自增
    autoPackOnAdd: true,        // 添加/编辑货物后自动装载到车厢
    units: { length: 'm', weight: 'kg' }  // 显示单位: 尺寸 米/厘米, 重量 千克/吨 (内部恒为 cm/kg)
  };

  var listeners = { truck: [], cargo: [], placement: [], units: [] };
  var callbacks = { onTruckChange: null, onCargoChange: null, onPlacementChange: null };
  var packReport = { unplaced: [], time: null };

  /* ---------- 撤销/重做 (快照栈) ---------- */
  var undoStack = [], redoStack = [], UNDO_MAX = 50;
  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot());
    state = undoStack.pop();
    fireAll();
    return true;
  }
  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot());
    state = redoStack.pop();
    fireAll();
    return true;
  }
  function fireAll() {
    fire('truck'); fire('cargo'); fire('placement'); fire('units');
  }

  /* ---------- 事件 ---------- */
  function fire(kind) {
    if (callbacks['on' + kind[0].toUpperCase() + kind.slice(1) + 'Change']) {
      try { callbacks['on' + kind[0].toUpperCase() + kind.slice(1) + 'Change'](); } catch (e) { console.error('[Planner] listener error:', e); }
    }
    listeners[kind].forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[Planner] listener error:', e); }
    });
    save();
  }
  function on(kind, fn) { if (listeners[kind]) listeners[kind].push(fn); return fn; }
  function off(kind, fn) {
    var i = listeners[kind].indexOf(fn);
    if (i >= 0) listeners[kind].splice(i, 1);
  }

  /* ---------- 持久化 ---------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { console.warn('[Planner] save failed:', e); }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.truck && Array.isArray(s.cargo) && Array.isArray(s.placements)) {
        state = s;
        if (typeof s.seq !== 'number') state.seq = 1;
        if (typeof s.autoPackOnAdd !== 'boolean') state.autoPackOnAdd = true;
        if (!Array.isArray(s.groups)) state.groups = [];
        if (!s.units || !s.units.length || !s.units.weight) state.units = { length: 'm', weight: 'kg' };
      }
    } catch (e) { console.warn('[Planner] load failed, use defaults:', e); }
  }
  function resetStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    state = { truck: VEHICLES[0], cargo: [], placements: [], customTruck: null, seq: 1, autoPackOnAdd: true, groups: [], units: { length: 'm', weight: 'kg' } };
    undoStack = []; redoStack = [];   // 重置时清空历史
  }

  /* ---------- 单位 ---------- */
  function setUnits(u) {
    if (!u) return state.units;
    if (u.length === 'm' || u.length === 'cm') state.units.length = u.length;
    if (u.weight === 'kg' || u.weight === 't') state.units.weight = u.weight;
    save();
    fire('units');
    return state.units;
  }
  function lenDisp(cm) { return state.units.length === 'm' ? cm / 100 : cm; }
  function lenFromDisp(v) { return state.units.length === 'm' ? v * 100 : v; }
  function wtDisp(kg) { return state.units.weight === 't' ? kg / 1000 : kg; }
  function wtFromDisp(v) { return state.units.weight === 't' ? v * 1000 : v; }
  function fmtLen(cm) {
    var v = lenDisp(cm);
    return (state.units.length === 'm' ? (Math.round(v * 100) / 100).toString() : Math.round(v).toString()) +
           (state.units.length === 'm' ? 'm' : 'cm');
  }
  function fmtWt(kg) {
    var v = wtDisp(kg);
    return (state.units.weight === 't' ? (Math.round(v * 1000) / 1000).toString() : Math.round(v).toString()) +
           (state.units.weight === 't' ? 't' : 'kg');
  }

  /* ---------- 几何: AABB ---------- */
  function overlaps(a, b) {
    return !(a.x + a.dx <= b.x || b.x + b.dx <= a.x ||
             a.y + a.dy <= b.y || b.y + b.dy <= a.y ||
             a.z + a.dz <= b.z || b.z + b.dz <= a.z);
  }
  function inBounds(p) {
    var t = state.truck;
    return p.x >= 0 && p.y >= 0 && p.z >= 0 &&
           p.x + p.dx <= t.L + 1e-6 && p.y + p.dy <= t.H + 1e-6 && p.z + p.dz <= t.W + 1e-6;
  }
  /* 超限计算: 超出车厢边界的尺寸 (cm) — 超高/超宽/超长 */
  function overflow(p) {
    var t = state.truck;
    var overLen = 0, overWid = 0, overHgt = 0;
    if (p.x < 0) overLen = Math.max(overLen, -p.x);
    if (p.x + p.dx > t.L) overLen = Math.max(overLen, p.x + p.dx - t.L);
    if (p.z < 0) overWid = Math.max(overWid, -p.z);
    if (p.z + p.dz > t.W) overWid = Math.max(overWid, p.z + p.dz - t.W);
    if (p.y < 0) overHgt = Math.max(overHgt, -p.y);
    if (p.y + p.dy > t.H) overHgt = Math.max(overHgt, p.y + p.dy - t.H);
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    overLen = r1(overLen); overWid = r1(overWid); overHgt = r1(overHgt);
    return { overLen: overLen, overWid: overWid, overHgt: overHgt, any: overLen > 0 || overWid > 0 || overHgt > 0 };
  }
  /* 货物类型超限检查: 两种水平朝向都装不下时返回最小超限值, 否则 null */
  function cargoOverflow(c) {
    var o1 = overflow({ x: 0, y: 0, z: 0, dx: c.l, dy: c.h, dz: c.w });
    var o2 = overflow({ x: 0, y: 0, z: 0, dx: c.w, dy: c.h, dz: c.l });
    if (!o1.any || !o2.any) return null;
    var s1 = o1.overLen + o1.overWid + o1.overHgt;
    var s2 = o2.overLen + o2.overWid + o2.overHgt;
    return s1 <= s2 ? o1 : o2;
  }
  /* 超限规则: 按车型类型自动判定 — 平板车可装超限(标记溢出), 集装箱/厢式车不能(自动弹回) */
  function allowOverflow() {
    return !!(state.truck && state.truck.type === 'flatbed');
  }
  function setAllowOverflow() { return allowOverflow(); }  // 兼容旧调用: 规则由车型类型决定

  function validatePlacement(p, ignoreId) {
    if (!p || p.dx <= 0 || p.dy <= 0 || p.dz <= 0) return { ok: false, reason: '尺寸非法' };
    var ov = overflow(p);
    if (!allowOverflow() && ov.any) return { ok: false, reason: '越界', overflow: ov };
    var others = state.placements.filter(function (q) { return q.id !== ignoreId; });
    for (var i = 0; i < others.length; i++) {
      if (overlaps(p, others[i])) return { ok: false, reason: '重叠' };
    }
    return { ok: true, reason: 'ok', overflow: ov };
  }

  /* ---------- 重叠解析推挤 (确定性; 已摆箱永不被推; 契约见设计计划 §14) ----------
   * 最小平移法: 对 4 个水平方向 (x±/z±) 计算「与该方向所有重叠箱分离所需的最大位移」,
   *   过滤掉 推出边界 或 推后引入新重叠 的方向, 取位移最小的可用方向。
   * pushOutOnce(p): 单次最小平移 (拖拽中轻量版, 不迭代不沉降, 幽灵框预告用)
   * resolvePushOut(p, maxPass): 统一循环 推挤→重算支撑面→沉降→校验, 迭代上限 3, 超限返回 null
   */
  function pushMoveFor(p, others) {
    var moves = [
      { axis: 'x', dir: -1, dist: 0 },
      { axis: 'x', dir: +1, dist: 0 },
      { axis: 'z', dir: -1, dist: 0 },
      { axis: 'z', dir: +1, dist: 0 }
    ];
    var any = false;
    others.forEach(function (q) {
      if (!overlaps(p, q)) return;
      any = true;
      var a = p.x + p.dx - q.x;              // 向左推 a 即与 q 分离
      var b = q.x + q.dx - p.x;              // 向右推 b
      var c = p.z + p.dz - q.z;              // 向 z- 推 c
      var d = q.z + q.dz - p.z;              // 向 z+ 推 d
      if (a > moves[0].dist) moves[0].dist = a;
      if (b > moves[1].dist) moves[1].dist = b;
      if (c > moves[2].dist) moves[2].dist = c;
      if (d > moves[3].dist) moves[3].dist = d;
    });
    if (!any) return null;
    var t = state.truck;
    var usable = moves.filter(function (m) {
      if (m.dist <= 0) return false;
      var np = { x: p.x + (m.axis === 'x' ? m.dir * m.dist : 0), y: p.y, z: p.z + (m.axis === 'z' ? m.dir * m.dist : 0), dx: p.dx, dy: p.dy, dz: p.dz };
      if (!allowOverflow() && (np.x < -0.01 || np.z < -0.01 || np.x + np.dx > t.L + 0.01 || np.z + np.dz > t.W + 0.01)) return false;
      return !others.some(function (q) { return overlaps(np, q); });
    });
    if (!usable.length) return null;         // 推不动
    usable.sort(function (a, b) {
      return (a.dist - b.dist) || ((a.axis === 'x' ? 0 : 1) - (b.axis === 'x' ? 0 : 1));
    });
    return usable[0];
  }
  function pushOutOnce(p) {
    if (!p) return null;
    var others = state.placements.filter(function (q) { return q.id !== p.id; });
    var mv = pushMoveFor(p, others);
    if (!mv) return null;
    return {
      x: p.x + (mv.axis === 'x' ? mv.dir * mv.dist : 0),
      y: p.y,
      z: p.z + (mv.axis === 'z' ? mv.dir * mv.dist : 0)
    };
  }
  function resolvePushOut(p, maxPass) {
    if (!p || p.dx <= 0 || p.dy <= 0 || p.dz <= 0) return null;
    var passes = Math.max(1, Math.min(10, maxPass || 3));
    var cur = { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz };
    for (var pass = 0; pass < passes; pass++) {
      var others = state.placements.filter(function (q) { return q.id !== p.id; });
      var mv = pushMoveFor(cur, others);
      if (mv) {
        if (mv.axis === 'x') cur.x += mv.dir * mv.dist; else cur.z += mv.dir * mv.dist;
      }
      // 推挤后投影变了 → 重算支撑面 → y 沉降 (确定性, 与拖拽落位口径一致)
      cur.y = supportHeight(cur.x, cur.z, cur.dx, cur.dz, p.id);
      var v = validatePlacement(cur, p.id);
      if (v.ok) {
        return { x: Math.round(cur.x * 10) / 10, y: Math.round(cur.y * 10) / 10, z: Math.round(cur.z * 10) / 10 };
      }
      if (v.reason === '越界') return null;  // 推挤只解决重叠, 不解决越界 (非平板越界=回弹)
    }
    return null;
  }

  /* ---------- 外部导入 (AI 方案 → 3D, 双路径契约·读模式) ----------
   * importPlan({truck, placements}): 原始写入 state.placements, 跳过 centeredPlacement/
   * 推挤/沉降一切变换 — 保证外部方案 (AI/报价引擎) 布局与 3D 渲染逐件坐标一致 (验收标准 2)。
   * placements: [{x,y,z,dx,dy,dz, cargoId?,name?,color?,weight?,group?}] 单位 cm/kg。
   * 不触发 packAuto / 撤销快照; 写入后 fire truck/cargo/placement。
   */
  function importPlan(plan) {
    if (!plan || !Array.isArray(plan.placements) || !plan.placements.length) return false;
    var t = state.truck;
    if (plan.truck) {
      if (plan.truck.L > 0) {
        t = { id: 'custom', name: plan.truck.name || '导入车型', L: plan.truck.L, W: plan.truck.W, H: plan.truck.H, maxWeight: plan.truck.maxWeight || 999999, type: plan.truck.type || 'van' };
      } else if (plan.truck.id) {
        var found = VEHICLES.filter(function (v) { return v.id === plan.truck.id; })[0];
        if (found) t = found;
      }
      state.truck = t;
    }
    var ps = plan.placements.map(function (p, i) {
      return {
        id: 'p' + (state.seq + i),
        cargoId: p.cargoId || ('ext' + i),
        name: p.name || ('货物' + (i + 1)),
        color: p.color || PALETTE[i % PALETTE.length],
        weight: p.weight || 0,
        x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz,
        group: p.group || 0
      };
    });
    state.seq += ps.length;
    state.placements = ps;
    var byCargo = {};
    ps.forEach(function (p) {
      if (!byCargo[p.cargoId]) byCargo[p.cargoId] = { p: p, n: 0 };
      byCargo[p.cargoId].n++;
    });
    state.cargo = Object.keys(byCargo).map(function (cid) {
      var e = byCargo[cid];
      return { id: cid, name: e.p.name, l: e.p.dx, w: e.p.dz, h: e.p.dy, weight: e.p.weight, qty: e.n, color: e.p.color, group: e.p.group || 0 };
    });
    packReport = { unplaced: [], time: new Date() };
    fire('truck'); fire('cargo'); fire('placement');
    return true;
  }

  /* ---------- 车型 ---------- */
  function getTrucks() { return VEHICLES; }
  function getTruckList() {
    var list = VEHICLES.slice();
    if (state.customTruck) list.push({ id: 'custom', name: state.customTruck.name, L: state.customTruck.L, W: state.customTruck.W, H: state.customTruck.H, maxWeight: state.customTruck.maxWeight, type: 'custom' });
    return list;
  }
  function setTruck(id) {
    pushUndo();
    var t = VEHICLES.filter(function (v) { return v.id === id; })[0];
    if (!t && id === 'custom' && state.customTruck) {
      t = { id: 'custom', name: state.customTruck.name, L: state.customTruck.L, W: state.customTruck.W, H: state.customTruck.H, maxWeight: state.customTruck.maxWeight, type: 'custom' };
    }
    if (!t) return false;
    state.truck = t;
    // 换车: 越界的摆放自动清掉 (保留放得下的)
    var kept = [];
    state.placements.forEach(function (p) {
      if (validatePlacement(p, null).ok) kept.push(p); else kept.push(null);
    });
    // 简单起见: 换车后清空摆放并提示 (保持行为可预期)
    state.placements = [];
    packReport = { unplaced: [], time: null };
    fire('truck');
    return true;
  }
  function setCustomTruck(o) {
    pushUndo();
    if (!o || !(o.L > 0) || !(o.W > 0) || !(o.H > 0) || !(o.maxWeight > 0)) return false;
    var type = (o.type === 'flatbed' || o.type === 'container' || o.type === 'van') ? o.type : 'van';
    state.customTruck = { name: o.name || '自定义车型', L: o.L, W: o.W, H: o.H, maxWeight: o.maxWeight, type: type };
    state.truck = { id: 'custom', name: state.customTruck.name, L: o.L, W: o.W, H: o.H, maxWeight: o.maxWeight, type: type };
    state.placements = [];
    packReport = { unplaced: [], time: null };
    fire('truck');
    return true;
  }

  /* ---------- 货物 ---------- */
  function nextColor() { return PALETTE[state.cargo.length % PALETTE.length]; }
  function addCargo(o) {
    pushUndo();
    if (!o || !(o.l > 0) || !(o.w > 0) || !(o.h > 0) || !(o.weight > 0)) return null;
    var c = {
      id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      name: o.name || ('货物' + (state.cargo.length + 1)),
      l: o.l, w: o.w, h: o.h, weight: o.weight,
      qty: Math.max(1, Math.floor(o.qty || 1)),
      group: o.group || 0,       // 优先级分组: 0=未分组
      color: o.color || nextColor()
    };
    state.cargo.push(c);
    fire('cargo');
    autoPackIfOn();   // 加货即自动摆上车 (可开关)
    return c;
  }
  function updateCargo(id, patch) {
    pushUndo();
    var c = state.cargo.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    ['name', 'l', 'w', 'h', 'weight', 'qty', 'color'].forEach(function (k) {
      if (patch[k] !== undefined) c[k] = patch[k];
    });
    if (!(c.l > 0) || !(c.w > 0) || !(c.h > 0) || !(c.weight > 0)) return false;
    c.qty = Math.max(1, Math.floor(c.qty));
    // 已摆实例尺寸/重量同步 (手动摆过的箱子跟着货物类型变)
    state.placements.forEach(function (p) {
      if (p.cargoId === id) { p.name = c.name; p.color = c.color; p.weight = c.weight; }
    });
    fire('cargo'); fire('placement');
    autoPackIfOn();   // 尺寸/数量改了 → 重新自动摆位
    return true;
  }
  function removeCargo(id) {
    pushUndo();
    state.cargo = state.cargo.filter(function (x) { return x.id !== id; });
    state.placements = state.placements.filter(function (p) { return p.cargoId !== id; });
    fire('cargo'); fire('placement');
    return true;
  }

  /* ---------- 摆放 ---------- */
  /* 地心引力: 支撑面高度 = 该底面投影下最高的箱子顶面 (无则地板 0) */
  function supportHeight(x, z, dx, dz, ignoreId) {
    var h = 0;
    state.placements.forEach(function (q) {
      if (q.id === ignoreId) return;
      if (q.x + q.dx <= x || x + dx <= q.x) return;
      if (q.z + q.dz <= z || z + dz <= q.z) return;
      h = Math.max(h, q.y + q.dy);
    });
    return h;
  }
  /* 平板车超宽/超长自动居中: 每边超限均匀 (超高不涉及水平居中) */
  function centeredPlacement(p) {
    if (!p || !allowOverflow()) return p;
    var t = state.truck;
    var out = { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz };
    if (p.dz > t.W) out.z = (t.W - p.dz) / 2;
    if (p.dx > t.L) out.x = (t.L - p.dx) / 2;
    return out;
  }
  /* 第二层居中对齐: 叠在支撑箱上时, x/z 与支撑箱中心对齐 (用户要求: 垒第二层自动对齐第一层) */
  function centerOnSupport(p) {
    if (!p || p.y <= 0.01) return p;                 // 在地板上不居中 (地板对齐由网格吸附负责)
    var supports = [];
    state.placements.forEach(function (q) {
      if (Math.abs(q.y + q.dy - p.y) > 0.01) return; // 顶面必须正好是支撑面
      if (q.x + q.dx <= p.x || p.x + p.dx <= q.x) return;
      if (q.z + q.dz <= p.z || p.z + p.dz <= q.z) return;
      supports.push(q);
    });
    if (!supports.length) return p;
    /* 选中心最接近的支撑箱 */
    var pcx = p.x + p.dx / 2, pcz = p.z + p.dz / 2;
    var best = supports[0], bestD = 1e18;
    supports.forEach(function (q) {
      var d = Math.abs((q.x + q.dx / 2) - pcx) + Math.abs((q.z + q.dz / 2) - pcz);
      if (d < bestD) { bestD = d; best = q; }
    });
    var nx = best.x + (best.dx - p.dx) / 2;
    var nz = best.z + (best.dz - p.dz) / 2;
    if (nx < -1e-6 || nz < -1e-6 || nx + p.dx > state.truck.L + 1e-6 || nz + p.dz > state.truck.W + 1e-6) return p;
    var cand = {};                              // 克隆全部字段 (id/cargoId/name/color/weight 不能丢!)
    for (var k in p) cand[k] = p[k];
    cand.x = nx; cand.z = nz;
    var ok = true;
    state.placements.forEach(function (q) { if (ok && overlaps(cand, q)) ok = false; });
    return ok ? cand : p;                            // 对齐后非法 → 保持原位置
  }

  /* ---------- 重力沉降 ----------
   * 支撑箱被移走/删除后, 原本叠在上面的箱子会悬空(违反"不得悬空"规则).
   * 从低到高把悬空箱子落到支撑面上 (只看下方箱子: 顶面不高于自身的箱子中取最高顶),
   * 迭代到稳定. 注意不能用 supportHeight (它取投影下所有箱子的最高顶,
   * 含上方的箱子, 那是"放新箱子"用的语义). */
  function supportBelow(p) {
    var h = 0;
    state.placements.forEach(function (q) {
      if (q.id === p.id) return;
      if (q.y + q.dy > p.y + 0.05) return;          // 只算下方/贴邻的支撑
      if (q.x + q.dx <= p.x || p.x + p.dx <= q.x) return;
      if (q.z + q.dz <= p.z || p.z + p.dz <= q.z) return;
      h = Math.max(h, q.y + q.dy);
    });
    return h;
  }
  function settleGravity() {
    var moved = false;
    for (var pass = 0; pass < 10; pass++) {
      var changed = false;
      var list = state.placements.slice().sort(function (a, b) { return a.y - b.y; });
      list.forEach(function (p) {
        var sh = supportBelow(p);
        if (p.y > sh + 0.05) {          // 悬空 > 0.5mm → 落下 (留浮点容差)
          var cand = {};
          for (var k in p) cand[k] = p[k];
          cand.y = sh;
          if (!validatePlacement(cand, p.id).ok) return;  // 防御: 落位非法则不动
          p.y = sh;
          changed = true;
          moved = true;
        }
      });
      if (!changed) break;
    }
    return moved;
  }

  function addPlacement(o) {
    pushUndo();
    var c = state.cargo.filter(function (x) { return x.id === o.cargoId; })[0];
    if (!c) return null;
    var p = {
      id: 'p' + (state.seq++),
      cargoId: c.id,
      name: c.name,
      color: c.color,
      weight: c.weight,
      x: o.x || 0, y: o.y || 0, z: o.z || 0,
      dx: o.dx || c.l, dy: o.dy || c.h, dz: o.dz || c.w
    };
    p = centeredPlacement(p);   // 超宽/超长自动居中
    /* 地心引力: 先校验 — 原位置合法(不重叠)则保持, 贴邻/支撑面上都算合法;
     * 只有重叠时才抬到支撑面 (落到下层箱顶/堆顶), 不允许悬空或钻入实体 */
    if (!validatePlacement(p, null).ok) {
      var sh = supportHeight(p.x, p.z, p.dx, p.dz, null);
      if (p.y < sh) p.y = sh;
      if (p.y + p.dy > state.truck.H + 1e-6 && !allowOverflow()) return null;  // 超顶且车不允许超限 → 拒
      if (!validatePlacement(p, null).ok) return null;
    }
    /* 第二层居中对齐: 叠在支撑箱上 → x/z 自动与支撑箱中心对齐 */
    var aligned = centerOnSupport(p);
    if (aligned && validatePlacement(aligned, null).ok) p = aligned;
    state.placements.push(p);
    fire('placement');
    return p;
  }
  function updatePlacement(id, patch) {
    pushUndo();
    var p = state.placements.filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    ['x', 'y', 'z', 'dx', 'dy', 'dz'].forEach(function (k) { if (patch[k] !== undefined) p[k] = patch[k]; });
    if (!validatePlacement(p, id).ok) return false; // 拒绝非法落位
    settleGravity();   // 移走支撑箱 → 上方箱子自动落下 (不得悬空)
    fire('placement');
    return true;
  }
  function removePlacement(id) {
    pushUndo();
    state.placements = state.placements.filter(function (p) { return p.id !== id; });
    settleGravity();   // 删除支撑箱 → 上方箱子自动落下
    fire('placement');
    return true;
  }
  function clearAll() {
    pushUndo();
    state.placements = [];
    packReport = { unplaced: [], time: null };
    fire('placement');
  }

  /* ---------- 待摆放统计 ---------- */
  function getPending() {
    var placedCount = {};
    state.placements.forEach(function (p) { placedCount[p.cargoId] = (placedCount[p.cargoId] || 0) + 1; });
    return state.cargo.map(function (c) {
      var done = placedCount[c.id] || 0;
      return { cargoId: c.id, name: c.name, l: c.l, w: c.w, h: c.h, weight: c.weight, color: c.color, count: Math.max(0, c.qty - done) };
    }).filter(function (x) { return x.count > 0; });
  }

  /* ---------- 统计 ---------- */
  /* 重心计算: 按已摆货物加权质心 (cm). 经验安全区: 重心x在车厢 25%~55% 之间 */
  function calculateCG() {
    var t = state.truck;
    var total = 0, cx = 0, cy = 0, cz = 0;
    state.placements.forEach(function (p) {
      var m = p.weight;
      total += m;
      cx += m * (p.x + p.dx / 2);
      cy += m * (p.y + p.dy / 2);
      cz += m * (p.z + p.dz / 2);
    });
    if (total <= 0) {
      return { loaded: false, cgX: null, cgY: null, cgZ: null, xRatio: null, yRatio: null, warning: null };
    }
    cx /= total; cy /= total; cz /= total;
    var xRatio = cx / t.L;
    var yRatio = cy / t.H;
    var warning = null;
    if (xRatio < 0.25) warning = '⚠️ 重心偏前(车头方向)，建议重货后移';
    else if (xRatio > 0.55) warning = '⚠️ 重心偏后(车门方向)，建议重货前移';
    else if (yRatio > 0.6) warning = '⚠️ 重心偏高，注意侧翻风险';
    else warning = '✓ 重心位置正常';
    return { loaded: true, cgX: Math.round(cx * 10) / 10, cgY: Math.round(cy * 10) / 10, cgZ: Math.round(cz * 10) / 10, xRatio: xRatio, yRatio: yRatio, warning: warning };
  }
  /* 轴重分布估算: 前轴取 chassisSpec 前轴组中点, 后轴取后轴组中点;
   * 由重心 x 按杠杆原理分配前后轴载荷 (半挂/厢式近似, 供参考) */
  function axleLoads() {
    var s = getStats();
    var cg = calculateCG();
    if (!cg.loaded || s.totalWeight <= 0) {
      return { loaded: false, front: 0, rear: 0, frontPct: 0, rearPct: 0, warning: null };
    }
    var L = state.truck.L;
    var sp = chassisSpec();
    var xf = (sp.frontAxles[0] + sp.frontAxles[sp.frontAxles.length - 1]) / 2;
    var xr = (sp.rearAxles[0] + sp.rearAxles[sp.rearAxles.length - 1]) / 2;
    var B = xr - xf;
    var cgX = cg.cgX;
    var front = s.totalWeight * (xr - cgX) / B;
    var rear = s.totalWeight * (cgX - xf) / B;
    front = Math.max(0, Math.round(front));
    rear = Math.max(0, Math.round(rear));
    var frontPct = s.totalWeight ? front / s.totalWeight * 100 : 0;
    var warning = null;
    if (frontPct > 60) warning = '⚠️ 前轴载荷偏高，建议重货后移';
    else if (frontPct < 30) warning = '⚠️ 后轴载荷偏高，注意重货分布';
    else warning = '✓ 轴载分布合理';
    return { loaded: true, front: front, rear: rear, frontPct: Math.round(frontPct), rearPct: Math.round(100 - frontPct), warning: warning };
  }
  /* ---------- 优先级分组 (EasyCargo 对齐: 卸货顺序 LIFO) ----------
   * group: 1 = 先装后卸(车头侧 x=0), 大号 = 后装先卸(车门侧 x=L); 0 = 未分组
   * state.groups: [{ name }] 组名表 */
  function addGroup(name) {
    if (!name || !String(name).trim()) return false;
    state.groups = state.groups || [];
    var n = String(name).trim();
    if (state.groups.some(function (g) { return g.name === n; })) return false;
    state.groups.push({ name: n });
    save();
    fire('cargo');
    return true;
  }
  function removeGroup(idx) {
    state.groups = state.groups || [];
    if (idx < 0 || idx >= state.groups.length) return false;
    state.groups.splice(idx, 1);
    /* 组序号前移 */
    state.cargo.forEach(function (c) {
      if (c.group && c.group > idx) c.group = c.group - 1;
      else if (c.group === idx + 1) c.group = 0;
    });
    save();
    fire('cargo');
    return true;
  }
  function getGroups() {
    return (state.groups || []).map(function (g, i) { return { idx: i + 1, name: g.name }; });
  }
  function setCargoGroup(id, g) {
    var c = state.cargo.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    var maxG = (state.groups || []).length;
    c.group = Math.max(0, Math.min(g || 0, maxG));
    fire('cargo');
    save();
    return true;
  }

  /* ---------- 货物数据库 (常用货物库, 独立于方案) ---------- */
  var LIB_KEY = 'cargoPlanner.library';
  function libList() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; }
    catch (e) { return []; }
  }
  function libAdd(item) {
    if (!item || !(item.l > 0) || !(item.w > 0) || !(item.h > 0) || !(item.weight > 0)) return false;
    var lib = libList();
    lib = lib.filter(function (x) { return x.name !== item.name; });
    lib.unshift({ name: item.name || '货物', l: item.l, w: item.w, h: item.h, weight: item.weight, color: item.color || PALETTE[lib.length % PALETTE.length] });
    try { localStorage.setItem(LIB_KEY, JSON.stringify(lib.slice(0, 50))); } catch (e) {}
    return true;
  }
  function libRemove(name) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(libList().filter(function (x) { return x.name !== name; }))); } catch (e) {}
  }

  /* ---------- 底盘规格 (车头/轮胎 3D 建模契约) ----------
   * 供 scene3d.js 的 buildCab 使用: 按车型类型返回车头尺寸与轴位 (cm, x=0 为车厢前壁).
   * 与 axleLoads() 的估算假设一致: 挂车前轴在车头下, 后轴组在车厢后段.
   *   cabL/cabH  —— 车头长/高 (集装箱/半挂 = 牵引车头, 一体厢车 = 驾驶室)
   *   frontAxles —— 前轴 x 列表 (半挂 2 根: 转向轴+驱动轴; 单车 1 根)
   *   rearAxles  —— 后轴组 x 列表 (挂车 3 根集中在车厢后段; 一体车 2 根)
   *   tireR      —— 轮胎半径; 后轴通常双胎并排 (渲染细节由 scene3d 决定) */
  function chassisSpec() {
    var t = state.truck;
    var semi = t.type === 'container' || t.type === 'flatbed' || t.L > 1100;
    var cabL = semi ? 220 : 180;
    var cabH = semi ? 290 : 220;
    var tireR = semi ? 52 : 38;
    var tireD = tireR * 2;                    // 轮胎直径, 轴距必须大于它否则车轮重叠
    var frontAxles, rearAxles;
    if (semi) {
      // 牵引车: 转向轴在车头前部, 驱动轴在鞍座前 (间距 > 轮胎直径 104cm)
      frontAxles = [-(cabL - 45), -(cabL - 165)];   // [-175, -55], 轴距 120cm
      // 挂车三轴集中在车厢后段, 固定轴距 130cm (> 104cm), 最后一轴距车尾 25cm
      rearAxles = [t.L - 285, t.L - 155, t.L - 25];
    } else {
      frontAxles = [-(cabL - 80)];
      // 一体车双后轴, 固定轴距 105cm (> 76cm), 最后一轴距车尾 40cm
      rearAxles = [t.L - 145, t.L - 40];
    }
    return { cabL: cabL, cabH: cabH, frontAxles: frontAxles, rearAxles: rearAxles, tireR: tireR };
  }

  function getStats() {
    var t = state.truck;
    var volTotal = t.L * t.W * t.H;
    var placedCount = state.placements.length;
    var totalWeight = 0, volUsed = 0;
    state.placements.forEach(function (p) {
      totalWeight += p.weight;
      volUsed += p.dx * p.dy * p.dz;
    });
    var totalQty = state.cargo.reduce(function (s, c) { return s + c.qty; }, 0);
    var util = volTotal > 0 ? volUsed / volTotal : 0;
    return {
      placedCount: placedCount,
      totalQty: totalQty,
      pendingCount: totalQty - placedCount,
      totalWeight: totalWeight,
      maxWeight: t.maxWeight,
      overweight: totalWeight > t.maxWeight,
      volUsed: volUsed,
      volTotal: volTotal,
      volumeUtil: util,
      volumeUtilPct: util * 100,
      remainVol: Math.max(0, volTotal - volUsed),
      truck: t
    };
  }

  /* ---------- 自动装载 ---------- */
  function autoPackIfOn() { if (state.autoPackOnAdd) packAuto(null, true); }
  function setAutoPackOnAdd(v) {
    state.autoPackOnAdd = !!v;
    save();
    if (state.autoPackOnAdd && state.cargo.length) packAuto(null, true);
    return state.autoPackOnAdd;
  }
  /* strategy: 'balanced' 重心均衡(默认) | 'volume' 体积优先 | 'weight' 重量优先 */
  function packAuto(strategy, noHistory) {
    if (!noHistory) pushUndo();
    var strat = strategy || state.strategy || 'balanced';
    var result = window.Packer ? window.Packer.pack(state.truck, state.cargo, { allowOverflow: allowOverflow(), strategy: strat }) : null;
    if (!result) { console.error('[Planner] Packer 未加载'); return null; }
    state.placements = result.placements;
    state.strategy = strat;
    packReport = { unplaced: result.unplaced, time: new Date() };
    fire('placement');
    return packReport;
  }
  /* 多策略对比: 各策略各算一遍, 返回摘要 (不应用) */
  function packCompare() {
    var strats = ['balanced', 'volume', 'weight'];
    if ((state.groups || []).length || state.cargo.some(function (c) { return c.group > 0; })) strats.push('priority');
    var results = strats.map(function (s) {
      var r = window.Packer ? window.Packer.pack(state.truck, state.cargo, { allowOverflow: allowOverflow(), strategy: s }) : null;
      if (!r) return null;
      var vol = 0;
      r.placements.forEach(function (p) { vol += p.dx * p.dy * p.dz; });
      var total = state.truck.L * state.truck.W * state.truck.H;
      var cg = null;
      if (r.placements.length) {
        var tw = 0, cx = 0;
        r.placements.forEach(function (p) { tw += p.weight; cx += p.weight * (p.x + p.dx / 2); });
        cg = tw ? cx / tw / state.truck.L : null;
      }
      return { strategy: s, placed: r.placements.length, unplaced: r.unplaced.length,
               util: total ? vol / total : 0, cgX: cg };
    }).filter(Boolean);
    var best = results.slice().sort(function (a, b) { return (b.util - a.util) || (a.unplaced - b.unplaced); })[0];
    return { results: results, best: best ? best.strategy : 'balanced' };
  }
  function getPackReport() { return packReport; }

  /* ---------- 批量导入 (rows: [{name,l,w,h,weight,qty}], 单位 cm/kg) ---------- */
  function importCargoRows(rows) {
    var added = 0, skipped = 0;
    (rows || []).forEach(function (r) {
      if (!r || !(r.l > 0) || !(r.w > 0) || !(r.h > 0) || !(r.weight > 0) || !(r.qty > 0)) { skipped++; return; }
      if (addCargo({ name: r.name || ('货物' + (state.cargo.length + 1)), l: r.l, w: r.w, h: r.h, weight: r.weight, qty: r.qty })) added++;
      else skipped++;
    });
    return { added: added, skipped: skipped };
  }

  /* ---------- 导出 CSV ---------- */
  function exportCSV() {
    var s = getStats();
    var t = state.truck;
    var rows = [];
    rows.push('货物装车单');
    rows.push('车型,' + t.name);
    rows.push('货箱尺寸,' + fmtLen(t.L) + '×' + fmtLen(t.W) + '×' + fmtLen(t.H));
    rows.push('最大载重,' + fmtWt(t.maxWeight));
    rows.push('生成时间,' + new Date().toLocaleString('zh-CN'));
    rows.push('');
    rows.push('序号,货物名称,尺寸,单件重,数量,卸货分组,摆放位置(x,y,z),朝向(dx,dy,dz),重量合计');
    var n = 0;
    state.placements.forEach(function (p) {
      n++;
      var gName = (state.groups && p.group && state.groups[p.group - 1]) ? state.groups[p.group - 1].name : '';
      rows.push([n, p.name, fmtLen(p.dx) + '×' + fmtLen(p.dy) + '×' + fmtLen(p.dz), fmtWt(p.weight), 1,
        gName,
        '(' + r1(p.x) + ',' + r1(p.y) + ',' + r1(p.z) + ')',
        '(' + r1(p.dx) + ',' + r1(p.dy) + ',' + r1(p.dz) + ')',
        fmtWt(p.weight)].join(','));
    });
    rows.push('');
    rows.push('汇总,已装件数,' + s.placedCount + ',需求件数,' + s.totalQty + ',未装,' + s.pendingCount);
    rows.push('汇总,总体积利用率,' + s.volumeUtilPct.toFixed(1) + '%,总重,' + fmtWt(s.totalWeight) + ',超重,' + (s.overweight ? '是' : '否'));
    return rows.join('\n');
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ---------- 导出 ---------- */
  window.Planner = {
    get truck() { return state.truck; },
    get cargo() { return state.cargo; },
    get placements() { return state.placements; },
    get onTruckChange() { return callbacks.onTruckChange; },
    set onTruckChange(fn) { callbacks.onTruckChange = fn; },
    get onCargoChange() { return callbacks.onCargoChange; },
    set onCargoChange(fn) { callbacks.onCargoChange = fn; },
    get onPlacementChange() { return callbacks.onPlacementChange; },
    set onPlacementChange(fn) { callbacks.onPlacementChange = fn; },
    on: on, off: off,
    getTrucks: getTrucks,
    getTruckList: getTruckList,
    setTruck: setTruck,
    setCustomTruck: setCustomTruck,
    addCargo: addCargo,
    updateCargo: updateCargo,
    removeCargo: removeCargo,
    addPlacement: addPlacement,
    centeredPlacement: centeredPlacement,
    centerOnSupport: centerOnSupport,
    supportHeight: supportHeight,
    settleGravity: settleGravity,
    updatePlacement: updatePlacement,
    removePlacement: removePlacement,
    clearAll: clearAll,
    getPending: getPending,
    getStats: getStats,
    calculateCG: calculateCG,
    axleLoads: axleLoads,
    chassisSpec: chassisSpec,
    addGroup: addGroup, removeGroup: removeGroup, getGroups: getGroups, setCargoGroup: setCargoGroup,
    libList: libList, libAdd: libAdd, libRemove: libRemove,
    validatePlacement: validatePlacement,
    pushOutOnce: pushOutOnce,
    resolvePushOut: resolvePushOut,
    importPlan: importPlan,
    inBounds: inBounds,
    overlaps: overlaps,
    packAuto: packAuto,
    packCompare: packCompare,
    get strategy() { return state.strategy || 'balanced'; },
    undo: undo, redo: redo,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    importCargoRows: importCargoRows,
    setAutoPackOnAdd: setAutoPackOnAdd,
    get autoPackOnAdd() { return state.autoPackOnAdd; },
    get allowOverflow() { return allowOverflow(); },
    setAllowOverflow: setAllowOverflow,
    overflow: overflow,
    cargoOverflow: cargoOverflow,
    get units() { return state.units; },
    setUnits: setUnits,
    lenDisp: lenDisp, lenFromDisp: lenFromDisp,
    wtDisp: wtDisp, wtFromDisp: wtFromDisp,
    fmtLen: fmtLen, fmtWt: fmtWt,
    getPackReport: getPackReport,
    exportCSV: exportCSV,
    resetStorage: resetStorage,
    PALETTE: PALETTE,
    VEHICLES: VEHICLES
  };

  load();
})();
