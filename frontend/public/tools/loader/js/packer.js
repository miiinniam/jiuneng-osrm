/* =========================================================================
 * packer.js — 重心感知贪心自动装载算法
 * 负责人: @car-box-02
 *
 * 策略 (贴近人工装车习惯 + 重心安全):
 *   1. 货物按 单件重↓ / 体积↓ 排序 (重货先装, 符合"重不压轻")
 *   2. 分区装载 (重心感知):
 *        - 重货区 (车厢中部 35%~65%, 轴心附近): 重货优先
 *        - 车尾区 (65%~100%): 中货
 *        - 车头区 (0~35%): 轻货
 *      每个分区独立 shelf 堆叠 (x 排成列 → 满列升 y 堆层 → 满层换 z 行)
 *      使整车重心落在中部安全区, 避免 重心偏前/偏后
 *   3. 分区装不下的大件 → 全车厢兜底再试
 *   4. 载重约束: 超过 maxWeight 标记"超载"跳过 (轻的还能继续装)
 *   5. 平板车(flatbed): 超限件(超高/超宽/超长)最后居中堆顶, 每边超限均匀
 *
 * 对外暴露: window.Packer.pack(truck, cargoList, opts)
 *   → { placements: [{id,cargoId,name,color,weight,x,y,z,dx,dy,dz}], unplaced: [{cargoId,name,reason}] }
 *   单位: cm / kg; x=车长方向(前壁→车门), y=高, z=宽; 原点=前壁左下角
 * ========================================================================= */
