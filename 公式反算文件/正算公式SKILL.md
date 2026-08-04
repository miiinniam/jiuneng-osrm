# 正算公式 Skill（通用 Skill，不绑定任何特定 Agent 平台）

> **触发:** Agent 需要理解/修改运费计算公式、添加新费用项、调整公式参数、或排查正算报价结果异常时，先读本文档。
>
> **前置:** 先读项目根目录的 [SKILL.md](../SKILL.md) 了解整体架构。

---

## 1. 公式架构

```
                    ┌─────────────────────────┐
                    │   费用计算公式.py          │  ← ★ 唯一公式源
                    │   (所有阈值/系数/函数)     │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
    │  cost_engine.py  │ │calibration.py│ │ test_cost_engine │
    │  正算编排层       │ │ 反算设计矩阵  │ │ 单元测试          │
    │  (读CSV→调公式)   │ │ (用公式算系数)│ │ (验证公式正确性)   │
    └─────────────────┘ └──────────────┘ └──────────────────┘
```

**核心原则：** 所有跟"钱怎么算"有关的逻辑都只写在 `费用计算公式.py` 里。`cost_engine.py` 只负责编排（查车型、调公式、组装结果），不涉及具体数字。

---

## 2. 公式清单

### §6.2.1 速度惩罚（载重 → 速度系数）

| 载重比例 | 速度系数 | 说明 |
|---------|:---:|------|
| ≤ 0.5 | 1.00 | 轻载，正常速度 |
| ≤ 0.8 | 1.15 | 中载，慢 15% |
| > 0.8 | 1.25 | 重载，慢 25% |

函数: `速度系数(载重比例) → float`

### §6.2.2 强制休息（越南交规估算）

- 每连续驾驶 4h → 强制休息 0.5h
- 单日驾驶超 8h → 过夜休息 8h

函数: `休息时长(调整后行驶小时数) → float`

### §6.2.3 装卸时间

- 每吨货物 0.5h 装卸时间

函数: `装卸时长(货物重量吨, 需要装卸) → float`

### §6.2.4 总用时（★ 正算和反算共用）

```python
计算总用时(*, 载重比例, 原始行驶小时, 货物重量吨, 需要装卸)
    → (速度系数, 调整后行驶小时, 休息小时, 装卸小时, 总用时小时)
```

**这是 2026-07-03 提取的共用函数。** `cost_engine._compute_for_model` 和 `calibration._design_row` 都调用它，正反算的时间链完全一致。

### §6.3.0 拼货容量占比

```python
容量占比(货物重量吨, 货物体积立方米, 车型最大载重吨, 车型容积立方米) → float
```

按重量比和体积比取较大值。平板车无厢体 → 只看重量比。整车模式不调用，capacity_ratio 恒为 1.0。

### §6.3.1 距离成本

```python
距离成本(距离公里, 车辆基础费率, 货物类型系数, 空车返回) → float
```

- 空车返回附加 50%（`空车返回附加比例 = 0.5`）
- `货物类型系数` = `cargo.rate_multiplier`（如冷链 1.3×、危险品 1.5×）

### §6.3.2 时间成本

```python
时间成本(总用时小时数, 司机小时工资) → float
```

### §6.3.3 油耗成本

```python
油耗成本(距离公里, 百公里油耗, 油价, 载重比例, 货物油耗附加比例) → float
```

- `油耗载重系数`: 载重比 > 0.5 开始线性增加（斜率 0.2）
- `货物油耗附加比例` = **cargo.fuel_penalty + model.fuel_penalty（累加！）**
  - 例: 冷链货物(0.20) + 油冷冷链车(0.25) = 0.45 总附加
  - 例: 冷链货物(0.20) + 电冷冷链车(0.10) = 0.30 总附加

### §6.3.4 固定费用

