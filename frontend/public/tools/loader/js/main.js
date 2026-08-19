/* =========================================================================
 * main.js — 初始化接线: UI 面板 + 3D 场景 + 打印摘要
 * @car-box-02 起草; scene3d.js 由 @car-box-01 提供, 本文件只调用其公开 API:
 *   window.Scene3D = { init(container), setTruck(truck), setCargo(cargo),
 *                      setPlacements(placements) }
 * ========================================================================= */
(function () {
  'use strict';

  window.addEventListener('DOMContentLoaded', function () {
    /* 面板 */
    PlannerUI.init(document.getElementById('panel'));

    /* 3D 场景 (若 scene3d.js 尚未就绪则跳过, 不影响面板功能) */
    var sceneEl = document.getElementById('scene-container');
    if (window.Scene3D) {
      try {
        Scene3D.init(sceneEl);
      } catch (e) {
        console.error('[main] Scene3D.init 失败:', e);
      }
    }

    /* 场景监听数据变化 (01 的 scene3d.js 内部也可自行订阅, 双保险) */
    if (window.Scene3D) {
      Planner.on('truck', function () { Scene3D.setTruck(Planner.truck); });
      Planner.on('cargo', function () { Scene3D.setCargo(Planner.cargo); });
      Planner.on('placement', function () { Scene3D.setPlacements(Planner.placements); });
      /* 初始状态同步 */
      Scene3D.setTruck(Planner.truck);
      Scene3D.setCargo(Planner.cargo);
      Scene3D.setPlacements(Planner.placements);
    }

    /* 打印摘要 (ui.js 数据源) */
    buildPrintSheet();
    Planner.on('placement', buildPrintSheet);
    Planner.on('truck', buildPrintSheet);
    Planner.on('cargo', buildPrintSheet);

    /* 悬浮统计圆环卡 (面板折叠后依然可见) */
    buildStatsRing();
    Planner.on('placement', updateStatsRing);
    Planner.on('truck', updateStatsRing);
    Planner.on('cargo', updateStatsRing);
    Planner.on('units', updateStatsRing);
    updateStatsRing();

    /* 面板折叠/展开 (全屏查看 3D) */
    var toggle = document.getElementById('panelToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        document.body.classList.toggle('panel-collapsed');
        var collapsed = document.body.classList.contains('panel-collapsed');
        toggle.textContent = collapsed ? '📋' : '✕';
        toggle.title = collapsed ? '展开货物面板' : '收起货物面板';
        /* 面板开合后通知场景适配 (全屏时无需, 但窗口/布局变化保险) */
        setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 320);
      });
    }

    /* 撤销/重做快捷键 (输入框内不拦截) */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'z' && e.shiftKey) { e.preventDefault(); Planner.redo(); }
      else if (k === 'z') { e.preventDefault(); Planner.undo(); }
      else if (k === 'y') { e.preventDefault(); Planner.redo(); }
    });
  });

  /* ---------- 悬浮统计圆环卡 ---------- */
  function buildStatsRing() {
    var el = document.getElementById('statsRing');
    if (!el) return;
    el.innerHTML =
      '<div class="ring-wrap">' +
      '  <svg class="ring-svg" viewBox="0 0 120 120">' +
      '    <circle class="ring-bg" cx="60" cy="60" r="52"></circle>' +
      '    <circle class="ring-fg" id="ringFg" cx="60" cy="60" r="52"></circle>' +
      '  </svg>' +
      '  <div class="ring-center"><b id="ringPct">0%</b><span>装载率</span></div>' +
      '</div>' +
      '<div class="ring-rows">' +
      '  <div class="rr"><span>已装件数</span><b id="ringCnt">0 / 0</b></div>' +
      '  <div class="rr" id="ringWtRow"><span>总重</span><b id="ringWt">0</b></div>' +
      '</div>' +
      '<div class="ring-cg" id="ringCg"></div>';
  }

  function updateStatsRing() {
    var el = document.getElementById('statsRing');
    if (!el) return;
    var s = Planner.getStats();
    var fg = document.getElementById('ringFg');
    if (fg) {
      var C = 326.7;
      var pct = Math.min(100, s.volumeUtilPct);
      fg.style.strokeDashoffset = String(C * (1 - pct / 100));
      fg.setAttribute('class', 'ring-fg ' + (s.overweight ? 'over' : (pct >= 85 ? '' : (pct >= 70 ? 'mid' : 'low'))));
    }
    var pctEl = document.getElementById('ringPct');
    if (pctEl) pctEl.textContent = Math.round(Math.min(100, s.volumeUtilPct)) + '%';
    var cntEl = document.getElementById('ringCnt');
    if (cntEl) cntEl.textContent = s.placedCount + ' / ' + s.totalQty;
    var wtEl = document.getElementById('ringWt');
    var row = document.getElementById('ringWtRow');
    if (wtEl) wtEl.textContent = Planner.fmtWt(s.totalWeight) + ' / ' + Planner.fmtWt(s.maxWeight);
    if (row) row.className = 'rr' + (s.overweight ? ' over' : '');
    var cg = Planner.calculateCG();
    var cgEl = document.getElementById('ringCg');
    if (cgEl) {
      if (cg.loaded) {
        cgEl.className = 'ring-cg' + (cg.warning.indexOf('✓') === 0 ? ' ok' : '');
        cgEl.innerHTML = '重心: <b>' + cg.warning.replace('⚠️ ', '') + '</b><br>位置 x=' + Planner.fmtLen(cg.cgX);
      } else {
        cgEl.className = 'ring-cg';
        cgEl.innerHTML = '重心: <b>—</b>';
      }
    }
  }

  function buildPrintSheet() {
    var el = document.getElementById('printSheet');
    if (!el) return;
    var s = Planner.getStats();
    var t = Planner.truck;
    var rows = Planner.placements.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + p.name + '</td><td>' + Planner.fmtLen(p.dx) + '×' + Planner.fmtLen(p.dy) + '×' + Planner.fmtLen(p.dz) + '</td><td>' + Planner.fmtWt(p.weight) + '</td><td>(' + p.x + ',' + p.y + ',' + p.z + ')</td></tr>';
    }).join('');
    el.innerHTML =
      '<h2>货物装车单</h2>' +
      '<p>车型: ' + t.name + ' · 尺寸 ' + Planner.fmtLen(t.L) + '×' + Planner.fmtLen(t.W) + '×' + Planner.fmtLen(t.H) + ' · 载重 ' + Planner.fmtWt(t.maxWeight) + ' · 生成时间 ' + new Date().toLocaleString('zh-CN') + '</p>' +
      '<p>已装 ' + s.placedCount + '/' + s.totalQty + ' 件 · 体积利用率 ' + s.volumeUtilPct.toFixed(1) + '% · 总重 ' + Planner.fmtWt(s.totalWeight) + '/' + Planner.fmtWt(s.maxWeight) + (s.overweight ? ' (超重!)' : '') + '</p>' +
      '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse">' +
      '<tr><th>序号</th><th>货物名称</th><th>尺寸</th><th>单件重</th><th>位置(x,y,z)</th></tr>' +
      rows + '</table>';
  }
})();
