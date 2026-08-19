/* =========================================================================
 * scene3d.js — Three.js 3D 场景 + 拖拽交互 (@car-box-01)
 * 契约: 设计计划.md §6 / §13; 对接 data.js 的 window.Planner
 * 对外: window.Scene3D = { init(el), setTruck(t), setCargo(cargo),
 *                          setPlacements(list), setView(mode), resetView() }
 * 单位: 内部 cm, 场景 m (渲染 ÷100, 写回 ×100)
 * 交互:
 *   - 从左侧待拖区(staging)拖箱子进车厢 → 合法落位即 addPlacement
 *   - 已摆箱子可在车厢内拖动调整; 拖出车厢外删除(回待拖区)
 *   - 拖拽中每帧 Planner.validatePlacement 校验, 非法变红+提示, 松手回弹
 *   - R 旋转朝向(交换 dx/dz), Delete/Backspace 或右键删除选中箱
 *   - 悬停显示 名称/尺寸/重量; 右上角 自由/顶/侧/前 视图切换
 * ========================================================================= */
(function () {
  'use strict';

  var CM = 100; // cm -> m
  var cm = function (v) { return v / CM; };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  /* ---------- 内部状态 ---------- */
  var container = null;
  var renderer = null, scene = null, camera = null, controls = null;
  var truckGroup = null, cargoGroup = null, stagingGroup = null;
  var truck = null;                    // 当前车型 (cm)
  var placeMeshes = new Map();         // placement.id -> { mesh, key }
  var stagingMeshes = [];              // 待拖区 [{ mesh, cargoId, slotX, slotZ }]
  var tooltipEl = null;
  var hovered = null, selected = null;
  var selectedSet = new Set();         // 多选: 已选箱子 mesh 集合 (Shift+点击)
  var cgGroup = null;                  // 重心可视化组
  var drag = null;                     // { mesh, kind, id, cargoId, orig, dx, dy, dz, rotated }
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var downPos = null;                  // pointerdown NDC (判断点击/拖拽)
  var planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var ghostGroup = null, ghostEdgeMat = null, ghostFillMat = null;   // 幽灵框: 推挤/落位预告 (视觉层 @web-design-01)

  /* ---------- 基础工具 ---------- */
  function onWindowResize() {
    if (!renderer || !camera) return;
    // 关键: 用容器尺寸而不是 canvas 自身尺寸 (canvas 会被 setSize 固定, 永远不变)
    var w = container ? container.clientWidth : 0;
    var h = container ? container.clientHeight : 0;
    if (!w || !h) { w = renderer.domElement.clientWidth || 1; h = renderer.domElement.clientHeight || 1; }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach(function (m) { m.dispose(); });
      else mesh.material.dispose();
    }
  }

  function clearGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      if (c.geometry) disposeMesh(c);
    }
  }

  function center3() {
    if (!truck) return new THREE.Vector3(0, 1.5, 0);
    return new THREE.Vector3(cm(truck.L) / 2, cm(truck.H) / 2, cm(truck.W) / 2);
  }

  /* ---------- 磁吸吸附 ---------- */
  function snapPos(x, z, dx, dz, ignoreId) {
    var SNAP = 5;   // 网格步长 cm
    var FACE = 5;   // 贴面距离阈值 cm
    var sx = Math.round(x / SNAP) * SNAP;
    var sz = Math.round(z / SNAP) * SNAP;
    if (!truck) return { x: sx, z: sz };
    // 车厢壁面磁吸
    if (Math.abs(sx - 0) <= FACE) sx = 0;
    if (Math.abs(sx + dx - truck.L) <= FACE) sx = truck.L - dx;
    if (Math.abs(sz - 0) <= FACE) sz = 0;
    if (Math.abs(sz + dz - truck.W) <= FACE) sz = truck.W - dz;
    // 相邻箱体贴面磁吸
    (Planner.placements || []).forEach(function (o) {
      if (o.id === ignoreId) return;
      if (sz + dz > o.z && sz < o.z + o.dz) {          // z 有交集 → 对齐 x 面
        if (Math.abs(sx - (o.x + o.dx)) <= FACE) sx = o.x + o.dx;
        if (Math.abs((sx + dx) - o.x) <= FACE) sx = o.x - dx;
      }
      if (sx + dx > o.x && sx < o.x + o.dx) {          // x 有交集 → 对齐 z 面
        if (Math.abs(sz - (o.z + o.dz)) <= FACE) sz = o.z + o.dz;
        if (Math.abs((sz + dz) - o.z) <= FACE) sz = o.z - dz;
      }
    });
    return { x: sx, z: sz };
  }

  /* ---------- 重力下坠动画 (animate 循环中驱动) ---------- */
  var falls = []; // { mesh, fromY, toY, t0, dur }
  function fallTo(mesh, toY, dur) {
    // 更新目标; 若已在目标则立即到位
    if (Math.abs(mesh.position.y - toY) < 0.002) { mesh.position.y = toY; return; }
    var f = null;
    for (var i = 0; i < falls.length; i++) if (falls[i].mesh === mesh) f = falls[i];
    if (!f) { f = { mesh: mesh, fromY: mesh.position.y, toY: toY, t0: performance.now(), dur: dur || 0.15 }; falls.push(f); }
    else { f.fromY = mesh.position.y; f.toY = toY; f.t0 = performance.now(); }
  }
  function settleFalls() {
    for (var i = falls.length - 1; i >= 0; i--) {
      var f = falls[i];
      var p = Math.min(1, (performance.now() - f.t0) / (f.dur * 1000));
      var e = 1 - (1 - p) * (1 - p); // easeOutQuad
      f.mesh.position.y = f.fromY + (f.toY - f.fromY) * e;
      if (p >= 1) falls.splice(i, 1);
    }
  }

  /* ---------- 尺寸标注 (Sprite) ---------- */
  function fmtLenSafe(v) {
    return window.Planner && Planner.fmtLen ? Planner.fmtLen(v) : (Math.round(v * 100) / 100) + ' cm';
  }
  function fmtWtSafe(v) {
    return window.Planner && Planner.fmtWt ? Planner.fmtWt(v) : v + ' kg';
  }
  function makeTextSprite(text, borderColor, scale) {
    var cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 192;   // 高分辨率, 缩小显示后依然清晰
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(15,20,28,0.88)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(8, 8, 1008, 176, 20) : ctx.rect(8, 8, 1008, 176);
    ctx.fill();
    ctx.strokeStyle = borderColor || 'rgba(77,163,255,0.6)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.font = 'bold 84px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = '#e8ecf1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 100);
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    var s = scale || 2.6;
    sprite.scale.set(s, s * 0.25, 1);
    return sprite;
  }

  /* ---------- 超限标记 (超高/超宽/超长) ---------- */
  var markerGroup = null;
  var markers = new Map();   // placement.id -> { label, lines }
  var dragMarker = null;     // 拖拽中的临时超限标记
  var numGroup = null;       // 箱子编号组
  var showNumbers = false;   // 编号开关

  /* ---------- 箱子编号 (与装箱单行号对应) ---------- */
  function makeNumberSprite(n) {
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(15,20,28,0.88)';
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 60px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 64, 68);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sprite.scale.set(0.42, 0.42, 1);
    return sprite;
  }
  function refreshNumbers() {
    if (!numGroup) return;
    clearGroup(numGroup);
    if (!showNumbers || !window.Planner) return;
    Planner.placements.forEach(function (p, i) {
      var entry = placeMeshes.get(p.id);
      if (!entry) return;
      var s = makeNumberSprite(i + 1);
      s.position.set(cm(p.x) + cm(p.dx) / 2, cm(p.y) + cm(p.dy) + 0.3, cm(p.z) + cm(p.dz) / 2);
      numGroup.add(s);
    });
  }
  function toggleNumbers() {
    showNumbers = !showNumbers;
    refreshNumbers();
    return showNumbers;
  }

  function overflowText(ov) {
    var parts = [];
    if (ov.overLen > 0) parts.push('超长 ' + fmtLenSafe(ov.overLen));
    if (ov.overWid > 0) parts.push('超宽 ' + fmtLenSafe(ov.overWid));
    if (ov.overHgt > 0) parts.push('超高 ' + fmtLenSafe(ov.overHgt));
    return parts.join(' / ');
  }

  function makeBoxEdges(x0, y0, z0, x1, y1, z1, color) {
    var c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
             [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    var idx = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    var pts = [];
    idx.forEach(function (e) {
      pts.push(new THREE.Vector3(c[e[0]][0], c[e[0]][1], c[e[0]][2]));
      pts.push(new THREE.Vector3(c[e[1]][0], c[e[1]][1], c[e[1]][2]));
    });
    return new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95 })
    );
  }

  // 超出车厢部分的红色外扩线框 (世界坐标 m)
  function computeProtrusions(p, t) {
    var lines = [];
    var tL = cm(t.L), tW = cm(t.W), tH = cm(t.H);
    var x0 = cm(p.x), y0 = cm(p.y), z0 = cm(p.z);
    var x1 = cm(p.x + p.dx), y1 = cm(p.y + p.dy), z1 = cm(p.z + p.dz);
    if (y1 > tH) lines.push(makeBoxEdges(x0, Math.max(y0, tH), z0, x1, y1, z1, 0xff3300));       // 超高
    if (x0 < 0) lines.push(makeBoxEdges(x0, y0, z0, Math.min(x1, 0), y1, z1, 0xff3300));         // 超长(前)
    if (x1 > tL) lines.push(makeBoxEdges(Math.max(x0, tL), y0, z0, x1, y1, z1, 0xff3300));       // 超长(后)
    if (z0 < 0) lines.push(makeBoxEdges(x0, y0, z0, x1, y1, Math.min(z1, 0), 0xff3300));         // 超宽(左)
    if (z1 > tW) lines.push(makeBoxEdges(x0, y0, Math.max(z0, tW), x1, y1, z1, 0xff3300));       // 超宽(右)
    return lines;
  }

  function clearMarkerEntry(entry) {
    if (!entry) return;
    if (entry.lines) entry.lines.forEach(function (l) { markerGroup.remove(l); });
    if (entry.label) markerGroup.remove(entry.label);
  }

  function clearDragMarker() {
    if (dragMarker) { clearMarkerEntry(dragMarker); dragMarker = null; }
  }

  // 同步后刷新已摆箱子的超限标记
  function refreshMarkers() {
    if (!markerGroup || drag) return;   // 拖拽中由 updateDragMarker 管理临时标记
    clearGroup(markerGroup);
    markers.clear();
    if (!truck || !window.Planner) return;
    (Planner.placements || []).forEach(function (p) {
      var entry = placeMeshes.get(p.id);
      if (!entry) return;
      var ov = Planner.overflow ? Planner.overflow(p) : null;
      if (!ov || !ov.any) { entry.mesh.userData.edgeMat.color.setHex(0x222831); return; }
      // 红色描边 + 悬浮标签 + 外扩线框
      entry.mesh.userData.edgeMat.color.setHex(0xff2222);
      var label = makeTextSprite('⚠ ' + overflowText(ov), '#ff3300', 1.8);
      label.position.set(cm(p.x) + cm(p.dx) / 2, cm(p.y) + cm(p.dy) + 0.5, cm(p.z) + cm(p.dz) / 2);
      markerGroup.add(label);
      var lines = computeProtrusions(p, truck);
      lines.forEach(function (l) { markerGroup.add(l); });
      markers.set(p.id, { label: label, lines: lines });
    });
    refreshCG();
    refreshNumbers();
    // 动画播放中数据变化 → 按当前步进恢复可见性
    if (playback && playback.showUpTo) playback.showUpTo(playback.idx);
  }

  // 拖拽中的实时超限标记
  function updateDragMarker(cand, ov) {
    if (!markerGroup) return;
    clearDragMarker();
    if (!ov || !ov.any || !truck) return;
    var label = makeTextSprite('⚠ ' + overflowText(ov), '#ff3300', 1.8);
    label.position.set(cm(cand.x) + cm(cand.dx) / 2, cm(cand.y) + cm(cand.dy) + 0.5, cm(cand.z) + cm(cand.dz) / 2);
    markerGroup.add(label);
    var lines = computeProtrusions(cand, truck);
    lines.forEach(function (l) { markerGroup.add(l); });
    dragMarker = { label: label, lines: lines };
  }

  /* ---------- 重心可视化 (Planner.calculateCG) ---------- */
  function refreshCG() {
    if (!cgGroup) return;
    clearGroup(cgGroup);
    if (!truck || !window.Planner || !Planner.calculateCG) return;
    var cg = Planner.calculateCG();
    if (!cg.loaded) return;
    var L = cm(truck.L), W = cm(truck.W);
    var ok = cg.warning && cg.warning.indexOf('✓') === 0;
    var warn = cg.warning && cg.warning.indexOf('⚠️') === 0;
    var col = ok ? 0x2ecc71 : (warn ? 0xf39c12 : 0xe74c3c);
    // 安全区带 (x 25%~55% 地板半透明)
    var safe = new THREE.Mesh(new THREE.PlaneGeometry(cm(truck.L * 0.30), W),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    safe.rotation.x = -Math.PI / 2;
    safe.position.set(cm(truck.L * 0.40), 0.004, W / 2);
    cgGroup.add(safe);
    // 重心球 + 垂线
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshBasicMaterial({ color: col }));
    ball.position.set(cm(cg.cgX), cm(cg.cgY), cm(cg.cgZ));
    cgGroup.add(ball);
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cm(cg.cgX), 0, cm(cg.cgZ)),
      new THREE.Vector3(cm(cg.cgX), cm(cg.cgY), cm(cg.cgZ))
    ]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
    cgGroup.add(line);
    var label = makeTextSprite(ok ? '重心 ✓' : '重心 ⚠', ok ? '#2ecc71' : '#f39c12', 1.4);
    label.position.set(cm(cg.cgX), cm(cg.cgY) + 0.55, cm(cg.cgZ));
    cgGroup.add(label);

    // 轴载可视化 (Planner.axleLoads): 前轴/后轴位置线 + 载荷百分比
    if (Planner.axleLoads) {
      var ax = Planner.axleLoads();
      if (ax.loaded) {
        var spAx = (Planner.chassisSpec) ? Planner.chassisSpec() : null;
        var fx = (spAx && spAx.frontAxles && spAx.frontAxles.length) ? (spAx.frontAxles[0] + spAx.frontAxles[spAx.frontAxles.length - 1]) / 2 : -100;
        var rx = (spAx && spAx.rearAxles && spAx.rearAxles.length) ? (spAx.rearAxles[0] + spAx.rearAxles[spAx.rearAxles.length - 1]) / 2 : truck.L * 0.75;
        var axles = [
          { x: cm(fx) - cabGap(truck), color: 0x4da3ff, text: '前轴 ' + ax.frontPct + '%' },
          { x: cm(rx), color: 0xf39c12, text: '后轴 ' + ax.rearPct + '%' }
        ];
        axles.forEach(function (a) {
          var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(a.x, 0.015, 0), new THREE.Vector3(a.x, 0.015, W)
          ]), new THREE.LineBasicMaterial({ color: a.color, transparent: true, opacity: 0.85 }));
          cgGroup.add(ln);
          var t2 = makeTextSprite(a.text, a.color === 0x4da3ff ? '#4da3ff' : '#f39c12', 1.2);
          t2.position.set(a.x, 0.55, W + 0.7);
          cgGroup.add(t2);
        });
      }
    }
  }

  /* ---------- 多选高亮 ---------- */
  function baseEdgeColor(mesh) {
    var p = mesh.userData.placement;
    if (p && window.Planner && Planner.overflow && Planner.overflow(p).any) return 0xff2222;
    return 0x222831;
  }
  function applySelectionHighlights() {
    placeMeshes.forEach(function (entry) {
      var mesh = entry.mesh;
      if (selectedSet.has(mesh)) {
        mesh.userData.edgeMat.color.setHex(0xffffff);
        mesh.userData.edgeMat.opacity = 1;
      } else {
        mesh.userData.edgeMat.color.setHex(baseEdgeColor(mesh));
        mesh.userData.edgeMat.opacity = 0.5;
      }
    });
  }

  function addDimLabels(t, L, W, H) {
    // CAD 风格三根定位线: 锚定前壁左下角 (0,0,0), 长/宽/高各一轴;
    // 数值用 Sprite (始终面向相机), 旋转视角文字角度不变
    var mat = new THREE.LineBasicMaterial({ color: 0x7fc1ff, transparent: true, opacity: 0.95 });
    var line = function (pts) {
      truckGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
        pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); })), mat));
    };
    var R = W + 0.9;      // 右侧偏移 (z)
    var X = L + 0.9;      // 门端偏移 (x)
    var Y = 0.3;          // 尺寸线抬高 (y)

    // 长线 (沿 x): 从角落引出到车厢右侧
    line([[0, Y, R], [L, Y, R]]);
    line([[0, 0.1, R], [0, 0.55, R]]);     // 端刻线
    line([[L, 0.1, R], [L, 0.55, R]]);
    line([[0, 0, 0], [0, Y, R]]);          // 引出线 (角落 → 尺寸线)
    line([[L, 0, 0], [L, Y, R]]);

    // 宽线 (沿 z): 门端
    line([[X, Y, 0], [X, Y, W]]);
    line([[X, 0.1, 0], [X, 0.55, 0]]);
    line([[X, 0.1, W], [X, 0.55, W]]);
    line([[L, 0, 0], [X, Y, 0]]);
    line([[L, 0, W], [X, Y, W]]);

    // 高线 (沿 y, 床框高): 前壁右上角垂直
    line([[0, Y, R], [0, H, R]]);
    line([[0, Y, R - 0.15], [0, Y, R + 0.15]]);
    line([[0, H, R - 0.15], [0, H, R + 0.15]]);

    var ls = makeTextSprite('长 ' + fmtLenSafe(t.L), '#4da3ff', 1.6);
    ls.position.set(L / 2, 0.85, R);
    truckGroup.add(ls);
    var ws = makeTextSprite('宽 ' + fmtLenSafe(t.W), '#4da3ff', 1.6);
    ws.position.set(X + 0.5, 0.85, W / 2);
    truckGroup.add(ws);
    var hs = makeTextSprite('高 ' + fmtLenSafe(t.H), '#4da3ff', 1.6);
    hs.position.set(0.55, H / 2, R);
    truckGroup.add(hs);
  }

  /* ---------- 车厢 ---------- */
  function buildTruck(t) {
    clearGroup(truckGroup);
    hideGhost();
    if (!t) return;
    var L = cm(t.L), W = cm(t.W), H = cm(t.H);

    var gsize = Math.max(L, W);
    var grid = new THREE.GridHelper(gsize, Math.max(1, Math.round(gsize / 2)), 0x5a7a9a, 0x2e3a4a);
    grid.position.set(L / 2, 0.002, W / 2);
    truckGroup.add(grid);

    if (t.type === 'flatbed') {
      var floorMat = new THREE.MeshLambertMaterial({ color: 0x6b7a8a, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(L / 2, 0.001, W / 2);
      truckGroup.add(floor);

      var railH = 0.3, railMat = new THREE.LineBasicMaterial({ color: 0x8fa3b8, transparent: true, opacity: 0.7 });
      var corners = [[0, 0], [L, 0], [L, W], [0, W]];
      corners.forEach(function (c, i) {
        var c2 = corners[(i + 1) % 4];
        var pts = [
          new THREE.Vector3(c[0], 0, c[1]), new THREE.Vector3(c[0], railH, c[1]),
          new THREE.Vector3(c2[0], railH, c2[1]), new THREE.Vector3(c2[0], 0, c2[1])
        ];
        truckGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), railMat));
      });
    } else {
      var boxGeo = new THREE.BoxGeometry(L, H, W);
      var shell = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({
        color: 0x9aa7b0, transparent: true, opacity: 0.10, depthWrite: false
      }));
      shell.position.set(L / 2, H / 2, W / 2);
      truckGroup.add(shell);

      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: 0x8fa3b8, transparent: true, opacity: 0.55 }));
      edges.position.set(L / 2, H / 2, W / 2);
      truckGroup.add(edges);

      // 车门端 (x=L) 双开门线
      [W / 4, 3 * W / 4].forEach(function (z) {
        truckGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(L, 0, z), new THREE.Vector3(L, H, z)
        ]), new THREE.LineBasicMaterial({ color: 0xc7d2de })));
      });
    }

    buildCab(t, L, W, H);
    addDimLabels(t, L, W, H);

    // 坐标系示意: x 红 / y 绿 / z 蓝
    var axLen = Math.min(L, W, H) * 0.18;
    [[0xff5555, [0, 0, 0], [axLen, 0, 0]], [0x55ff55, [0, 0, 0], [0, axLen, 0]], [0x5599ff, [0, 0, 0], [0, 0, axLen]]]
      .forEach(function (a) {
        truckGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a[1][0], a[1][1], a[1][2]), new THREE.Vector3(a[2][0], a[2][1], a[2][2])
        ]), new THREE.LineBasicMaterial({ color: a[0] })));
      });
  }

  /* ---------- 车头 + 轮胎 (消费 Planner.chassisSpec 底盘契约) ----------
   * @web-design-01 细化版: 斜前风挡/导流罩/遮阳板/后视镜/格栅/大灯组/转向灯/
   * 示廓灯/排气管/油箱/挡泥板/防溅帘/门缝线/蹬车踏板/品牌徽标/底盘大梁
   * 全部纯 primitives, 无新依赖; 仅换车时重建一次 */

  /* 牵引间隙 (m): 半挂/平板车头与货台(托板)留 0.65m 真实牵引间隙 (+30% @user), 一体厢车贴连 */
  function cabGap(t) {
    return (t && (t.type === 'container' || t.type === 'flatbed' || t.L > 1100)) ? 0.65 : 0;
  }

  function buildCab(t, L, W, H) {
    var spec = (window.Planner && Planner.chassisSpec) ? Planner.chassisSpec() : null;
    var isBig = t.L > 900;
    var semi = t.type === 'container' || t.type === 'flatbed' || t.L > 1100;
    // 车头尺寸 (cm → m)
    var cabL = spec ? cm(spec.cabL) : (isBig ? 2.1 : 1.5);
    var cabH = spec ? cm(spec.cabH) : (isBig ? 2.9 : 2.2);
    var tireR = spec ? cm(spec.tireR) : (isBig ? 0.52 : 0.38);
    var frontAxles = spec ? spec.frontAxles : (isBig ? [-150, -121] : [-100]);
    var rearAxles = spec ? spec.rearAxles : [];
    var cabW = W * 0.96;
    var cabX = -cabL / 2;             // 车头在前壁 (x=0) 前方

    var paint = semi ? 0x3a6ea5 : 0x55677a;          // 牵引车深蓝 / 一体车灰蓝
    var paintDark = semi ? 0x2b5278 : 0x445466;      // 深色涂装 (遮阳板/门缝)
    var trim = 0x232a33;                              // 保险杠/格栅/挡泥板
    var trimLight = 0x3a414c;                         // 蹬车踏板/大梁
    var metal = 0x9aa7b0;                             // 油箱铝色
    var glassC = 0x9fd0e8;                            // 玻璃

    function add(mesh) { cabGroup.add(mesh); return mesh; }
    function box(w, h, d, color) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: color })); }
    function cyl(r, h, color, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 12), new THREE.MeshLambertMaterial({ color: color })); }

    // 牵引间隙子组: 车头整体前移 gap (m), 所有锚点不用改; 一体厢车 gap=0 保持贴连
    var gap = cabGap(t);
    var cabGroup = new THREE.Group();
    cabGroup.position.x = -gap;
    truckGroup.add(cabGroup);

    // 车头主体 (牵引车头 / 一体驾驶室)
    var cab = box(cabL, cabH, cabW, paint);
    cab.position.set(cabX, cabH / 2, W / 2);
    add(cab);

    // 前风挡 (倾斜, 顶缘向后仰) + 侧窗
    var glassMat = new THREE.MeshLambertMaterial({ color: glassC });
    var wind = new THREE.Mesh(new THREE.BoxGeometry(0.06, cabH * 0.36, cabW * 0.88), glassMat);
    wind.position.set(-cabL + 0.09, cabH * 0.70, W / 2);
    wind.rotation.z = -0.16;
    add(wind);
    var sideGlass = new THREE.Mesh(new THREE.BoxGeometry(cabL * 0.5, cabH * 0.30, 0.05), glassMat);
    sideGlass.position.set(-cabL * 0.62, cabH * 0.60, W * 0.045);
    add(sideGlass);
    // 门缝线 (两侧前后两条, 深色凹线)
    [cabX + cabL * 0.30, cabX + cabL * 0.82].forEach(function (xx) {
      [0.06, W - 0.06].forEach(function (zz) {
        var seam = box(0.02, cabH * 0.52, 0.05, paintDark);
        seam.position.set(xx, cabH * 0.44, zz);
        add(seam);
      });
    });

    // 导流罩 (牵引车): 驾驶室顶上翘向后, 引导气流到货厢
    if (semi) {
      var fair = box(cabL * 0.80, cabH * 0.20, cabW * 0.96, paint);
      fair.position.set(cabX + cabL * 0.28, cabH + cabH * 0.10, W / 2);
      add(fair);
    }

    // 遮阳板 (前脸顶沿外伸)
    var visor = box(0.22, cabH * 0.07, cabW * 0.9, paintDark);
    visor.position.set(-cabL - 0.10, cabH * 0.90, W / 2);
    add(visor);

    // 后视镜 (两侧: 支架 + 镜面)
    [[0.02, -0.04], [W - 0.02, W + 0.04]].forEach(function (zr) {
      var arm = box(0.34, 0.03, 0.03, trim);
      arm.position.set(-cabL + 0.36, cabH * 0.64, zr[0]);
      add(arm);
      var mirror = box(0.06, cabH * 0.24, 0.26, trim);
      mirror.position.set(-cabL + 0.14, cabH * 0.64, zr[1]);
      add(mirror);
    });

    // 进气格栅 + 横条
    var grille = box(0.06, cabH * 0.22, cabW * 0.72, 0x1c2229);
    grille.position.set(-cabL + 0.04, cabH * 0.36, W / 2);
    add(grille);
    for (var gi = 0; gi < 3; gi++) {
      var slat = box(0.07, 0.022, cabW * 0.62, 0x59687a);
      slat.position.set(-cabL + 0.065, cabH * 0.31 + gi * 0.055, W / 2);
      add(slat);
    }

    // 大灯组 (灯壳 + 灯芯) 与 转向灯
    var lightMat = new THREE.MeshLambertMaterial({ color: 0xfff3b0 });
    [W * 0.27, W * 0.73].forEach(function (z) {
      var hsg = box(0.05, 0.17, 0.28, trim);
      hsg.position.set(-cabL + 0.03, 0.5, z);
      add(hsg);
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.17), lightMat);
      lamp.position.set(-cabL + 0.055, 0.5, z);
      add(lamp);
    });
    [W * 0.13, W * 0.87].forEach(function (z) {
      var sig = box(0.05, 0.08, 0.12, 0xffc94d);
      sig.position.set(-cabL + 0.03, 0.42, z);
      add(sig);
    });

    // 顶置示廓灯 (3 颗)
    [W * 0.15, W * 0.5, W * 0.85].forEach(function (z) {
      var ml = box(0.04, 0.04, 0.08, 0xffd166);
      ml.position.set(-cabL + 0.10, cabH + 0.02, z);
      add(ml);
    });

    // 前保险杠 + 下部蹬车阶
    var bumper = box(0.14, 0.22, cabW * 1.02, trim);
    bumper.position.set(-cabL - 0.05, 0.3, W / 2);
    add(bumper);
    var step = box(0.16, 0.09, cabW * 0.6, trimLight);
    step.position.set(-cabL - 0.13, 0.12, W / 2);
    add(step);

    // 品牌徽标 (格栅中央银块)
    var badge = box(0.02, 0.05, 0.10, 0xd8dee6);
    badge.position.set(-cabL + 0.085, cabH * 0.45, W / 2);
    add(badge);

    // 排气管 (牵引车): 驾驶室右后侧竖管 + 帽
    if (semi) {
      var stackH = cabH * 1.18;
      var stack = cyl(0.07, stackH, 0x8a95a3, 10);
      stack.position.set(-0.08, stackH / 2 - 0.05, W * 0.90);
      add(stack);
      var cap = cyl(0.085, 0.10, 0x2c333d, 10);
      cap.position.set(-0.08, stackH - 0.02, W * 0.90);
      add(cap);
    }

    // 油箱 (牵引车, 两侧驾驶室下方纵置)
    if (semi) {
      [0.30, W - 0.30].forEach(function (z) {
        var tank = cyl(0.28, cabL * 0.9, metal, 14);
        tank.rotation.z = Math.PI / 2;               // 轴沿 x
        tank.position.set(cabX * 0.35, 0.34, z);
        add(tank);
      });
    }

    // 挡泥板 (前轴上方) + 防溅帘 (最后一轴后)
    frontAxles.forEach(function (ax) {
      [0.24, W - 0.24].forEach(function (z) {
        var fender = box(0.62, 0.09, 0.56, trim);
        fender.position.set(cm(ax), 0.22, z);
        add(fender);
      });
    });
    if (rearAxles.length) {
      var lastAx = cm(rearAxles[rearAxles.length - 1]);
      [0.24, W - 0.24].forEach(function (z) {
        var flap = box(0.04, 0.62, 0.52, 0x14181c);
        flap.position.set(lastAx + 0.10, 0.36, z);
        truckGroup.add(flap);   // 锚在挂车最后一轴, 不随车头平移
      });
    }

    // 底盘大梁 (两根纵梁)
    [W * 0.30, W * 0.70].forEach(function (z) {
      var rail = box(cabL + 0.6, 0.16, 0.12, trimLight);
      rail.position.set(cabX * 0.55, 0.10, z);
      add(rail);
    });

    // 轮胎: 前轴单胎, 后轴双胎并排; 轴心 y=-r (顶部恰好贴地板 y=0, 完全不进入箱体)
    var tireMat = new THREE.MeshLambertMaterial({ color: 0x181c22 });
    var hubMat = new THREE.MeshLambertMaterial({ color: 0x8a95a3 });
    var zL = 0.24, zR = W - 0.24;
    function addWheel(x, z, r, dual, parent) {
      var offs = dual ? [-0.22, 0.22] : [0];
      offs.forEach(function (zo) {
        var tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 20), tireMat);
        tire.rotation.x = Math.PI / 2;          // 轴线沿 z
        tire.position.set(x, -r, z + zo);       // 顶部 y=0 与地板齐平, 不侵入箱体/驾驶室
        parent.add(tire);
        var hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.28, 12), hubMat);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(x, -r, z + zo);
        parent.add(hub);
      });
    }
    // 前轴 (转向/驱动, 单胎) — 随车头平移
    frontAxles.forEach(function (ax) {
      addWheel(cm(ax), zL, tireR, false, cabGroup);
      addWheel(cm(ax), zR, tireR, false, cabGroup);
    });
    // 后轴组 (双胎并排) — 挂车轴, 锚在货台绝对位置, 不随车头
    rearAxles.forEach(function (ax) {
      addWheel(cm(ax), zL, tireR, true, truckGroup);
      addWheel(cm(ax), zR, tireR, true, truckGroup);
    });
  }

  /* ---------- 货物 mesh ---------- */
  var GROUP_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#16a085', '#8e44ad', '#f1c40f'];
  function effColor(p) {
    return (p.group && p.group > 0) ? GROUP_COLORS[(p.group - 1) % GROUP_COLORS.length] : (p.color || '#e74c3c');
  }
  function makeCargoMesh(p) {
    var geo = new THREE.BoxGeometry(cm(p.dx), cm(p.dy), cm(p.dz));
    var mat = new THREE.MeshLambertMaterial({ color: effColor(p) });   // 分组箱按组色渲染
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseColor = mat.color.getHex();
    mesh.userData.placement = p; // 关键: 拾取/拖拽/悬停都靠它识别"已摆放箱"
    var edgeMat = new THREE.LineBasicMaterial({ color: 0x222831, transparent: true, opacity: 0.5 });
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    mesh.add(edges);
    mesh.userData.edges = edges;
    mesh.userData.edgeMat = edgeMat;
    return mesh;
  }

  function meshKey(p) { return [p.dx, p.dy, p.dz, effColor(p)].join('|'); }
  function placePosition(p) {
    return new THREE.Vector3(cm(p.x + p.dx / 2), cm(p.y + p.dy / 2), cm(p.z + p.dz / 2));
  }

  /* ---------- 摆放同步 (diff) ---------- */
  function syncPlacements(list) {
    if (!cargoGroup) return;
    list = list || [];
    var seen = new Set();
    list.forEach(function (p) {
      if (drag && drag.kind === 'placed' && drag.id === p.id) return; // 拖拽中的箱不重建
      seen.add(p.id);
      var entry = placeMeshes.get(p.id);
      var key = meshKey(p);
      if (!entry) {
        var mesh = makeCargoMesh(p);
        mesh.position.copy(placePosition(p));
        cargoGroup.add(mesh);
        placeMeshes.set(p.id, { mesh: mesh, key: key });
      } else if (entry.key !== key) {
        cargoGroup.remove(entry.mesh);
        disposeMesh(entry.mesh);
        var m2 = makeCargoMesh(p);
        m2.position.copy(placePosition(p));
        cargoGroup.add(m2);
        placeMeshes.set(p.id, { mesh: m2, key: key });
      } else {
        entry.mesh.position.copy(placePosition(p));
        entry.mesh.userData.placement = p;
      }
    });
    placeMeshes.forEach(function (entry, id) {
      if (!seen.has(id)) {
        cargoGroup.remove(entry.mesh);
        disposeMesh(entry.mesh);
        placeMeshes.delete(id);
      }
    });
    if (!drag) buildStaging();
    refreshMarkers();
  }

  /* ---------- 待拖区 (staging): 车厢左侧地面 ---------- */
  function pendingList() {
    if (window.Planner && Planner.getPending) return Planner.getPending();
    if (!window.Planner) return [];
    // 兜底: 自己算 (cargo.qty - 已摆数)
    var done = {};
    (Planner.placements || []).forEach(function (p) { done[p.cargoId] = (done[p.cargoId] || 0) + 1; });
    return (Planner.cargo || []).map(function (c) {
      return { cargoId: c.id, name: c.name, l: c.l, w: c.w, h: c.h, weight: c.weight, color: c.color, count: Math.max(0, c.qty - (done[c.id] || 0)) };
    }).filter(function (x) { return x.count > 0; });
  }

  function buildStaging() {
    if (!stagingGroup || !truck) return;
    clearGroup(stagingGroup);
    stagingMeshes = [];
    var pend = pendingList();
    if (!pend.length) return;

    var offZ = cm(truck.W / 2) + 2.4;
    var col = 0, row = 0, maxCol = 3, gap = 0.5;
    pend.forEach(function (c) {
      var show = Math.min(c.count, 6); // 性能保护: 同类型最多 6 个代表箱
      for (var i = 0; i < show; i++) {
        var mesh = makeCargoMesh({ dx: c.l, dy: c.h, dz: c.w, color: c.color || '#3498db' });
        mesh.userData.cargo = c;
        mesh.userData.staging = true;
        delete mesh.userData.placement; // 关键: staging 箱不能被当成已摆放箱
        var sx = 0.35 + col * gap;
        var sz = -offZ - row * gap;
        mesh.position.set(sx, cm(c.h) / 2, sz);
        stagingGroup.add(mesh);
        stagingMeshes.push({ mesh: mesh, cargoId: c.cargoId, slotX: sx, slotZ: sz });
        col++;
        if (col >= maxCol) { col = 0; row++; }
      }
    });
  }

  /* ---------- 视图 ---------- */
  function setView(mode) {
    if (!camera || !truck) return;
    var c = center3();
    var L = cm(truck.L), H = cm(truck.H), W = cm(truck.W);
    var pos;
    switch (mode) {
      case 'top':   pos = new THREE.Vector3(c.x, Math.max(L, W) * 2.2, c.z + 0.01); break;
      case 'side':  pos = new THREE.Vector3(c.x, H * 0.8, c.z + W * 2.2); break;
      case 'front': pos = new THREE.Vector3(c.x + L * 2.0, H * 0.8, c.z); break;
      default:      pos = new THREE.Vector3(c.x + L * 0.95 + 1.2, c.y + H * 1.7, c.z + W * 1.6);
    }
    camera.position.copy(pos);
    controls.target.copy(c);
    camera.lookAt(c);
    controls.update();
  }

  function addViewButtons() {
    if (!container || container.querySelector('#viewBtns')) return;
    var bar = document.createElement('div');
    bar.id = 'viewBtns';
    bar.style.cssText =
      'position:absolute;top:10px;right:12px;z-index:5;display:flex;gap:4px;' +
      'background:rgba(0,0,0,.45);padding:4px;border-radius:8px;';
    [['free', '自由'], ['top', '顶视'], ['side', '侧视'], ['front', '前视'], ['reset', '重置']]
      .forEach(function (b) {
        var btn = document.createElement('button');
        btn.textContent = b[1];
        btn.dataset.view = b[0];
        btn.style.cssText =
          'border:1px solid #3a4656;background:#232a34;color:#e8ecf1;border-radius:6px;' +
          'padding:4px 9px;font-size:12px;cursor:pointer;';
        btn.addEventListener('click', function () { setView(b[0] === 'reset' ? 'free' : b[0]); });
        bar.appendChild(btn);
      });
    container.appendChild(bar);
  }

  /* ---------- 拾取 ---------- */
  function setNdc(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pickMesh() {
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true); // 确保 mesh 矩阵最新 (rAF 节流/刚改数据后也可拾取)
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects([cargoGroup, stagingGroup], true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && !o.userData.placement && !o.userData.staging && o.parent) o = o.parent;
      if (o && (o.userData.placement || o.userData.staging)) return o;
    }
    return null;
  }

  /* ---------- 悬停 ---------- */
  function setHover(mesh) {
    if (hovered === mesh) return;
    if (hovered && hovered !== drag && hovered !== selected) {
      hovered.material.color.setHex(hovered.userData.baseColor);
      hovered.userData.edgeMat.color.setHex(0x222831);
    }
    hovered = mesh;
    if (mesh && mesh !== drag && mesh !== selected) {
      mesh.material.color.setHex(0xffd76a);
      mesh.userData.edgeMat.color.setHex(0xffffff);
    }
  }

  function tooltipText(p) {
    var dxx = p.dx !== undefined ? p.dx : p.l;
    var dyy = p.dy !== undefined ? p.dy : p.h;
    var dzz = p.dz !== undefined ? p.dz : p.w;
    var s = (p.name || '货物') + '<br>' + fmtLenSafe(dxx) + ' × ' + fmtLenSafe(dyy) + ' × ' + fmtLenSafe(dzz) +
      (p.weight ? ' · ' + fmtWtSafe(p.weight) : '');
    if (p.group && p.group > 0 && window.Planner && Planner.getGroups) {
      var g = Planner.getGroups().filter(function (x) { return x.idx === p.group; })[0];
      s += '<br>🚚 组' + p.group + (g && g.name ? ' · ' + g.name : '');
    }
    return s;
  }

  function showTooltip(html, x, y) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.left = (x + 14) + 'px';
    tooltipEl.style.top = (y + 14) + 'px';
    tooltipEl.style.display = 'block';
  }
  function hideTooltip() { tooltipEl.style.display = 'none'; }

  /* ---------- 拖拽 ---------- */
  function stackHeight(x, z, dx, dz, ignoreId) {
    var h = 0;
    (Planner.placements || []).forEach(function (p) {
      if (p.id === ignoreId) return;
      if (p.x + p.dx <= x || x + dx <= p.x) return;
      if (p.z + p.dz <= z || z + dz <= p.z) return;
      if (p.y + p.dy > h) h = p.y + p.dy;
    });
    return h;
  }

  function setDragColor(valid) {
    if (!drag) return;
    var hex = valid ? drag.mesh.userData.baseColor : 0xe74c3c;
    drag.mesh.material.color.setHex(hex);
    drag.mesh.userData.edgeMat.color.setHex(valid ? 0x222831 : 0xff0000);
  }

  /* ---------- 幽灵框: 推挤/落位预告 (视觉层 @web-design-01) ----------
   * 消费 codex-02 的 drag.pushed(推挤落点) / drag.valid(当前位合法性):
   *   绿 = 当前位可落; 半透明蓝框 = 推挤落位预告; 红 = 推不动 */
  function ensureGhost() {
    if (ghostGroup) return ghostGroup;
    ghostGroup = new THREE.Group();
    ghostEdgeMat = new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.55 });
    ghostFillMat = new THREE.MeshLambertMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide });
    var geo = new THREE.BoxGeometry(1, 1, 1);
    ghostGroup.add(new THREE.Mesh(geo, ghostFillMat));
    ghostGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), ghostEdgeMat));
    ghostGroup.visible = false;
    ghostGroup.traverse(function (o) { o.raycast = function () {}; }); // 不参与拾取/拖拽
    scene.add(ghostGroup);
    return ghostGroup;
  }
  function showGhost(cx, cy, cz, dx, dy, dz, colorHex) {
    var g = ensureGhost();
    g.scale.set(cm(dx), cm(dy), cm(dz));
    g.position.set(cm(cx + dx / 2), cm(cy + dy / 2), cm(cz + dz / 2));
    ghostEdgeMat.color.setHex(colorHex);
    ghostFillMat.color.setHex(colorHex);
    ghostEdgeMat.opacity = (colorHex === 0xe74c3c) ? 0.6 : 0.5;
    g.visible = true;
  }
  function hideGhost() { if (ghostGroup) ghostGroup.visible = false; }
  function updateGhost() {
    if (!drag || !drag.moved) { hideGhost(); return; }
    var d = drag;
    if (d.pushed) {
      showGhost(d.pushed.x, Math.max(0, d.pushed.y), d.pushed.z, d.dx, d.dy, d.dz, 0x4da3ff);  // 半透明蓝 = 推挤落位预告
    } else if (d.valid) {
      var cx = Math.round(d.mesh.position.x * CM - d.dx / 2);
      var cy = Math.round(d.mesh.position.y * CM - d.dy / 2);
      var cz = Math.round(d.mesh.position.z * CM - d.dz / 2);
      showGhost(cx, Math.max(0, cy), cz, d.dx, d.dy, d.dz, 0x2ecc71);                          // 绿 = 当前位可落
    } else {
      var rx = Math.round(d.mesh.position.x * CM - d.dx / 2);
      var ry = Math.round(d.mesh.position.y * CM - d.dy / 2);
      var rz = Math.round(d.mesh.position.z * CM - d.dz / 2);
      showGhost(rx, Math.max(0, ry), rz, d.dx, d.dy, d.dz, 0xe74c3c);                          // 红 = 推不动
    }
  }

  function onPointerDown(e) {
    if (!renderer) return;
    if (playback && playback.playing) return;   // 动画播放中禁止拖拽
    setNdc(e);
    downPos = { x: e.clientX, y: e.clientY };
    var mesh = pickMesh();
    if (!mesh) { selected = null; return; }
    e.preventDefault();
    controls.enabled = false;
    var p = mesh.userData.placement;
    var isPlaced = !!p;
    var isStaging = !!mesh.userData.staging;
    if (!isPlaced && !isStaging) return;

    // 点击选中 (不立即拖, 移动超过阈值才开始拖)
    var dx = p ? p.dx : mesh.userData.cargo.l;
    var dy = p ? p.dy : mesh.userData.cargo.h;
    var dz = p ? p.dz : mesh.userData.cargo.w;
    drag = {
      mesh: mesh, kind: isPlaced ? 'placed' : 'staging',
      id: isPlaced ? p.id : null,
      cargoId: isPlaced ? p.cargoId : mesh.userData.cargo.cargoId,
      origX: mesh.position.x, origY: mesh.position.y, origZ: mesh.position.z,
      dx: dx, dy: dy, dz: dz, rotated: false, valid: true, moved: false, grabX: 0, grabZ: 0, overflowOk: false
    };
    hideGhost();
    // 抓取偏移: 记录指针地面投影与箱子底角(min角)的差值, 拖动中保持抓取点跟手
    // 高箱子从顶部抓取时偏移可达数米, 限制 ±150cm, 保证落点接近指针位置
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    var gpt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(planeY0, gpt)) {
      drag.grabX = clamp(gpt.x * CM - (mesh.position.x * CM - drag.dx / 2), -150, 150);
      drag.grabZ = clamp(gpt.z * CM - (mesh.position.z * CM - drag.dz / 2), -150, 150);
    }
    // 注意: 不在此设置 selected — 选中由 pointerup 的"纯点击"判定,
    // 否则点击时 pointerdown 先选中、pointerup 再判断"已选中"而取消
    // 拖拽中的箱提升层级, 避免被其他箱遮挡 (staging 箱留在 stagingGroup)
    if (isPlaced) { cargoGroup.remove(mesh); cargoGroup.add(mesh); }
    else { stagingGroup.remove(mesh); stagingGroup.add(mesh); }
  }

  function onPointerMove(e) {
    if (!renderer) return;
    setNdc(e);
    if (drag) {
      // 移动阈值: 超过 4px 才算拖
      if (!drag.moved) {
        var dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        if (dist < 4) return;
        drag.moved = true;
      }
      // 关键: 每帧用当前指针位置重算射线, 箱子才跟手
      camera.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(ndc, camera);
      var ray = raycaster.ray;
      var pt = new THREE.Vector3();
      var planeHit = ray.intersectPlane(planeY0, pt);
      if (!planeHit) return;
      // 减去抓取偏移 → 抓哪跟哪, 指针不跳
      var x = Math.round(pt.x * CM - drag.grabX);
      var z = Math.round(pt.z * CM - drag.grabZ);
      if (!truck) return;
      x = clamp(x, -150, truck.L + 150);
      z = clamp(z, -150, truck.W + 150);
      // 磁吸: 5cm 网格 + 壁面/邻箱贴面
      var sp = snapPos(x, z, drag.dx, drag.dz, drag.kind === 'placed' ? drag.id : null);
      x = sp.x; z = sp.z;
      // 超宽/超长自动居中 (平板车): 拖拽预览即吸附到对称居中位 (每边超限均匀)
      if (truck && Planner.centeredPlacement && Planner.allowOverflow &&
          (drag.dx > truck.L || drag.dz > truck.W)) {
        var cp = Planner.centeredPlacement({ x: x, y: 0, z: z, dx: drag.dx, dy: drag.dy, dz: drag.dz });
        x = cp.x; z = cp.z;
      }
      var y = stackHeight(x, z, drag.dx, drag.dz, drag.kind === 'placed' ? drag.id : null);
      y = Math.min(y, truck.H - drag.dy);
      // 重力: x/z 立即到位, y 用下坠动画
      drag.mesh.position.x = cm(x + drag.dx / 2);
      drag.mesh.position.z = cm(z + drag.dz / 2);
      fallTo(drag.mesh, cm(Math.max(0, y) + drag.dy / 2));

      var cand = {
        id: drag.id, cargoId: drag.cargoId,
        x: x, y: Math.max(0, y), z: z,
        dx: drag.dx, dy: drag.dy, dz: drag.dz
      };
      var v = Planner.validatePlacement(cand, drag.kind === 'placed' ? drag.id : null);
      // 超限(越界但非重叠) = 可放但标记; 只有重叠/尺寸非法才回弹
      var overflowOk = !v.ok && v.reason === '越界' && v.overflow && v.overflow.any;
      drag.valid = v.ok || overflowOk;
      drag.overflowOk = overflowOk;
      // 重叠 → 轻量推挤 (单次最小平移+一次支撑重算, 不迭代不沉降): 预告可推挤落点, 幽灵框视觉层消费
      drag.pushed = null;
      if (!v.ok && v.reason === '重叠' && Planner.pushOutOnce) {
        drag.pushed = Planner.pushOutOnce(cand);
        if (drag.pushed && truck) {
          drag.pushed.y = stackHeight(drag.pushed.x, drag.pushed.z, drag.dx, drag.dz, drag.kind === 'placed' ? drag.id : null);
          drag.pushed.y = Math.min(drag.pushed.y, truck.H - drag.dy);
        }
      }
      setDragColor(drag.valid);
      // 超限标记: 拖拽中实时显示 超高/超宽/超长 (允许超限时 v.ok 仍为 true)
      updateDragMarker(cand, v.overflow);
      if (v.overflow && v.overflow.any) {
        drag.mesh.userData.edgeMat.color.setHex(0xff2222);
      } else if (v.ok) {
        drag.mesh.userData.edgeMat.color.setHex(0x222831);
      }
      if (v.ok) {
        hideTooltip();
      } else if (drag.pushed) {
        showTooltip('↔ 重叠可推挤 → (' + Math.round(drag.pushed.x) + ',' + Math.round(drag.pushed.z) + ')，松手落位', e.clientX, e.clientY);
      } else {
        showTooltip('⚠️ ' + v.reason + '，松手回弹', e.clientX, e.clientY);
      }
      updateGhost();
      return;
    }
    // 悬停
    var mesh = pickMesh();
    setHover(mesh);
    if (mesh) {
      var p = mesh.userData.placement || mesh.userData.cargo;
      showTooltip(tooltipText(p), e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  }

  function onPointerUp(e) {
    if (!drag) { controls.enabled = true; return; }
    var d = drag;
    drag = null;
    controls.enabled = true;
    hideTooltip();
    clearDragMarker();
    hideGhost();
    setHover(null);

    if (!d.moved) {
      // 纯点击: 单选 (已选中则取消); Shift+点击: 多选切换
      if (d.kind === 'placed') {
        if (e.shiftKey) {
          if (selectedSet.has(d.mesh)) { selectedSet.delete(d.mesh); }
          else { selectedSet.add(d.mesh); }
          selected = selectedSet.size ? d.mesh : null;
        } else {
          var isSame = selected === d.mesh && selectedSet.size === 1;
          selectedSet.clear();
          if (!isSame) { selected = d.mesh; selectedSet.add(d.mesh); }
          else { selected = null; }
        }
      } else {
        selectedSet.clear();
        selected = null;
      }
      applySelectionHighlights();
      return;
    }

    // 拖拽结束: 提交 (先把 y 吸附到最终堆叠顶面, 防止松手半空悬浮)
    var px = Math.round(d.mesh.position.x * CM - d.dx / 2);
    var pz = Math.round(d.mesh.position.z * CM - d.dz / 2);
    var fy = 0;
    if (truck) {
      fy = stackHeight(px, pz, d.dx, d.dz, d.kind === 'placed' ? d.id : null);
      fy = Math.min(fy, truck.H - d.dy);
    }
    d.mesh.position.y = cm(Math.max(0, fy) + d.dy / 2);
    var p = { x: px, y: Math.round(d.mesh.position.y * CM - d.dy / 2), z: pz };

    if (d.kind === 'placed') {
      // 拖出判定: 允许超限的车 → 足迹完全离开车厢才算删除; 否则沿用 ±100cm 容差
      var outside;
      if (truck && Planner.allowOverflow) {
        outside = !truck || p.x + d.dx <= 0 || p.x >= truck.L || p.z + d.dz <= 0 || p.z >= truck.W;
      } else {
        outside = !truck || p.x < -100 || p.x > truck.L + 100 || p.z < -100 || p.z > truck.W + 100;
      }
      if (outside) {
        Planner.removePlacement(d.id);           // 拖出车厢 = 删除(回待拖区)
      } else if (d.valid) {
        // 超限可放: 确保允许超限, 落位后由标记展示超出量
        if (d.overflowOk && !Planner.allowOverflow) Planner.setAllowOverflow(true);
        // 超宽/超长提交前再次居中 (与拖拽预览一致)
        if (truck && Planner.centeredPlacement && Planner.allowOverflow &&
            (d.dx > truck.L || d.dz > truck.W)) {
          var cp2 = Planner.centeredPlacement({ x: p.x, y: p.y, z: p.z, dx: d.dx, dy: d.dy, dz: d.dz });
          p.x = cp2.x; p.z = cp2.z;
        }
        var ok = Planner.updatePlacement(d.id, { x: p.x, y: p.y, z: p.z });
        if (!ok) d.mesh.position.set(d.origX, d.origY, d.origZ); // 理论不发生, 兜底回弹
      } else {
        // 重叠/非法 → 解析式推挤 (确定性: 推挤→重算支撑→沉降, 上限3次); 推不动才回弹
        var rp = (truck && Planner.resolvePushOut) ? Planner.resolvePushOut(
          { id: d.id, x: p.x, y: Math.max(0, p.y), z: p.z, dx: d.dx, dy: d.dy, dz: d.dz }, 3) : null;
        if (rp) {
          // 平板超限居中优先级 > 支撑居中 (与拖拽预览一致, 不互相覆盖)
          if (truck && Planner.centeredPlacement && Planner.allowOverflow &&
              (d.dx > truck.L || d.dz > truck.W)) {
            var cp3 = Planner.centeredPlacement({ x: rp.x, y: rp.y, z: rp.z, dx: d.dx, dy: d.dy, dz: d.dz });
            rp.x = cp3.x; rp.z = cp3.z;
          }
          var okR = Planner.updatePlacement(d.id, { x: rp.x, y: rp.y, z: rp.z });
          if (okR) {
            d.mesh.position.set(cm(rp.x + d.dx / 2), cm(rp.y + d.dy / 2), cm(rp.z + d.dz / 2));
            showTooltip('✓ 已推挤落位 (' + Math.round(rp.x) + ',' + Math.round(rp.z) + ')', e.clientX, e.clientY);
          } else {
            d.mesh.position.set(d.origX, d.origY, d.origZ); // 理论不发生, 兜底回弹
          }
        } else {
          d.mesh.position.set(d.origX, d.origY, d.origZ);          // 推不动 → 回弹
          setDragColor(true);
        }
      }
    } else {
      // staging: 校验通过(含平板车超限可放)且箱子确实落在车板上 → 添加
      var cand = { cargoId: d.cargoId, x: p.x, y: Math.max(0, p.y), z: p.z, dx: d.dx, dy: d.dy, dz: d.dz };
      var v = Planner.validatePlacement(cand, null);
      var hasOverflow = !!(v && v.overflow && v.overflow.any);
      var ovRelax = hasOverflow && Planner.allowOverflow;   // 平板车: 超限可放, 放宽边界判定
      var TOL = 2;                                          // 边界容差 cm (原 ±1 易误触)
      var cx = p.x + d.dx / 2, cz = p.z + d.dz / 2;         // 箱子中心
      var centerOk = truck && cx >= -100 && cx <= truck.L + 100 && cz >= -100 && cz <= truck.W + 100;
      var footOk = (p.x >= -TOL && p.x + d.dx <= truck.L + TOL && p.z >= -TOL && p.z + d.dz <= truck.W + TOL) || ovRelax;
      var hOk = p.y >= -TOL && (p.y + d.dy <= truck.H + TOL || ovRelax);
      var inTruck = centerOk && footOk && hOk;
      if (v.ok && inTruck) {
        var np = Planner.addPlacement(cand);   // 最终校验(集装箱超限在此被拒, 平板车放行)
        if (!np) d.mesh.position.set(d.origX, d.origY, d.origZ);
      } else {
        // 重叠 → 解析式推挤后提交 (新箱从待拖区拖入同样过推挤); 推不动才回弹
        var rp2 = (truck && Planner.resolvePushOut) ? Planner.resolvePushOut(
          { x: p.x, y: Math.max(0, p.y), z: p.z, dx: d.dx, dy: d.dy, dz: d.dz }, 3) : null;
        var np2 = null;
        if (rp2) {
          if (truck && Planner.centeredPlacement && Planner.allowOverflow &&
              (d.dx > truck.L || d.dz > truck.W)) {
            var cp4 = Planner.centeredPlacement({ x: rp2.x, y: rp2.y, z: rp2.z, dx: d.dx, dy: d.dy, dz: d.dz });
            rp2.x = cp4.x; rp2.z = cp4.z;
          }
          np2 = Planner.addPlacement({ cargoId: d.cargoId, x: rp2.x, y: rp2.y, z: rp2.z, dx: d.dx, dy: d.dy, dz: d.dz });
        }
        if (np2) {
          d.mesh.position.set(cm(rp2.x + d.dx / 2), cm(rp2.y + d.dy / 2), cm(rp2.z + d.dz / 2));
          showTooltip('✓ 已推挤落位 (' + Math.round(rp2.x) + ',' + Math.round(rp2.z) + ')', e.clientX, e.clientY);
        } else {
          d.mesh.position.set(d.origX, d.origY, d.origZ);
          setDragColor(true);
        }
      }
    }
    // 注: 支撑变化后的重力沉降由 data.js 的 settleGravity() 在 update/removePlacement 内统一处理
  }

  function rotateDrag() {
    if (!drag) return;
    var tmp = drag.dx; drag.dx = drag.dz; drag.dz = tmp;
    drag.rotated = !drag.rotated;
    // 重建几何
    var mesh = drag.mesh;
    var oldGeo = mesh.geometry;
    var geo = new THREE.BoxGeometry(cm(drag.dx), cm(drag.dy), cm(drag.dz));
    mesh.geometry = geo;
    if (oldGeo) oldGeo.dispose();
    var oldEdges = mesh.userData.edges;
    mesh.remove(oldEdges);
    var edgeMat = new THREE.LineBasicMaterial({ color: 0x222831, transparent: true, opacity: 0.5 });
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    mesh.add(edges);
    mesh.userData.edges = edges;
    mesh.userData.edgeMat = edgeMat;
    if (truck) {
      var x = Math.round(mesh.position.x * CM - drag.dx / 2);
      var z = Math.round(mesh.position.z * CM - drag.dz / 2);
      // 旋转后若超宽/超长 → 重新居中 (平板车)
      if (Planner.centeredPlacement && Planner.allowOverflow &&
          (drag.dx > truck.L || drag.dz > truck.W)) {
        var cp = Planner.centeredPlacement({ x: x, y: 0, z: z, dx: drag.dx, dy: drag.dy, dz: drag.dz });
        x = cp.x; z = cp.z;
      }
      var y = stackHeight(x, z, drag.dx, drag.dz, drag.kind === 'placed' ? drag.id : null);
      y = Math.min(y, truck.H - drag.dy);
      drag.mesh.position.set(cm(x + drag.dx / 2), cm(y + drag.dy / 2), cm(z + drag.dz / 2));
      var v = Planner.validatePlacement({ id: drag.id, cargoId: drag.cargoId, x: x, y: Math.max(0, y), z: z, dx: drag.dx, dy: drag.dy, dz: drag.dz },
        drag.kind === 'placed' ? drag.id : null);
      drag.valid = v.ok;
      // 旋转后同样走轻量推挤预告 (与鼠标拖拽同契约, 松手时 resolvePushOut 收口)
      drag.pushed = null;
      if (!v.ok && v.reason === '重叠' && Planner.pushOutOnce) {
        drag.pushed = Planner.pushOutOnce({ x: x, y: Math.max(0, y), z: z, dx: drag.dx, dy: drag.dy, dz: drag.dz });
        if (drag.pushed) {
          drag.pushed.y = stackHeight(drag.pushed.x, drag.pushed.z, drag.dx, drag.dz, drag.kind === 'placed' ? drag.id : null);
          drag.pushed.y = Math.min(drag.pushed.y, truck.H - drag.dy);
        }
      }
      setDragColor(v.ok);
      updateGhost();
    }
  }

  /* ---------- 键盘 / 右键 ---------- */
  function onKeyDown(e) {
    if (e.key === 'r' || e.key === 'R') {
      if (drag) { rotateDrag(); e.preventDefault(); return; }
      if (selected && selected.userData.placement) {
        var p = selected.userData.placement;
        var cand = { id: p.id, cargoId: p.cargoId, x: p.x, y: p.y, z: p.z, dx: p.dz, dy: p.dy, dz: p.dx };
        var v = Planner.validatePlacement(cand, p.id);
        if (v.ok) {
          Planner.updatePlacement(p.id, { dx: p.dz, dz: p.dx });
          // 旋转后 mesh 被重建, 重新指向新 mesh (多选集合同步替换)
          var entry = placeMeshes.get(p.id);
          if (entry) {
            if (selectedSet.has(selected)) { selectedSet.delete(selected); selectedSet.add(entry.mesh); }
            selected = entry.mesh;
            applySelectionHighlights();
          }
        } else {
          showTooltip('⚠️ ' + v.reason + '，无法旋转', 0, 0);
        }
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedSet.size) {
        // 批量删除所有选中箱
        selectedSet.forEach(function (mesh) {
          var pid = mesh.userData.placement && mesh.userData.placement.id;
          if (pid) Planner.removePlacement(pid);
        });
        selectedSet.clear();
        selected = null;
      }
    }
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (selectedSet.size) {
      // 右键: 批量删除所有选中箱
      selectedSet.forEach(function (mesh) {
        var pid = mesh.userData.placement && mesh.userData.placement.id;
        if (pid) Planner.removePlacement(pid);
      });
      selectedSet.clear();
      selected = null;
    }
  }

  /* ---------- 装载顺序动画 (借鉴 EasyCargo 逐步装载) ---------- */
  var playback = null;        // { idx, total, timer, playing, finished, showUpTo }
  var playbackBar = null, sceneTools = null, helpPanel = null;

  function startPlayback() {
    if (!truck || !window.Planner || !Planner.placements || !Planner.placements.length) return;
    if (playback && playback.playing) { stopPlayback(false); return; }
    var order = {};
    Planner.placements.forEach(function (p, i) { order[p.id] = i; });
    var total = Planner.placements.length;
    var idx = (playback && playback.finished) ? -1 : (playback ? playback.idx : -1);
    if (!playback) playback = {};
    playback.total = total;
    playback.playing = true;
    playback.finished = false;
    playback.order = order;
    playback.showUpTo = function (i) {
      placeMeshes.forEach(function (entry, id) {
        var oi = order[id];
        var show = oi !== undefined && oi <= i;
        if (show && !entry.mesh.visible) {
          entry.mesh.visible = true;
          var ty = entry.mesh.position.y;         // 下落动画
          entry.mesh.position.y = ty + 1.2;
          fallTo(entry.mesh, ty, 0.25);
        } else if (!show) {
          entry.mesh.visible = false;
        }
      });
    };
    function tick() {
      idx++;
      playback.idx = idx;
      playback.showUpTo(idx);
      updatePlaybackUI();
      if (idx >= total - 1) stopPlayback(true);
    }
    if (playback.timer) clearInterval(playback.timer);
    playback.timer = setInterval(tick, 650);
    controls.enabled = false;
    if (playbackBar) playbackBar.style.display = 'flex';
    playback.idx = -1;
    updatePlaybackUI();
    tick();
  }
  function stopPlayback(finished) {
    if (!playback) return;
    clearInterval(playback.timer);
    playback.timer = null;
    playback.playing = false;
    if (finished) playback.finished = true;
    controls.enabled = true;
    updatePlaybackUI();
  }
  function resetPlayback() {
    if (playback) { clearInterval(playback.timer); playback.timer = null; }
    playback = null;
    placeMeshes.forEach(function (entry) { entry.mesh.visible = true; });
    if (playbackBar) playbackBar.style.display = 'none';
    controls.enabled = true;
  }
  function stepPlayback(delta) {
    if (!playback) return;
    var idx = playback.idx + delta;
    idx = Math.max(-1, Math.min(playback.total - 1, idx));
    playback.idx = idx;
    playback.showUpTo(idx);
    updatePlaybackUI();
    if (idx >= playback.total - 1) playback.finished = true;
    else playback.finished = false;
  }
  function updatePlaybackUI() {
    if (!playbackBar || !playback) return;
    var el = playbackBar.querySelector('#pbProg');
    if (el) el.textContent = (playback.idx + 1) + ' / ' + playback.total;
  }

  /* ---------- 3D 截图导出 ---------- */
  function downloadSnapshot() {
    if (!renderer) return;
    renderer.render(scene, camera);
    var url = renderer.domElement.toDataURL('image/png');
    var a = document.createElement('a');
    a.download = '装载方案_' + (Planner.truck ? Planner.truck.name : '') + '_' +
      new Date().toISOString().slice(0, 10) + '.png';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 300);
  }

  /* ---------- 场景工具条 / 帮助 ---------- */
  function addSceneTools() {
    if (!container || container.querySelector('#sceneTools')) return;
    sceneTools = document.createElement('div');
    sceneTools.id = 'sceneTools';
    sceneTools.style.cssText =
      'position:absolute;left:12px;bottom:12px;z-index:5;display:flex;gap:6px;' +
      'background:rgba(0,0,0,.45);padding:5px;border-radius:10px;';
    var btnStyle =
      'border:1px solid #3a4656;background:#232a34;color:#e8ecf1;border-radius:7px;' +
      'padding:5px 11px;font-size:12px;cursor:pointer;';
    [['▶ 装载动画', startPlayback], ['📷 截图', downloadSnapshot], ['🔢 编号', toggleNumbers], ['❓ 快捷键', toggleHelp]].forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b[0];
      btn.style.cssText = btnStyle;
      btn.addEventListener('click', b[1]);
      sceneTools.appendChild(btn);
    });
    container.appendChild(sceneTools);

    // 播放控制条
    playbackBar = document.createElement('div');
    playbackBar.id = 'playbackBar';
    playbackBar.style.cssText =
      'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:6;display:none;gap:6px;align-items:center;' +
      'background:rgba(15,20,28,.92);padding:6px 12px;border-radius:10px;border:1px solid #3a4656;color:#e8ecf1;font-size:12px;';
    var mk = function (label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'border:1px solid #4da3ff;background:#1d2936;color:#fff;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;';
      b.addEventListener('click', fn);
      playbackBar.appendChild(b);
    };
    mk('⏸ 暂停', function () { stopPlayback(false); });
    mk('◀', function () { stepPlayback(-1); });
    mk('▶', function () { stepPlayback(1); });
    mk('⏹ 结束', resetPlayback);
    var prog = document.createElement('span');
    prog.id = 'pbProg';
    prog.style.cssText = 'color:#9fd0ff;min-width:64px;text-align:center;';
    playbackBar.appendChild(prog);
    container.appendChild(playbackBar);

    // 帮助面板
    helpPanel = document.createElement('div');
    helpPanel.id = 'helpPanel';
    helpPanel.style.cssText =
      'position:absolute;left:12px;bottom:52px;z-index:6;display:none;' +
      'background:rgba(15,20,28,.94);border:1px solid #3a4656;border-radius:10px;padding:10px 14px;' +
      'color:#e8ecf1;font-size:12px;line-height:1.8;max-width:280px;';
    helpPanel.innerHTML =
      '<b>快捷键 & 操作</b><br>' +
      '🖱 空白处拖动：旋转视角<br>' +
      '📦 拖箱子：放入车厢 / 移出删除<br>' +
      'Shift+点击：多选箱子<br>' +
      'R：旋转朝向 · Delete：删除选中<br>' +
      '🖱 右键：批量删除选中<br>' +
      '🎥 右上角：自由/顶/侧/前视图<br>' +
      '▶ 装载动画：按装载顺序逐件放入';
    container.appendChild(helpPanel);
  }
  function toggleHelp() {
    if (helpPanel) helpPanel.style.display = helpPanel.style.display === 'block' ? 'none' : 'block';
  }

  /* ---------- 对外 API ---------- */
  function init(el) {
    container = typeof el === 'string' ? document.getElementById(el) : el;
    if (!container) { console.error('[scene3d] container not found'); return; }
    if (typeof THREE === 'undefined') {
      container.innerHTML = '⚠ Three.js 加载失败（CDN 不可用），请检查网络后刷新。';
      return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1f24);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.95));
    var dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(6, 12, 8);
    scene.add(dir);

    truckGroup = new THREE.Group(); scene.add(truckGroup);
    cargoGroup = new THREE.Group(); scene.add(cargoGroup);
    stagingGroup = new THREE.Group(); scene.add(stagingGroup);
    markerGroup = new THREE.Group(); scene.add(markerGroup);
    cgGroup = new THREE.Group(); scene.add(cgGroup);
    numGroup = new THREE.Group(); scene.add(numGroup);

    tooltipEl = document.createElement('div');
    tooltipEl.style.cssText =
      'position:fixed;pointer-events:none;z-index:999;display:none;' +
      'background:rgba(15,20,28,.92);color:#e8edf3;padding:6px 10px;border-radius:6px;' +
      'font:12px/1.5 -apple-system,"PingFang SC",sans-serif;border:1px solid #3a4656;';
    document.body.appendChild(tooltipEl);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onWindowResize);
    onWindowResize();
    addViewButtons();
    addSceneTools();

    // 初始数据 (main.js 会随后 setTruck/setCargo/setPlacements; 这里先兜底)
    if (window.Planner && Planner.truck) {
      setTruck(Planner.truck);
      setCargo(Planner.cargo);
      setPlacements(Planner.placements);
    } else {
      // 演示数据: 无 Planner 时独立渲染验证
      setTruck({ id: 'demo', name: '40HQ 集装箱', L: 1203, W: 235, H: 269, maxWeight: 26500, type: 'container' });
      setCargo([{ id: 'c1', name: '纸箱A', l: 60, w: 40, h: 40, weight: 25, qty: 10, color: '#e74c3c' }]);
      setPlacements([
        { id: 'p1', cargoId: 'c1', name: '纸箱A', x: 0, y: 0, z: 0, dx: 60, dy: 40, dz: 40, weight: 25, color: '#e74c3c' },
        { id: 'p2', cargoId: 'c1', name: '纸箱A', x: 60, y: 0, z: 0, dx: 60, dy: 40, dz: 40, weight: 25, color: '#e74c3c' },
        { id: 'p3', cargoId: 'c1', name: '纸箱A', x: 0, y: 40, z: 40, dx: 60, dy: 40, dz: 40, weight: 25, color: '#e74c3c' }
      ]);
    }
    setView('free');

    // 单位切换 → 重建尺寸标注 (truckGroup 含标签)
    if (window.Planner && Planner.on) {
      Planner.on('units', function () { if (truck) buildTruck(truck); });
    }

    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      settleFalls();
      renderer.render(scene, camera);
    })();
  }

  function setTruck(t) {
    truck = t;
    drag = null; selected = null; hovered = null;
    selectedSet.clear();
    placeMeshes.clear();
    clearGroup(cargoGroup);
    clearGroup(stagingGroup);
    if (markerGroup) { clearGroup(markerGroup); markers.clear(); }
    if (cgGroup) clearGroup(cgGroup);
    if (numGroup) clearGroup(numGroup);
    clearDragMarker();
    buildTruck(t);
    buildStaging();
    if (camera) setView('free');
  }

  function setCargo(cargo) { buildStaging(); }
  function setPlacements(list) { syncPlacements(list); }

  window.Scene3D = {
    init: init,
    setTruck: setTruck,
    setCargo: setCargo,
    setPlacements: setPlacements,
    setView: setView,
    resetView: function () { setView('free'); },
    // 兼容别名
    syncPlacements: syncPlacements,
    syncCargo: setCargo
  };
})();