| 费用项 | 来源 | 受 capacity_ratio 影响？ |
|--------|------|:---:|
| 装卸费 | `W_cargo × 50,000 ₫/t` | 否 |
| 保险费 | `货值 × 0.3%` | 否 |
| 路桥费 | `D_km × 车型路桥费率` | 是 |
| 车身附加费 | 车型 `fixed_surcharge_vnd` | 是 |
| 禁限行绕行费 | `0 × 类型系数`（手动勾选，2026-07-16 归零待校准） | 是 |
| 施工封闭绕行费 | `0 × 类型系数`（手动勾选，2026-07-16 归零待校准） | 是 |
| 上坡山区附加费 | `0 × 类型系数`（手动勾选，2026-07-16 归零待校准） | 是 |
| 其他 misc | 用户自定义 | 否 |

---

## 3. 费用计算流程（cost_engine.py）

### 整车模式 (full_truck)

```
compute_cost_full_truck(distance_m, duration_s, cargo_weight_ton, vehicle_model_id, ...)
  ├─ get_model() → 查车型库
  ├─ ★ 超载校验: cargo_weight_ton > model.max_load_ton → ValueError
  ├─ _compute_for_model(model, capacity_ratio=1.0, ...)
  │    ├─ 计算总用时()  → RouteTiming
  │    ├─ 距离成本()    → × capacity_ratio
  │    ├─ 时间成本()    → × capacity_ratio
  │    ├─ 油耗成本()    → × capacity_ratio
  │    ├─ 路桥/车身/路况附加 → × capacity_ratio
  │    └─ 装卸/保险/misc   → 不打折
  └─ _build_suggestions() → 智能建议
```

### 拼货模式 (consolidated)

```
compute_cost_consolidated(distance_m, duration_s, cargo_weight_ton, cargo_volume_m3, ...)
  ├─ match_consolidated_model()
  │    ├─ 候选: 所有 cargo_weight ≤ max_load AND cargo_volume ≤ volume 的车型
  │    ├─ 对每个候选算 容量占比() → capacity_ratio
  │    ├─ 对每个候选跑 _compute_for_model() → 得到 cost_total
  │    └─ 选 cost_total 最低的
  └─ 返回 CostResult
```

---

## 4. 修改公式的正确姿势

### 只改常数（阈值/系数）

直接改 `费用计算公式.py` 里的常量。**不需要改其他地方。**

```python
# 改这里，一处生效
速度惩罚阈值表 = [(0.5, 1.00), (0.8, 1.15), (float("inf"), 1.25)]
空车返回附加比例 = 0.5
```

### 新增公式函数

1. 在 `费用计算公式.py` 写新函数
2. 在 `cost_engine._compute_for_model` 调用它
3. 决定它属于"可分摊"还是"本单专属"（影响 capacity_ratio 是否乘上去）
4. 在 `CostBreakdown` dataclass 加字段
5. 在 `calibration._design_row` 的 `fixed_known` 中计入
6. 在 `schemas.py` 的 `BreakdownOutput` 加字段
7. 前端 `CostPanel.tsx` + i18n 三语

### 改容量占比逻辑

1. 改 `费用计算公式.容量占比`
2. **必须同步改 `calibration._design_row`**（反算的 capacity_ratio 来自 `resolve_shipment` 调用同一个公式函数 → 通常不需要额外改；但如果新增了判断维度，`_design_row` 的 fixed_known 分类可能受影响）

---

## 5. 与反算的一致性约束

正算和反算必须对同一个概念给出相同的数值：