(function () {
  'use strict';

  function pack(truck, cargoList, opts) {
    var L = truck.L, W = truck.W, H = truck.H, maxWeight = truck.maxWeight;
    var allowOverflow = opts ? !!opts.allowOverflow : (truck.type === 'flatbed');
    var strategy = (opts && opts.strategy) || 'balanced';   // balanced | volume | weight
    var placements = [];
    var unplaced = [];
    var overflowItems = [];   // 平板车超限件 (最后居中堆顶)
    var seq = 1;
    var totalWeight = 0;

    /* 展开实例 */
    var instances = [];
    cargoList.forEach(function (c) {
      for (var i = 0; i < c.qty; i++) {
        instances.push({ cargoId: c.id, name: c.name, l: c.l, w: c.w, h: c.h, weight: c.weight, color: c.color, group: c.group || 0 });
      }
    });
    /* 按策略排序:
     *  balanced: 重量↓ 体积↓ (重货进轴心区, 重心安全)
     *  volume:   体积↓ (大件先装, 利用率最高)
     *  weight:   重量↓ (重货先装)
     *  priority: 优先级组↑ (先装后卸的组靠车头), 组内重量↓ (卸货顺序 LIFO) */
    if (strategy === 'volume') {
      instances.sort(function (a, b) {
        return ((b.l * b.w * b.h) - (a.l * a.w * a.h)) || (b.weight - a.weight);
      });
    } else if (strategy === 'priority') {
      instances.sort(function (a, b) {
        return ((a.group || 0) - (b.group || 0)) || (b.weight - a.weight) || ((b.l * b.w * b.h) - (a.l * a.w * a.h));
      });
    } else {
      instances.sort(function (a, b) {
        return (b.weight - a.weight) || ((b.l * b.w * b.h) - (a.l * a.w * a.h));
      });
    }

    function orientedDims(item) {
      return [
        { dx: item.l, dy: item.h, dz: item.w },
        { dx: item.w, dy: item.h, dz: item.l }
      ];
    }
    /* 两种水平朝向都超出车厢 → 超限件 */
    function tooBig(item) {
      var dims = orientedDims(item);
      for (var i = 0; i < dims.length; i++) {
        if (dims[i].dy <= H && dims[i].dx <= L && dims[i].dz <= W) return false;
      }
      return true;
    }
    function fitsHere(item, x, z, y, endX, checkOverlap) {
      var dims = orientedDims(item);
      for (var i = 0; i < dims.length; i++) {
        var d = dims[i];
        if (d.dy > H || d.dx > L || d.dz > W) continue;
        if (x + d.dx <= endX + 1e-6 && z + d.dz <= W + 1e-6 && y + d.dy <= H + 1e-6) {
          if (!checkOverlap || !overlapsAny(x, y, z, d.dx, d.dy, d.dz)) return d;
        }
      }
      return null;
    }
    /* AABB 重叠检查 (对已摆放的所有箱子) — 防止兜底通道压到分区已摆的箱子 */
    function overlapsAny(x, y, z, dx, dy, dz) {
      for (var i = 0; i < placements.length; i++) {
        var p = placements[i];
        if (!(x + dx <= p.x || p.x + p.dx <= x ||
              y + dy <= p.y || p.y + p.dy <= y ||
              z + dz <= p.z || p.z + p.dz <= z)) return true;
      }
      return false;
    }
    /* 地心引力: 候选位置必须有支撑 — y=0(地板) 或 底面投影下存在顶面==y 的箱子 */
    function isSupported(x, y, z, dx, dz) {
      if (y < 0.01) return true;
      for (var i = 0; i < placements.length; i++) {
        var q = placements[i];
        if (Math.abs(q.y + q.dy - y) > 0.01) continue;
        if (q.x + q.dx <= x || x + dx <= q.x) continue;
        if (q.z + q.dz <= z || z + dz <= q.z) continue;
        return true;
      }
      return false;
    }

    function emit(item, d, x, y, z) {
      placements.push({
        id: 'p' + (seq++),
        cargoId: item.cargoId,
        name: item.name,
        color: item.color,
        weight: item.weight,
        group: item.group || 0,
        x: x, y: y, z: z,           // 不四舍五入: 舍入会让相邻箱被误判重叠
        dx: d.dx, dy: d.dy, dz: d.dz
      });
      totalWeight += item.weight;
    }

    /* 分区 shelf 装载: 在 [startX, endX] 内从 x=startX 开始排
     * 装载容量按体积计算 (不按重量硬停; 超重由统计栏/圆环卡预警)
     * checkOverlap=true 时候选位置必须不与已摆箱子重叠 (兜底通道用) */
    function packZone(items, startX, endX, checkOverlap) {
      var x = startX, y = 0, z = 0, layerH = 0, rowD = 0;
      var remain = [];
      items.forEach(function (item) {
        if (tooBig(item)) {
          if (allowOverflow) overflowItems.push(item);
          else unplaced.push({ cargoId: item.cargoId, name: item.name, reason: '尺寸超限' });
          return;
        }
        var placed = false;
        var guard = 0;
        while (!placed && guard < 100000) {
          guard++;
          if (x >= endX - 1e-6) { z += rowD; x = startX; rowD = 0; }
          if (z >= W - 1e-6) { y += Math.max(layerH, 1); x = startX; z = 0; layerH = 0; rowD = 0; }
          if (y >= H - 1e-6) break;
          var d = fitsHere(item, x, z, y, endX, checkOverlap);
          if (d && !isSupported(x, y, z, d.dx, d.dz)) d = null;   // 地心引力: 悬空位置不可用
          if (d) {
            emit(item, d, x, y, z);
            x += d.dx;
            layerH = Math.max(layerH, d.dy);
            rowD = Math.max(rowD, d.dz);
            placed = true;
          } else {
            if (x > startX) { z += rowD; x = startX; rowD = 0; }
            else { y += Math.max(layerH, 1); x = startX; z = 0; layerH = 0; rowD = 0; }
          }
        }
        if (!placed) remain.push(item);
      });
      return remain;
    }

    /* ---- 分区策略: 仅 balanced 用重心分区(长车); volume/weight/priority 直接满宽排 ---- */
    var useZones = strategy === 'balanced' && L >= 800;
    var heavy = [], light = [], cum = 0;
    if (useZones) {
      var totalW = instances.reduce(function (s, it) { return s + it.weight; }, 0);
      var maxW = instances.length ? instances.reduce(function (s, it) { return Math.max(s, it.weight); }, 0) : 0;
      var allEqual = instances.length > 1 && instances.every(function (it) { return it.weight === maxW; });
      instances.forEach(function (it) {
        if (!allEqual ? (it.weight > maxW * 0.3) : (cum < totalW * 0.6)) heavy.push(it);
        else light.push(it);
        cum += it.weight;
      });
    } else {
      heavy = instances; light = [];
    }

    var remRear;
    if (useZones) {
      /* 1) 重货 → 轴心区 (中部 35%~65%) */
      var midX0 = L * 0.35, midX1 = L * 0.65;
      var remMid = packZone(heavy, midX0, midX1, true);
      /* 2) 轻货 → 车头区 (0~35%) */
      var remFront = packZone(light, 0, midX0, true);
      /* 3) 剩余 (重货装不下 + 轻货装不下) → 车尾区 (65%~100%) */
      remRear = packZone(remMid.concat(remFront), midX1, L, true);
    } else if (strategy === 'priority') {
      /* 优先级分组: 按组分片从前到后装载 (组1 先装后卸=车头侧, 大组号靠车门) */
      var byGroup = {};
      instances.forEach(function (it) { var g = it.group || 0; (byGroup[g] = byGroup[g] || []).push(it); });
      var gKeys = Object.keys(byGroup).map(Number).sort(function (a, b) { return a - b; });
      var gstart = 0, remAll = [];
      gKeys.forEach(function (g) {
        remAll = remAll.concat(packZone(byGroup[g], gstart, L, true));
        placements.forEach(function (p) { gstart = Math.max(gstart, p.x + p.dx); });
      });
      remRear = remAll;
    } else {
      remRear = packZone(heavy, 0, L, true);   // 短车/volume/weight: 满宽从车头排
    }
    /* 4) 兜底: 全局空隙填充 — 候选位置=已摆箱子的顶面/侧边, 跨分区边界找空位, 恢复分区浪费空间 */
    function uniqSorted(arr) {
      var seen = {}, out = [];
      arr.forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
      out.sort(function (a, b) { return a - b; });
      return out;
    }
    function fillGaps(items) {
      var remain = [];
      items.forEach(function (item) {
        if (tooBig(item)) {
          if (allowOverflow) overflowItems.push(item);
          else unplaced.push({ cargoId: item.cargoId, name: item.name, reason: '尺寸超限' });
          return;
        }
        var placed = false;
        var ys = uniqSorted([0].concat(placements.map(function (p) { return p.y + p.dy; })));
        var zs = uniqSorted([0].concat(placements.map(function (p) { return p.z + p.dz; })));
        var xs = uniqSorted([0].concat(placements.map(function (p) { return p.x + p.dx; })));
        for (var yi = 0; yi < ys.length && !placed; yi++) {
          var y = ys[yi];
          for (var zi = 0; zi < zs.length && !placed; zi++) {
            var z = zs[zi];
            for (var xi = 0; xi < xs.length && !placed; xi++) {
              var x = xs[xi];
              var d = fitsHere(item, x, z, y, L, true);
              if (d && !isSupported(x, y, z, d.dx, d.dz)) d = null;   // 地心引力: 只允许落在支撑面上
              if (d) { emit(item, d, x, y, z); placed = true; }
            }
          }
        }
        if (!placed) remain.push(item);
      });
      return remain;
    }
    var rem = fillGaps(remRear);
    rem.forEach(function (item) {
      unplaced.push({ cargoId: item.cargoId, name: item.name, reason: '空间不足' });
    });

    /* 5) 平板车超限件: 堆在最高堆顶; 超宽/超长自动居中, 每边超限均匀 */
    if (overflowItems.length) {
      var topY = 0;
      placements.forEach(function (p) { topY = Math.max(topY, p.y + p.dy); });
      overflowItems.forEach(function (item) {
        var dims = orientedDims(item);
        var best = dims[0], bestOv = 1e18;
        dims.forEach(function (d) {
          var ov = Math.max(0, d.dx - L) + Math.max(0, d.dz - W);
          if (ov < bestOv) { bestOv = ov; best = d; }
        });
        var px = best.dx > L ? (L - best.dx) / 2 : 0;
        var pz = best.dz > W ? (W - best.dz) / 2 : 0;
        placements.push({
          id: 'p' + (seq++),
          cargoId: item.cargoId,
          name: item.name,
          color: item.color,
          weight: item.weight,
          x: Math.round(px * 10) / 10,
          y: Math.round(topY * 10) / 10,
          z: Math.round(pz * 10) / 10,
          dx: best.dx, dy: best.dy, dz: best.dz
        });
        topY += best.dy;
        totalWeight += item.weight;
      });
    }

    /* 6) 安全网: 最终碰撞校验 — 任何重叠摆放移出 (防御边界情况, 保证绝不出现重叠) */
    var finalList = [];
    placements.forEach(function (p) {
      var conflict = finalList.some(function (q) {
        return !(p.x + p.dx <= q.x || q.x + q.dx <= p.x ||
                 p.y + p.dy <= q.y || q.y + q.dy <= p.y ||
                 p.z + p.dz <= q.z || q.z + q.dz <= p.z);
      });
      if (conflict) {
        unplaced.push({ cargoId: p.cargoId, name: p.name, reason: '空间不足' });
      } else {
        finalList.push(p);
      }
    });
    placements = finalList;

    return { placements: placements, unplaced: unplaced };
  }

  window.Packer = { pack: pack };
})();
