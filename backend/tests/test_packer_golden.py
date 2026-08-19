"""test_packer_golden.py — packer.py vs packer.js 逐件坐标一致性 (golden tests)

契约: Python 内核与 JS 内核必须产出逐件一致的 placements/unplaced (验收标准 2)。
任一用例不一致 → 测试失败, 显示首个差异字段。
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
SERVICES_DIR = BACKEND_DIR / "app" / "services"
CARBOX_SRC = Path(r"D:\01_业务\立三方\货运一站式\carbox\js\packer.js")
RUNNER = TESTS_DIR / "golden_runner.js"

sys.path.insert(0, str(SERVICES_DIR))
import packer  # noqa: E402


def _trunk(p):
    """仅保留可比较字段 (顺序敏感)."""
    return {k: p[k] for k in ("id", "cargoId", "name", "color", "weight", "group", "x", "y", "z", "dx", "dy", "dz") if k in p}


CASES = [
    # 0: 40HQ 混装 (balanced + 分区)
    {
        "truck": {"id": "40hq", "L": 1203, "W": 235, "H": 269, "maxWeight": 26500, "type": "container"},
        "cargo": [
            {"id": "c1", "name": "重箱", "l": 120, "w": 100, "h": 100, "weight": 1500, "qty": 6, "color": "#e74c3c"},
            {"id": "c2", "name": "中箱", "l": 200, "w": 100, "h": 80, "weight": 800, "qty": 8, "color": "#3498db"},
            {"id": "c3", "name": "轻箱", "l": 80, "w": 80, "h": 60, "weight": 200, "qty": 20, "color": "#2ecc71"},
        ],
    },
    # 1: 13m 厢式半挂 托盘
    {"truck": {"id": "13m", "L": 1300, "W": 235, "H": 250, "maxWeight": 30000, "type": "van"},
     "cargo": [{"id": "t", "name": "托盘", "l": 120, "w": 80, "h": 100, "weight": 600, "qty": 30, "color": "#f39c12"}]},
    # 2: 4.2m 轻卡 (短车无分区)
    {"truck": {"id": "4.2m", "L": 420, "W": 210, "H": 210, "maxWeight": 4000, "type": "van"},
     "cargo": [
         {"id": "bx", "name": "纸箱", "l": 60, "w": 40, "h": 50, "weight": 30, "qty": 60, "color": "#9b59b6"},
         {"id": "lg", "name": "长件", "l": 400, "w": 60, "h": 60, "weight": 300, "qty": 2, "color": "#1abc9c"},
     ]},
    # 3: 17.5m 平板 (flatbed 超限件居中堆顶)
    {"truck": {"id": "17.5p", "L": 1750, "W": 300, "H": 250, "maxWeight": 30000, "type": "flatbed"},
     "cargo": [
         {"id": "wd", "name": "宽件", "l": 600, "w": 280, "h": 120, "weight": 3000, "qty": 4, "color": "#e67e22"},
         {"id": "hi", "name": "超高件", "l": 400, "w": 200, "h": 300, "weight": 2000, "qty": 2, "color": "#c0392b"},
     ]},
    # 4: 自定义 8m (自定义车型)
    {"truck": {"id": "custom", "L": 800, "W": 240, "H": 260, "maxWeight": 12000, "type": "van"},
     "cargo": [{"id": "mc", "name": "机器", "l": 250, "w": 150, "h": 160, "weight": 2500, "qty": 4, "color": "#16a085"}]},
    # 5: 20GP 小柜
    {"truck": {"id": "20gp", "L": 590, "W": 235, "H": 239, "maxWeight": 21770, "type": "container"},
     "cargo": [{"id": "sh", "name": "货架", "l": 110, "w": 80, "h": 200, "weight": 400, "qty": 12, "color": "#8e44ad"}]},
    # 6: volume 策略
    {"truck": {"id": "13m", "L": 1300, "W": 235, "H": 250, "maxWeight": 30000, "type": "van"},
     "cargo": [
         {"id": "a", "name": "大件", "l": 300, "w": 200, "h": 120, "weight": 300, "qty": 5, "color": "#d35400"},
         {"id": "b", "name": "小件", "l": 50, "w": 50, "h": 50, "weight": 800, "qty": 40, "color": "#27ae60"},
     ],
     "opts": {"strategy": "volume"}},
    # 7: weight 策略
    {"truck": {"id": "40gp", "L": 1203, "W": 235, "H": 239, "maxWeight": 26500, "type": "container"},
     "cargo": [
         {"id": "a", "name": "重货", "l": 100, "w": 100, "h": 100, "weight": 2000, "qty": 10, "color": "#c0392b"},
         {"id": "b", "name": "轻货", "l": 200, "w": 100, "h": 80, "weight": 100, "qty": 10, "color": "#2980b9"},
     ],
     "opts": {"strategy": "weight"}},
    # 8: priority 分组策略
    {"truck": {"id": "13m", "L": 1300, "W": 235, "H": 250, "maxWeight": 30000, "type": "van"},
     "cargo": [
         {"id": "g1", "name": "先卸组", "l": 120, "w": 100, "h": 100, "weight": 500, "qty": 8, "group": 1, "color": "#2c3e50"},
         {"id": "g2", "name": "后卸组", "l": 120, "w": 100, "h": 100, "weight": 700, "qty": 8, "group": 2, "color": "#f1c40f"},
     ],
     "opts": {"strategy": "priority"}},
    # 9: 全等重 (分区 cum 分支)
    {"truck": {"id": "9.6m", "L": 960, "W": 235, "H": 245, "maxWeight": 15000, "type": "van"},
     "cargo": [{"id": "e", "name": "等重箱", "l": 100, "w": 100, "h": 100, "weight": 500, "qty": 25, "color": "#1abc9c"}]},
    # 10: 单件超限 (container 非平板 → 尺寸超限 unplaced)
    {"truck": {"id": "20gp", "L": 590, "W": 235, "H": 239, "maxWeight": 21770, "type": "container"},
     "cargo": [{"id": "big", "name": "放不下", "l": 600, "w": 300, "h": 300, "weight": 1000, "qty": 1, "color": "#e74c3c"}]},
    # 11: 600 件压测 — 文档验收标准 5 基线: 60×40×40cm ×25kg → 40HQ 75.7%
    {"truck": {"id": "40hq", "L": 1203, "W": 235, "H": 269, "maxWeight": 26500, "type": "container"},
     "cargo": [{"id": "p", "name": "小箱", "l": 60, "w": 40, "h": 40, "weight": 25, "qty": 600, "color": "#3498db"}]},
    # 12: flatbed 显式 allowOverflow=false → 超限件 unplaced (尺寸超限)
    {"truck": {"id": "17.5p", "L": 1750, "W": 300, "H": 250, "maxWeight": 30000, "type": "flatbed"},
     "cargo": [{"id": "hi", "name": "超高件", "l": 400, "w": 200, "h": 300, "weight": 2000, "qty": 2, "color": "#c0392b"}],
     "opts": {"allowOverflow": False}},
    # 13: container 显式 allowOverflow=true → 超限件居中堆顶
    {"truck": {"id": "40hq", "L": 1203, "W": 235, "H": 269, "maxWeight": 26500, "type": "container"},
     "cargo": [{"id": "n", "name": "底箱", "l": 300, "w": 200, "h": 100, "weight": 500, "qty": 6, "color": "#27ae60"},
               {"id": "big", "name": "超宽件", "l": 200, "w": 300, "h": 80, "weight": 800, "qty": 1, "color": "#8e44ad"}],
     "opts": {"allowOverflow": True}},
]


def _run_node(cases):
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False)
        cases_path = f.name
    try:
        r = subprocess.run(
            ["node", str(RUNNER), str(CARBOX_SRC), cases_path],
            capture_output=True, text=True, timeout=120, check=True,
        )
        return json.loads(r.stdout)
    finally:
        os.unlink(cases_path)


def _diff_fields(a, b):
    diffs = []
    for k in a:
        va, vb = a.get(k), b.get(k)
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            if math.isnan(va) or math.isnan(vb) or abs(va - vb) > 1e-9:
                diffs.append(f"{k}: js={va!r} py={vb!r}")
        elif va != vb:
            diffs.append(f"{k}: js={va!r} py={vb!r}")
    return diffs


def test_packer_golden():
    js_results = _run_node(CASES)
    assert len(js_results) == len(CASES)
    for i, (case, jsr) in enumerate(zip(CASES, js_results)):
        pyr = packer.pack(case["truck"], case["cargo"], case.get("opts"))
        # 未装入对比 (顺序敏感)
        assert [u["cargoId"] for u in pyr["unplaced"]] == [u["cargoId"] for u in jsr["unplaced"]], \
            f"case{i} unplaced 不一致: py={[u['cargoId'] for u in pyr['unplaced']]} js={[u['cargoId'] for u in jsr['unplaced']]}"
        # 逐件坐标对比 (顺序敏感)
        assert len(pyr["placements"]) == len(jsr["placements"]), \
            f"case{i} 件数不一致: py={len(pyr['placements'])} js={len(jsr['placements'])}"
        for j, (a, b) in enumerate(zip(jsr["placements"], pyr["placements"])):
            diffs = _diff_fields(_trunk(a), _trunk(b))
            assert not diffs, f"case{i} placement#{j} 差异: {diffs}"


def test_packer_stats_util():
    """600 件压测: 统计口径 sanity (装载率>0 且不越界)."""
    case = CASES[11]
    r = packer.pack(case["truck"], case["cargo"], case.get("opts"))
    s = packer.stats(case["truck"], r["placements"], 600)
    assert s["placedCount"] == len(r["placements"])
    assert 0.0 < s["volumeUtilPct"] < 100.0
    L, W, H = case["truck"]["L"], case["truck"]["W"], case["truck"]["H"]
    for p in r["placements"]:
        assert p["x"] >= -1e-9 and p["x"] + p["dx"] <= L + 1e-9
        assert p["z"] >= -1e-9 and p["z"] + p["dz"] <= W + 1e-9
        assert p["y"] >= -1e-9 and p["y"] + p["dy"] <= H + 1e-9
    print(f"\n[info] 600件 装载率: {s['volumeUtilPct']:.1f}% 件数 {s['placedCount']}/600 重 {s['totalWeight']}kg")
