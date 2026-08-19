/* =========================================================================
 * ui.js — 左侧面板 + 结果栏 + 导出/打印  (@car-box-02)
 * 依赖: data.js (window.Planner)
 * 对外暴露: window.PlannerUI.init(panelEl)
 * 只操作 #panel 内部 DOM; 3D 场景容器由 index.html 提供 (#scene-container)
 * ========================================================================= */
(function () {
  'use strict';

  var QUICK_SIZES = [
    { name: '托盘 120×80', l: 120, w: 80, h: 120, weight: 800 },
    { name: '纸箱 60×40×40', l: 60, w: 40, h: 40, weight: 25 },
    { name: '纸箱 80×60×60', l: 80, w: 60, h: 60, weight: 30 },
    { name: '编织袋 90×50×40', l: 90, w: 50, h: 40, weight: 50 },
    { name: '木箱 120×80×100', l: 120, w: 80, h: 100, weight: 300 },
    { name: '圆桶 φ60×90', l: 60, w: 60, h: 90, weight: 180 }
  ];

  var root = null;      // #panel 容器
  var editId = null;    // 正在编辑的 cargo id

  /* ---------- 构建 DOM ---------- */
  function build() {
    root.innerHTML =
      '<div class="panel-section">' +
      '  <h3>🚚 车型信息</h3>' +
      '  <div id="truckInfo" class="truck-info"></div>' +
      '  <button id="btnCustomTruck" class="btn btn-ghost w100">✏️ 自定义车型…</button>' +
      '  <div id="customTruckForm" class="hidden">' +
      '    <div class="fld"><label>车型名称</label><input id="ctName" type="text" value="自定义车型"></div>' +
      '    <div class="fld"><label>车型类型</label><select id="ctType">' +
      '      <option value="van">厢式（超限不可装）</option>' +
      '      <option value="container">集装箱（超限不可装）</option>' +
      '      <option value="flatbed">平板（可装超限并标记）</option>' +
      '    </select></div>' +
      '    <div class="row3">' +
      '    <div class="fld"><label>货箱长</label><input id="ctL" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(960) + '" value="' + Planner.lenDisp(960) + '"></div>' +
      '    <div class="fld"><label>货箱宽</label><input id="ctW" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(235) + '" value="' + Planner.lenDisp(235) + '"></div>' +
      '    <div class="fld"><label>货箱高</label><input id="ctH" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(245) + '" value="' + Planner.lenDisp(245) + '"></div>' +
      '    </div>' +
      '    <div class="row2">' +
      '      <div class="fld"><label>最大载重</label><input id="ctWeight" type="number" min="0.001" placeholder="如 ' + Planner.wtDisp(15000) + '" value="' + Planner.wtDisp(15000) + '"></div>' +
      '      <div class="fld"><label>&nbsp;</label><button id="btnApplyCustom" class="btn btn-primary w100">应用</button></div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      '<div class="panel-section">' +
      '  <h3>📦 货物管理</h3>' +
      '  <div class="hint" id="unitHint">尺寸单位 <b>' + lenSym() + '</b>，重量单位 <b>' + wtSym() + '</b>（顶部可切换）。<br>🚫 物理规则：货物是实体<b>不可重叠</b> · 受地心引力<b>不可悬空</b>。</div>' +
      '  <div id="cargoForm">' +
      '    <div class="fld"><label>货物名称</label><input id="cfName" type="text" placeholder="如 纸箱A / 托盘 / 桶装" value="纸箱"></div>' +
      '    <div class="row3">' +
      '      <div class="fld"><label>长</label><input id="cfL" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(60) + '" value="' + Planner.lenDisp(60) + '"></div>' +
      '      <div class="fld"><label>宽</label><input id="cfW" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(40) + '" value="' + Planner.lenDisp(40) + '"></div>' +
      '      <div class="fld"><label>高</label><input id="cfH" type="number" min="0.01" placeholder="如 ' + Planner.lenDisp(40) + '" value="' + Planner.lenDisp(40) + '"></div>' +
      '    </div>' +
      '    <div class="row3">' +
      '      <div class="fld"><label>单件重</label><input id="cfWeight" type="number" min="0.001" placeholder="如 ' + Planner.wtDisp(25) + '" value="' + Planner.wtDisp(25) + '"></div>' +
      '      <div class="fld"><label>数量 (件)</label><input id="cfQty" type="number" min="1" placeholder="如 10" value="10"></div>' +
      '      <div class="fld"><label>&nbsp;</label><button id="btnAddCargo" class="btn btn-primary w100">添加</button></div>' +
      '    </div>' +
      '    <div class="row2">' +
      '      <div class="fld"><label>卸货分组</label><select id="cfGroup"></select></div>' +
      '      <div class="fld"><label>&nbsp;</label><button id="btnSaveLib" class="btn btn-ghost w100" title="把当前表单保存为常用货物">⭐ 存常用</button></div>' +
      '    </div>' +
      '    <div id="quickSizes" class="quick-sizes"></div>' +
      '  </div>' +
      '  <div id="groupBar" class="group-bar"></div>' +
      '  <div class="batch-bar">' +
      '    <label class="chk chk-inline"><input type="checkbox" id="chkSelectAll"> 全选</label>' +
      '    <button id="btnBatchDel" class="btn btn-danger btn-xs" disabled>🗑 批量删除</button>' +
      '  </div>' +
      '  <ul id="cargoList" class="cargo-list"></ul>' +
      '</div>' +

      '<div class="panel-section">' +
      '  <h3>⚙️ 选项</h3>' +
      '  <label class="chk"><input type="checkbox" id="chkAutoPack" checked> 添加/编辑货物后自动装载</label>' +
      '</div>' +

      '<div class="panel-section">' +
      '  <h3>📚 常用货物库</h3>' +
      '  <div id="libList" class="quick-sizes"></div>' +
      '</div>' +

      '<div class="panel-section">' +
      '  <h3>📊 装载结果</h3>' +
      '  <div id="strategyBar" class="strategy-bar"></div>' +
      '  <div id="statsBar"></div>' +
      '  <div id="unplacedBox" class="unplaced hidden"></div>' +
      '</div>';
  }

  /* ---------- 渲染 ---------- */
  function renderTruckSelect() {
    var sel = q('#truckSelect');
    if (!sel) return;
    var list = Planner.getTruckList();
    sel.innerHTML = list.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === Planner.truck.id ? ' selected' : '') + '>' +
             t.name + ' (' + fmtLen(t.L) + '×' + fmtLen(t.W) + '×' + fmtLen(t.H) + ' / ' + fmtWt(t.maxWeight) + ')</option>';
    }).join('');
  }

  function renderTruckInfo() {
    var el = q('#truckInfo');
    var t = Planner.truck;
    var typeName = { container: '集装箱', van: '厢式', flatbed: '平板', custom: '自定义' }[t.type] || t.type;
    el.innerHTML =
      '<div class="ti-row"><span>内尺寸</span><b>' + fmtLen(t.L) + ' × ' + fmtLen(t.W) + ' × ' + fmtLen(t.H) + '</b></div>' +
      '<div class="ti-row"><span>容积</span><b>' + ((t.L * t.W * t.H) / 1e6).toFixed(1) + ' m³</b></div>' +
      '<div class="ti-row"><span>载重</span><b>' + fmtWt(t.maxWeight) + '</b></div>' +
      '<div class="ti-row"><span>类型</span><b>' + typeName + '</b></div>' +
      '<div class="ti-row"><span>超限装载</span><b class="' + (Planner.allowOverflow ? 'over-ok' : 'over-no') + '">' + (Planner.allowOverflow ? '✓ 允许（超限标记）' : '✗ 不允许（自动弹回）') + '</b></div>';
  }

  function renderQuickSizes() {
    var el = q('#quickSizes');
    el.innerHTML = QUICK_SIZES.map(function (qs, i) {
      return '<button class="chip" data-idx="' + i + '" title="' + qs.name + ' ' + fmtLen(qs.l) + '×' + fmtLen(qs.w) + '×' + fmtLen(qs.h) + ' ' + fmtWt(qs.weight) + '">' + qs.name + '</button>';
    }).join('');
  }

  function renderCargoList() {
    var el = q('#cargoList');
    var list = Planner.cargo;
    if (!list.length) {
      el.innerHTML = '<li class="empty">还没有货物，添加一种开始吧</li>';
      updateBatchBar();
      return;
    }
    el.innerHTML = list.map(function (c) {
      var subtotal = c.weight * c.qty;
      var badge = '';
      var co = Planner.cargoOverflow(c);
      if (co) {
        var parts = [];
        if (co.overHgt > 0) parts.push('超高 ' + fmtLen(co.overHgt));
        if (co.overWid > 0) parts.push('超宽 ' + fmtLen(co.overWid));
        if (co.overLen > 0) parts.push('超长 ' + fmtLen(co.overLen));
        badge = '<span class="over-badge">⚠️ ' + parts.join(' / ') + '</span>';
      }
      var gBadge = c.group ? '<span class="g-badge">组' + c.group + '</span>' : '';
      var checked = selSet[c.id] ? ' checked' : '';
      return '<li class="cargo-item' + (selSet[c.id] ? ' sel' : '') + '" data-id="' + c.id + '">' +
        '<input type="checkbox" class="ci-check" data-check="' + c.id + '"' + checked + ' title="多选">' +
        '<span class="swatch" style="background:' + c.color + '"></span>' +
        '<span class="ci-main">' +
        '  <span class="ci-name">' + esc(c.name) + ' ' + gBadge + '</span>' +
        badge +
        '  <span class="ci-sub">' + fmtLen(c.l) + '×' + fmtLen(c.w) + '×' + fmtLen(c.h) + ' · ' + fmtWt(c.weight) + ' × ' + c.qty + ' · 小计 ' + fmtWt(subtotal) + '</span>' +
        '</span>' +
        '<span class="ci-actions">' +
        '  <button class="mini" data-act="edit" title="编辑">✎</button>' +
        '  <button class="mini danger" data-act="del" title="删除">✕</button>' +
        '</span>' +
        '</li>';
    }).join('');
    updateBatchBar();
  }

  /* ---------- 多选 / 批量删除 ---------- */
  var selSet = {};   // cargoId -> true
  function updateBatchBar() {
    var ids = Object.keys(selSet);
    var btn = q('#btnBatchDel');
    var all = q('#chkSelectAll');
    if (btn) {
      btn.disabled = ids.length === 0;
      btn.textContent = '🗑 批量删除' + (ids.length ? ' (' + ids.length + ')' : '');
    }
    if (all) {
      var total = Planner.cargo.length;
      all.checked = total > 0 && ids.length === total;
      all.indeterminate = ids.length > 0 && ids.length < total;
    }
  }
  function batchDelete() {
    var ids = Object.keys(selSet);
    if (!ids.length) return;
    var names = ids.map(function (id) {
      var c = Planner.cargo.filter(function (x) { return x.id === id; })[0];
      return c ? c.name : id;
    }).join('、');
    if (!confirm('删除选中的 ' + ids.length + ' 种货物（' + names + '）？已摆放的箱子也会移除。')) return;
    ids.forEach(function (id) {
      Planner.removeCargo(id);
      delete selSet[id];
    });
    renderAll();
  }

  function renderStats() {
    var el = q('#statsBar');
    if (!el) return;
    updateHistoryButtons();
    var s = Planner.getStats();
    var utilCls = s.volumeUtilPct >= 85 ? 'good' : (s.volumeUtilPct >= 70 ? 'mid' : 'low');
    var overCls = s.overweight ? ' over' : '';
    var remainM3 = (s.remainVol / 1e6).toFixed(1);

    el.innerHTML =
      '<div class="stat-row"><span>已装件数</span><b>' + s.placedCount + ' / ' + s.totalQty + '</b></div>' +
      '<div class="stat-row"><span>体积利用率</span><b class="' + utilCls + '">' + s.volumeUtilPct.toFixed(1) + '%</b></div>' +
      '<div class="util-bar"><div class="util-fill ' + utilCls + '" style="width:' + Math.min(100, s.volumeUtilPct) + '%"></div></div>' +
      '<div class="stat-row' + overCls + '"><span>总重</span><b>' + fmtWt(s.totalWeight) + ' / ' + fmtWt(s.maxWeight) + (s.overweight ? ' ⚠️超重!' : '') + '</b></div>' +
      '<div class="stat-row"><span>剩余空间</span><b>' + remainM3 + ' m³</b></div>';

    /* 重心 + 轴载 (估算) */
    var cg = Planner.calculateCG();
    var ax = Planner.axleLoads();
    if (cg.loaded) {
      el.insertAdjacentHTML('beforeend',
        '<div class="stat-row"><span>重心 x</span><b class="' + (cg.warning.indexOf('✓') === 0 ? 'good' : 'mid') + '">' + fmtLen(cg.cgX) + '</b></div>' +
        (ax.loaded ? '<div class="stat-row"><span>轴载(估)</span><b>' + fmtWt(ax.front) + ' / ' + fmtWt(ax.rear) + ' (' + ax.frontPct + '%)</b></div>' : ''));
    }

    /* 未装入列表 */
    var report = Planner.getPackReport();
    var ub = q('#unplacedBox');
    if (report && report.unplaced && report.unplaced.length) {
      var grouped = {};
      report.unplaced.forEach(function (u) { grouped[u.reason] = (grouped[u.reason] || 0) + 1; });
      ub.innerHTML = '<div class="ub-title">⚠️ 未装入 ' + report.unplaced.length + ' 件</div>' +
        Object.keys(grouped).map(function (k) { return '<div class="ub-row">' + k + ': ' + grouped[k] + ' 件</div>'; }).join('');
      ub.classList.remove('hidden');
    } else {
      ub.classList.add('hidden');
    }
  }

  function renderAll() {
    compareCache = null;   // 车型/货物变化 → 重新对比
    renderUnitBar();
    renderTruckSelect();
    renderTruckInfo();
    renderQuickSizes();
    renderGroupSelect();
    renderGroupBar();
    renderCargoList();
    renderLib();
    renderStats();
    renderStrategyBar();
    updateHistoryButtons();
    var chk = q('#chkAutoPack');
    if (chk) chk.checked = Planner.autoPackOnAdd;
  }

  /* ---------- 卸货分组 / 常用货物库 ---------- */
  function renderGroupSelect() {
    var sel = q('#cfGroup');
    if (!sel) return;
    var groups = Planner.getGroups();
    var html = '<option value="0">未分组</option>' + groups.map(function (g) { return '<option value="' + g.idx + '">组' + g.idx + ' ' + g.name + '</option>'; }).join('');
    sel.innerHTML = html;
  }
  function renderGroupBar() {
    var el = q('#groupBar');
    if (!el) return;
    var groups = Planner.getGroups();
    el.innerHTML =
      '<div class="group-title">🚚 卸货顺序（组1 先装后卸→车门）</div>' +
      '<div class="group-chips">' +
      groups.map(function (g) {
        var cnt = Planner.cargo.filter(function (c) { return c.group === g.idx; }).length;
        return '<span class="gchip" title="删除该组">组' + g.idx + ' ' + g.name + ' (' + cnt + '件) <b data-gdel="' + g.idx + '" title="删除分组">✕</b></span>';
      }).join('') +
      '<button class="chip" id="btnAddGroup">➕ 新建组</button>' +
      '</div>';
  }
  function renderLib() {
    var el = q('#libList');
    if (!el) return;
    var lib = Planner.libList();
    if (!lib.length) { el.innerHTML = '<span class="empty-hint">空 — 点货物表单的「⭐ 存常用」添加</span>'; return; }
    el.innerHTML = lib.map(function (it, i) {
      return '<button class="chip" data-lib="' + i + '" title="点击加入货物列表">' + it.name + ' ' + fmtLen(it.l) + '×' + fmtLen(it.w) + '×' + fmtLen(it.h) + ' ' + fmtWt(it.weight) +
        ' <b data-libdel="' + i + '" title="从库删除">✕</b></button>';
    }).join('');
  }

  /* ---------- 多策略对比 ---------- */
  var compareCache = null;
  var STRATEGY_NAMES = { balanced: '⚖️ 均衡(重心)', volume: '📦 体积优先', weight: '⚓ 重量优先', priority: '🚚 分组顺序' };
  function renderStrategyBar() {
    var el = q('#strategyBar');
    if (!el) return;
    if (!Planner.cargo.length) { el.innerHTML = ''; return; }
    if (!compareCache) compareCache = Planner.packCompare();
    var cur = Planner.strategy;
    el.innerHTML = compareCache.results.map(function (r) {
      var cls = r.strategy === cur ? ' active' : '';
      var star = r.strategy === compareCache.best ? ' ★' : '';
      return '<button class="chip strategy-chip' + cls + '" data-strategy="' + r.strategy +
        '" title="已装 ' + r.placed + ' 件 · 未装 ' + r.unplaced + ' · 重心 x=' + (r.cgX ? Math.round(r.cgX * 100) + '%' : '-') + '">' +
        STRATEGY_NAMES[r.strategy] + ' ' + (r.util * 100).toFixed(0) + '%' + star + '</button>';
    }).join('');
  }

  /* ---------- 撤销/重做按钮状态 ---------- */
  function updateHistoryButtons() {
    var u = q('#btnUndo'), r = q('#btnRedo');
    if (u) u.disabled = !Planner.canUndo;
    if (r) r.disabled = !Planner.canRedo;
  }

  /* ---------- 导入 CSV/Excel ---------- */
  function handleImportFile(file) {
    var reader = new FileReader();
    var done = function (rows) {
      var res = Planner.importCargoRows(rows.map(mapImportRow).filter(Boolean));
      alert('导入完成：新增 ' + res.added + ' 种货物' + (res.skipped ? '，跳过 ' + res.skipped + ' 行（数据无效）' : ''));
    };
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      if (!window.XLSX) { alert('Excel 解析库未加载（SheetJS CDN 不可用），请改用 CSV 格式'); return; }
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          done(rows);
        } catch (err) { alert('Excel 解析失败：' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function (e) { done(parseCSVText(String(e.target.result))); };
      reader.readAsText(file);
    }
  }
  function mapImportRow(r) {
    if (!r) return null;
    var v = function (keys) { for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (r[k] !== undefined && r[k] !== '' && r[k] !== null) return r[k]; } return null; };
    var name = String(v(['名称', 'name', '货物名称', '品名', 'Name']) || '').trim();
    var l = parseFloat(v(['长', 'l', '长度', 'Length', 'length']));
    var w = parseFloat(v(['宽', 'w', '宽度', 'Width', 'width']));
    var h = parseFloat(v(['高', 'h', '高度', 'Height', 'height']));
    var weight = parseFloat(v(['重量', 'weight', '单件重', 'kg', 'Weight']));
    var qty = parseFloat(v(['数量', 'qty', '件数', 'count', 'Quantity', 'Qty']));
    if (!(l > 0) || !(w > 0) || !(h > 0) || !(weight > 0)) return null;
    return { name: name || '货物', l: l, w: w, h: h, weight: weight, qty: Math.max(1, Math.floor(qty || 1)) };
  }
  function parseCSVText(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
    var header = parseCSVLine(lines[0]);
    return lines.slice(1).map(function (line) {
      var cells = parseCSVLine(line);
      var row = {};
      header.forEach(function (hk, i) { row[String(hk).trim()] = cells[i] !== undefined ? cells[i].trim() : ''; });
      return row;
    });
  }
  function parseCSVLine(line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQ) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function renderUnitBar() {
    var sl = q('#unitLen');
    var sw = q('#unitWt');
    if (sl) sl.value = Planner.units.length;
    if (sw) sw.value = Planner.units.weight;
    var hint = q('#unitHint');
    if (hint) hint.innerHTML = '尺寸单位 <b>' + lenSym() + '</b>，重量单位 <b>' + wtSym() + '</b>（顶部可切换）。<br>🚫 物理规则：货物是实体<b>不可重叠</b> · 受地心引力<b>不可悬空</b>。';
  }

  /* ---------- 表单 ---------- */
  function cargoFormValues() {
    return {
      name: val('#cfName') || '货物',
      l: Planner.lenFromDisp(num('#cfL')), w: Planner.lenFromDisp(num('#cfW')), h: Planner.lenFromDisp(num('#cfH')),
      weight: Planner.wtFromDisp(num('#cfWeight')), qty: num('#cfQty'),
      group: parseInt(q('#cfGroup') ? q('#cfGroup').value : '0', 10) || 0
    };
  }
  function resetCargoForm() {
    editId = null;
    q('#cfName').value = '纸箱';
    q('#cfL').value = Planner.lenDisp(60);
    q('#cfW').value = Planner.lenDisp(40);
    q('#cfH').value = Planner.lenDisp(40);
    q('#cfWeight').value = Planner.wtDisp(25);
    q('#cfQty').value = 10;
    if (q('#cfGroup')) q('#cfGroup').value = '0';
    q('#btnAddCargo').textContent = '添加';
  }
  function fillCargoForm(c) {
    editId = c.id;
    q('#cfName').value = c.name;
    q('#cfL').value = Planner.lenDisp(c.l);
    q('#cfW').value = Planner.lenDisp(c.w);
    q('#cfH').value = Planner.lenDisp(c.h);
    q('#cfWeight').value = Planner.wtDisp(c.weight);
    q('#cfQty').value = c.qty;
    if (q('#cfGroup')) q('#cfGroup').value = String(c.group || 0);
    q('#btnAddCargo').textContent = '更新';
  }
  /* 切换单位时, 把表单里已填的数字换算到目标单位 (保持物理值不变) */
  function convertFormOnUnitChange(newLen, newWt) {
    var oldLenF = Planner.units.length === 'm' ? 100 : 1;   // 显示值 → cm
    var newLenF = newLen === 'm' ? 0.01 : 1;                // cm → 新显示值
    var oldWtF = Planner.units.weight === 't' ? 1000 : 1;   // 显示值 → kg
    var newWtF = newWt === 't' ? 0.001 : 1;                 // kg → 新显示值
    ['#cfL', '#cfW', '#cfH', '#ctL', '#ctW', '#ctH'].forEach(function (sel) {
      var el = q(sel);
      if (el && el.value !== '' && !isNaN(parseFloat(el.value))) el.value = round2(parseFloat(el.value) * oldLenF * newLenF);
    });
    ['#cfWeight', '#ctWeight'].forEach(function (sel) {
      var el = q(sel);
      if (el && el.value !== '' && !isNaN(parseFloat(el.value))) el.value = round2(parseFloat(el.value) * oldWtF * newWtF);
    });
  }
  function round2(v) { return Math.round(v * 10000) / 10000; }

  /* ---------- 导出 ---------- */
  function exportCSV() {
    var csv = Planner.exportCSV();
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '装箱单_' + Planner.truck.name + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    document.addEventListener('change', function (e) {
      if (e.target.id === 'truckSelect') {
        Planner.setTruck(e.target.value);
      }
      if (e.target.id === 'chkAutoPack') {
        Planner.setAutoPackOnAdd(e.target.checked);
      }
      if (e.target.id === 'unitLen' || e.target.id === 'unitWt') {
        var newLen = q('#unitLen').value;
        var newWt = q('#unitWt').value;
        convertFormOnUnitChange(newLen, newWt);   // 先按目标单位换算表单
        Planner.setUnits({ length: newLen, weight: newWt });  // 再切单位触发重渲染
      }
      if (e.target.id === 'chkSelectAll') {
        selSet = {};
        if (e.target.checked) Planner.cargo.forEach(function (c) { selSet[c.id] = true; });
        renderCargoList();
        return;
      }
      if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
        handleImportFile(e.target.files[0]);
        e.target.value = '';
        return;
      }
      if (e.target.id === 'cfGroup' && editId) {
        Planner.setCargoGroup(editId, parseInt(e.target.value, 10) || 0);
        return;
      }
      if (e.target.dataset && e.target.dataset.check) {
        var cid = e.target.dataset.check;
        if (e.target.checked) selSet[cid] = true; else delete selSet[cid];
        renderCargoList();
        return;
      }
    });
    document.addEventListener('click', function (e) {
      var t = e.target;

      if (t.id === 'btnCustomTruck') {
        q('#customTruckForm').classList.toggle('hidden');
        return;
      }
      if (t.id === 'btnApplyCustom') {
        var ok = Planner.setCustomTruck({
          name: val('#ctName'),
          type: q('#ctType').value,
          L: Planner.lenFromDisp(num('#ctL')), W: Planner.lenFromDisp(num('#ctW')), H: Planner.lenFromDisp(num('#ctH')),
          maxWeight: Planner.wtFromDisp(num('#ctWeight'))
        });
        if (!ok) alert('自定义车型参数无效，长/宽/高/载重必须为正数');
        return;
      }
      if (t.id === 'btnAddCargo') {
        var v = cargoFormValues();
        if (!(v.l > 0 && v.w > 0 && v.h > 0 && v.weight > 0 && v.qty > 0)) { alert('请填写有效的尺寸/重量/数量'); return; }
        if (editId) Planner.updateCargo(editId, v); else Planner.addCargo(v);
        resetCargoForm();
        return;
      }
      if (t.id === 'btnPack') {
        var rep = Planner.packAuto();
        if (rep && rep.unplaced && rep.unplaced.length) {
          alert('自动装载完成：共装 ' + Planner.placements.length + ' 件，' + rep.unplaced.length + ' 件未装入（' +
            rep.unplaced[0].reason + (rep.unplaced.length > 1 ? ' 等' : '') + '）');
        }
        return;
      }
      if (t.id === 'btnClear') {
        if (confirm('确定清空所有摆放？')) Planner.clearAll();
        return;
      }
      if (t.id === 'btnExport') { exportCSV(); return; }
      if (t.id === 'btnPrint') { window.print(); return; }
      if (t.id === 'btnBatchDel') { batchDelete(); return; }
      if (t.id === 'btnImport') { q('#importFile').click(); return; }
      if (t.id === 'btnUndo') { Planner.undo(); return; }
      if (t.id === 'btnRedo') { Planner.redo(); return; }
      if (t.id === 'btnSaveLib') {
        var v = cargoFormValues();
        if (Planner.libAdd({ name: v.name, l: v.l, w: v.w, h: v.h, weight: v.weight })) renderLib();
        else alert('请先填写有效的货物尺寸/重量');
        return;
      }
      if (t.id === 'btnAddGroup') {
        var gname = prompt('新建卸货分组名称（例：柏林/巴黎/马德里）', '停靠' + (Planner.getGroups().length + 1));
        if (gname && Planner.addGroup(gname)) renderAll();
        return;
      }
      if (t.dataset && t.dataset.gdel) {
        var gi = parseInt(t.dataset.gdel, 10);
        if (confirm('删除组' + gi + '？组内货物回到未分组')) { Planner.removeGroup(gi - 1); renderAll(); }
        return;
      }
      if (t.dataset && t.dataset.libdel) {
        var li = parseInt(t.dataset.libdel, 10);
        var lib = Planner.libList();
        if (lib[li]) { Planner.libRemove(lib[li].name); renderLib(); }
        return;
      }
      if (t.dataset && t.dataset.lib !== undefined) {
        var lib2 = Planner.libList();
        var it = lib2[parseInt(t.dataset.lib, 10)];
        if (it) {
          q('#cfName').value = it.name;
          q('#cfL').value = Planner.lenDisp(it.l);
          q('#cfW').value = Planner.lenDisp(it.w);
          q('#cfH').value = Planner.lenDisp(it.h);
          q('#cfWeight').value = Planner.wtDisp(it.weight);
          q('#cfQty').value = 1;
          editId = null;
          q('#btnAddCargo').textContent = '添加';
        }
        return;
      }

      if (t.dataset && t.dataset.strategy) {
        Planner.packAuto(t.dataset.strategy);
        renderStrategyBar();
        return;
      }

      if (t.classList.contains('chip')) {
        var qs = QUICK_SIZES[+t.dataset.idx];
        q('#cfName').value = qs.name.split(' ')[0];
        q('#cfL').value = Planner.lenDisp(qs.l);
        q('#cfW').value = Planner.lenDisp(qs.w);
        q('#cfH').value = Planner.lenDisp(qs.h);
        q('#cfWeight').value = Planner.wtDisp(qs.weight);
        q('#cfQty').value = 10;
        return;
      }

      var item = t.closest('.cargo-item');
      if (item) {
        var id = item.dataset.id;
        if (t.dataset.act === 'edit') {
          var c = Planner.cargo.filter(function (x) { return x.id === id; })[0];
          if (c) fillCargoForm(c);
        } else if (t.dataset.act === 'del') {
          var c2 = Planner.cargo.filter(function (x) { return x.id === id; })[0];
          if (confirm('删除货物「' + c2.name + '」？已摆放的箱子也会移除。')) Planner.removeCargo(id);
        }
      }
    });
  }

  /* ---------- 工具 ---------- */
  function q(sel) { return document.querySelector(sel); }
  function val(sel) { var el = q(sel); return el ? el.value.trim() : ''; }
  function num(sel) { var n = parseFloat(val(sel)); return isNaN(n) ? 0 : n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtW(kg) { return Planner.fmtWt(kg); }
  function lenSym() { return Planner.units.length === 'm' ? 'm' : 'cm'; }
  function wtSym() { return Planner.units.weight === 't' ? 't' : 'kg'; }
  function fmtLen(cm) { return Planner.fmtLen(cm); }
  function fmtWt(kg) { return Planner.fmtWt(kg); }

  /* ---------- 初始化 ---------- */
  function init(panelEl) {
    root = panelEl;
    build();
    bind();   // document 级委托: 面板 + 顶部工具条控件都响应
    Planner.on('truck', renderAll);
    Planner.on('cargo', renderAll);
    Planner.on('placement', renderStats);
    Planner.on('units', renderAll);
    renderAll();
  }

  window.PlannerUI = { init: init };
})();