| 概念 | 正算位置 | 反算位置 | 一致性保证 |
|------|---------|---------|-----------|
| 速度系数 | `公式.速度系数()` | 同一个函数 | ✅ 共用 |
| 休息时长 | `公式.休息时长()` | 同一个函数 | ✅ 共用 |
| 装卸时长 | `公式.装卸时长()` | 同一个函数 | ✅ 共用 |
| 总用时 | `公式.计算总用时()` | 同一个函数 | ✅ 共用 |
| 容量占比 | `公式.容量占比()` | `resolve_shipment` 调用同一个函数 | ✅ 共用 |
| 油耗载重系数 | `公式.油耗载重系数()` | 同一个函数 | ✅ 共用 |
| fuel_penalty 叠加 | `cargo.fuel_penalty + model.fuel_penalty` | 同样的加法 | ⚠️ 需人工保持 |
| 设计矩阵系数 | `_compute_for_model` | `_design_row` | ⚠️ 需人工保持 |
| fixed_known 分类 | `_compute_for_model` | `_design_row.fixed_known` | ⚠️ 需人工保持 |

标注 ⚠️ 的三项是"代码里各写一份，但数学上必须一致"的——这是 2026-07-03 合并 `_design_row` 的主要原因。

---

## 6. 关键文件

| 文件 | 路径 | 改公式时必看？ |
|------|------|:---:|
| 公式定义 | `backend/app/services/费用计算公式.py` | ✅ 必看 |
| 正算编排 | `backend/app/services/cost_engine.py` | ✅ 必看 |
| 反算拟合 | `backend/app/services/calibration.py` | ✅ 必看 |
| 货物类型 | `backend/app/services/presets.py` | 加新货物类型时看 |
| 运行配置 | `backend/app/config.py` | 改默认参数时看 |
| 车型加载 | `backend/app/services/vehicle_registry.py` | 改 CSV 结构时看 |

---

## 7. 从反算接收优化参数（反算→正算桥接）

正算公式的参数有三个来源，其中两个可以通过反算校准优化：

### 参数来源总览

| 参数 | 当前来源 | 可被反算优化？ | 更新方法 |
|------|---------|:---:|---------|
| `base_rate_vnd_per_km` | `车辆型号库.csv` | ✅ | 校准输出的 `base_rate_vnd_per_km` → 写入 CSV |
| `fuel_l_per_100km` | `车辆型号库.csv` | ❌ | 车型物理参数，不参与拟合 |
| `fuel_penalty`（车型） | `车辆型号库.csv` | ❌ | 车型物理参数 |
| `fuel_penalty`（货物） | `presets.py` | ❌ | 货物特性常量 |
| `max_load_ton` | `车辆型号库.csv` | ❌ | 车型物理参数 |
| `volume_capacity_m3` | `车辆型号库.csv` | ❌ | 车型物理参数 |
| `rate_multiplier` | `presets.py` | ❌ | 货物特性常量 |
| `wage_hourly_vnd` | `config.py` | ✅ | 校准输出 → 更新 `default_wage_hourly_vnd` |
| `fuel_price_vnd` | `config.py` 或用户输入 | ⚠️ 参考 | 校准拟合值仅供参考，优先用 Petrolimex 实时值 |
| 公式常量（阈值/系数） | `费用计算公式.py` | ❌ | 不在校准范围内 |

### 接收流程

```
校准输出 (calibration.py)
    │
    ├─ base_rate_vnd_per_km["high_side_10t"] = 32000
    │      ↓
    │   车辆型号库.csv 中 high_side_10t 行的 base_rate_vnd_per_km 列
    │      ↓
    │   距离成本 = D_km × 32000 × 货物系数 × (1 + 空返系数)
    │
    └─ wage_hourly_vnd = 200000
           ↓
         config.py: default_wage_hourly_vnd = 200000.0
           ↓
         时间成本 = 总用时 × 200000
```

### 不影响公式结构

**反算只优化参数值，不改变公式结构。** 速度惩罚阈值、休息规则、装卸时间、容量占比逻辑、费用分解方式——这些都在 `费用计算公式.py` 里，不受校准影响。

详细的桥接流程（判断→写入→验证→回滚）见 [运费反算SKILL.md §8](./运费反算SKILL.md#8-拟合结果应用到正算公式反算正算桥接) 和项目根目录 [SKILL.md §核心闭环工作流](../SKILL.md#核心闭环工作流反算优化--推导正算--应用上线)。
