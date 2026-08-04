# 运费反向测算（通用 Skill，不绑定任何特定 Agent 平台）

> 本文档面向任何能读 Markdown、能执行 shell 命令的编码 Agent
> （Claude Code / Hermes / Codex / 人工）。不依赖任何平台专属的 Skill 格式。
>
> **这是流水线的第二阶段（反推拟合），假定你已经有一份干净的样本 JSON 了。**
> 如果手头只有原始供应商报价文件（Excel/Word/PDF/格式混乱的表格），先看同文件夹下的
> [`报价数据提取SKILL.md`](./报价数据提取SKILL.md)——那份文档负责"把乱七八糟的原始
> 报价读出来、整理成标准样本格式"这一步（第一阶段）；这份文档只管"拿到标准样本之后
> 怎么反推市场费率"（第二阶段），两件事分开、各自专注。
>
> **互联文档:**
> - 项目总览/架构 → [项目根目录 SKILL.md](../SKILL.md)
> - 正算公式体系 → [正算公式SKILL.md](./正算公式SKILL.md)
> - 车型库变更 → [车辆型号库变更指南SKILL.md](../车辆型号库/车辆型号库变更指南SKILL.md)
> - **数据提取（规整表格）** → [报价数据提取SKILL.md](./报价数据提取SKILL.md)
> - **数据提取（非标格式：图片/聊天/PDF）** → [非标报价智能提取SKILL.md](./非标报价智能提取SKILL.md)

## 1. 解决什么问题

`OSRM++/backend` 是正向工具：给路线/货物/车辆参数，用 §6 的公式算出报价。
这个 skill 反过来做：**给一批真实的供应商报价/历史运单，反推出这批数据"暗示"的
市场费率**（车辆基础费率、司机时薪、油价），供人工判断要不要把
`backend/app/services/presets.py` 或 `backend/app/services/费用计算公式.py`
里的默认值调准一点。

**触发场景**：用户说"从 A 到 B 实际花了 XX 钱、用了多少小时、什么车、拉的什么货"
这样的真实数据，或者已经有一份 `报价数据提取SKILL.md` 处理好的 `samples_*.json`，
想知道"照这个数据反推，费率应该是多少"或者"我们现在的报价公式准不准"。

**核心原理**：报价公式对"车辆基础费率 R_base、司机时薪 R_wage、油价 P_fuel"这三类未知数
是线性的（其余系数如载重惩罚、货物类型倍率等视为已知常量）。
把每条运单的"实付价格 - 已知固定费用"当作方程的右边，"距离系数、总用时、油耗量"当作
方程左边的系数，多条运单就是一个线性最小二乘问题，样本越多、覆盖的路线/载重/工况越多样，
解出来的费率就越可信。这也是为什么"给的数据越多，正向计算就越准"——本质上是在给这个线性
方程组增加约束、降低不确定性。

## 2. 前置条件

- `OSRM++/backend` 的 Python 依赖已装好（`pip install -r requirements.txt`，包含 `numpy`）。
- 本地 OSRM 服务在跑（`start.ps1` 启动的 `osrm-routed`，默认 `http://localhost:5001`），
  用来把运单的起终点算成真实的距离/时间。如果运单数据里已经知道经纬度，不需要额外配置；
  如果只有地址文本，会自动调用 `/geocode`（Nominatim）转成经纬度。
- 手头的样本数据必须已经是 [`报价数据提取SKILL.md`](./报价数据提取SKILL.md) §3
  定义的那份标准 JSON 格式——字段、命名、经纬度嵌套结构的要求都在那份文档里，
  这里不重复写第二遍，照那边的格式准备数据。

## 3. 样本数量、多样性的要求，以及多个供应商文件怎么合并跑

- 每种具体车型（`vehicle_model_id`）至少 3-5 条样本，不然那个车型的费率解不出来或者不可信。
  报价费率表这种一次给几十条的正好能满足。
- 不要全是"同一个仓库发往各地"这种路线——如果所有样本的车速都差不多恒定（距离和时间
  几乎成正比），距离成本和时间成本这两项会解不开，即使总价预测准，拆分出来的单项费率
  也可能是负数或离谱的数字。报价费率表天然就是"同一个起点发往各地"，这一点尤其要注意——
  **多找几家供应商、或者补充一些逐单实际记录（尤其是空车返回/需要装卸的），把这几项的
  相关性解开**。
- 尽量让样本里有一些空车返回（`empty_return: true`）、一些需要装卸（`need_loading: true`）、
  不同载重比例（同一车型有些接近满载、有些半载）——这些条件会让距离/时间/油耗三项在
  数学上不再高度相关，拟合结果才稳。
- 每个供应商/来源文件应该已经各自是一份 `供应商报价/samples_<供应商名>.json`
  （提取阶段的产出），方便追溯来源、方便单独核对某家供应商的数据有没有问题。
- 想看"整体市场费率"，把所有供应商的 JSON 数组拼接成一份 `samples_all.json` 一起跑
  §4 的反算——样本来源越多样，拟合越稳。
- 想比较"不同供应商报价差多少"，也可以分别对每家单独跑一遍 §4，对比结果。
- **每种 `loading_mode` 分开满足数量要求**——`full_truck` 和 `consolidated` 是两套不同的
  线性方程组（拼货样本的距离/时间/油耗系数都先乘了 `capacity_ratio`），不能用一种模式的
  样本数量去凑另一种模式的"每车型至少3-5条"门槛，两边要分别达标。

## 4. 运行

```bash
cd OSRM++/backend
python -m app.services.calibration path/to/samples.json
```

Windows 终端如果中文乱码，加上环境变量强制 UTF-8 输出：

```bash
PYTHONIOENCODING=utf-8 python -m app.services.calibration path/to/samples.json
```

**样本文件可以混合 `full_truck` 和 `consolidated` 两种模式**——CLI 会按每条记录的
`loading_mode` 字段自动分组，分别跑 `fit_rates`，依次输出两段报告（每段前面打印
`===== loading_mode = xxx（N 条样本） =====` 分隔），不需要手动拆成两个文件。

## 5. 读懂输出

每个 `loading_mode` 各输出一段这样的 JSON：

```json
{
  "mode": "full_truck",
  "base_rate_vnd_per_km": { "high_side_5t": 47003, "high_side_10t": 152033 },
  "wage_hourly_vnd": 6838717,
  "fuel_price_vnd": -1195834,
  "sample_count": 63,
  "samples_per_vehicle": { "high_side_5t": 36, "high_side_10t": 18 },
  "rmse_vnd": 849754,
  "warnings": [],
  "predictions": [ { "notes": "...", "actual_cost_vnd": ..., "predicted_cost_vnd": ..., "error_pct": ... } ]
}
```

- `mode`：这段结果对应的 `loading_mode`，人工核对时确认没读错段落。
- `base_rate_vnd_per_km` / `wage_hourly_vnd` / `fuel_price_vnd`：拟合出来的三类费率，
  跟 `车辆型号库.csv` 里对应 `model_id` 那一行的 `base_rate_vnd_per_km` 列、
  `config.py` 里 `default_wage_hourly_vnd`、`default_fuel_price_vnd` 是对应关系
  （`base_rate_vnd_per_km` 现在是按具体车型 `model_id` 分组，不再是旧的 4 档
  `vehicle_type`）。
- `rmse_vnd` 和每条样本的 `error_pct`：拟合出的费率代入公式后，总价预测跟实付价格差多少。
  这个数字小，说明"整体报价准了"，但**不代表三项费率本身都可信**——见下面的坑。
- `warnings`：**一定要看**，可能出现：
  - 样本数少于未知数个数 -> 方程欠定，结果别用。
  - 条件数偏高（距离/时间/油耗高度相关）-> 总价预测可能是准的，但拆分出来的单项费率
    不可靠，通常是因为样本路线工况太单一（报价费率表尤其容易出现这个问题，见 §3），
    回去补更多样的样本。
  - 某项费率算出负数 -> 明确不能直接采用，要么数据有问题，要么就是上面的相关性问题。

## 6. 怎么应用结果

**不会自动改配置文件。** 建议流程：

1. 看 `warnings` 是否为空、`rmse_vnd`/`error_pct` 是否在可接受范围。
2. 没有警告、预测误差也能接受的话，把拟合出的数字和 `车辆型号库.csv` /
   `backend/app/config.py` 里当前的值做个对比，人工判断要不要改、改多少。
3. 改的话，直接编辑 `车辆型号库/车辆型号库.csv`（跟本文件所在的 `公式反算文件/` 是
   两个不同目录——车辆型号库是正算/反算共用数据，单独成目录）里对应 `model_id` 那一行的
   `base_rate_vnd_per_km` 列（Excel 打开改），或者
   `settings.default_wage_hourly_vnd`、`settings.default_fuel_price_vnd`，
   同步更新 `DEVELOPMENT_GOALS.md` 附录 A 里的参考数据说明来源和日期。改完 CSV 需要
   重启后端才能生效（`vehicle_registry.py` 只在启动时加载一次，不做热重载）。
4. 改完跑一下 `backend/tests/test_cost_engine.py` 确认没有把已有的单测断言值改坏
   （如果确实要调整默认费率，那些写死数字的单测也要跟着更新）。

## 7. 一个跑通的例子（合成数据，验证算法本身没问题）

`backend/tests/test_calibration.py` 里有构造数据的"round-trip"验证：人为设定一组已知的
`R_base`/`R_wage`/`P_fuel`，反推出一批"完美符合模型"的样本，再跑拟合，确认能精确recover
回原来设定的数字——这证明了拟合算法本身没问题。真实数据不会这么干净，跑出来的 `warnings`
和 `error_pct` 才是要重点看的部分。

## 8. 一个真实供应商报价的案例（含真实踩坑，读一遍再上手）

> **车型库版本说明（2026-07-16）**：此案例基于 2026-07-02 的车型库版本，当时仅有 3 档高栏车
> （`high_side_5t/10t/18t`）。当前车型库（`车辆型号库.csv`）已扩充到 6 档高栏车（5t/8t/10t/15t/18t/25t）
> + 6 档小卡车 + 8 档平板车，车型分档更细。如果要重新跑这份 DuyAnh 数据，建议在 Excel 中
> 按当前车型库的 `model_id` 重新映射，然后重新拟合——分档更细后拟合精度会有显著改善。

`供应商报价/samples_DuyAnh_Fushida.json` 就是照着
[`报价数据提取SKILL.md`](./报价数据提取SKILL.md) 的方法，把
`供应商报价/Báo Giá Fushida  (2026年7月2日).xlsx`（一份越南语的报价费率表，
北江省 Duy Anh 公司发给 Fushida 越南公司的车型/目的地价目矩阵）转出来的真实样本，
63 条（10 个目的地 × 7 档车型，减去起点终点同省份、地理编码重合的 1 组目的地），
全部是 `loading_mode: "full_truck"`。跑出来的结果（新车型体系下，
`vehicle_type`/`body_type` 已迁移映射到 `high_side_5t`/`high_side_10t`/`high_side_18t`
三个具体型号）：

```json
{
  "mode": "full_truck",
  "base_rate_vnd_per_km": { "high_side_5t": 47003, "high_side_10t": 152033, "high_side_18t": 321412 },
  "wage_hourly_vnd": 6838717,
  "fuel_price_vnd": -1195834,
  "sample_count": 63,
  "rmse_vnd": 849754,
  "warnings": ["拟合出的油价为负数（-1195834）..."]
}
```

**这个结果不能直接用**——`fuel_price_vnd` 是负数，工具自己就报了警告，平均预测误差
约 30% 上下（最差的几条能到 46% 以上）。原因刚好对应上面提到的两个坑，真实数据里都撞上了：

1. **单一供应商 + 单一起点，路线工况太单一**（§3 提到的坑）：这批样本全部从
   北江省一个点发出去，越南北部高速网络车速都差不多，距离和总用时高度相关，
   模型很难把"距离费"和"时间费"这两项拆干净——即使总价预测大致对，拆出来的
   单项费率（尤其是要跟距离费抢份额的油价）就可能失真甚至变负数。
2. **车型分档比报价单粗**（提取阶段 [`报价数据提取SKILL.md`](./报价数据提取SKILL.md)
   §5 提到的坑，新车型体系下同样存在，只是粒度比旧的 4 档略细一点）：报价单按 7 个
   吨位报价（1.5T 到 3 轴车），车型库当前只有 3 个 `high_side` 型号覆盖到这批数据，
   `high_side_5t` 一档要同时解释 1.5T/2.5T/3.5T 三个不同吨位的价格——误差最大的几条
   样本，正好都是被同一档"平均"掉、跟档内其他吨位价格差得比较远的那些行。
   在车辆型号库.csv 里为这几档吨位各自补一个更贴近的具体型号（比如单独加
   `high_side_1t5`/`high_side_2t5`/`high_side_3t5`），重新跑一遍这份数据的映射
   + 拟合，应该能显著改善这一项——这正是"车型库交给用户手工维护"这个设计想要达到的效果。

**怎么改善**：按 §3/§6 的建议，把这份报价单跟另一家供应商的报价、或者一批真实带
空车返回/需要装卸/往不同方向去的实际结算记录合并到一起再跑，
路线工况一多样，距离/时间/油耗这三项的相关性就能解开。**这不是本次演示失败，
而是工具的诊断机制按预期在起作用**——它没有在数据其实撑不住三项费率
都可信的情况下，硬编一个"看起来正常"的数字糊弄过去。

## 8. 拟合结果应用到正算公式（反算→正算桥接）

拟合本身不是终点——目的是用市场真实数据把正算公式的参数调准。以下是把校准输出写回系统的完整步骤：

### 8.1 判断哪些结果可以采纳

在应用任何拟合值之前，先对照 §5 的解读标准判断：

```
决策矩阵：
┌─────────────────┬──────────────────────────────────┐
│ warnings 为空    │ → 可以采纳，进入 §8.2              │
│ 且有 ≥3 条样本   │                                    │
├─────────────────┼──────────────────────────────────┤
│ warnings 非空    │ → 部分采纳：只采纳样本充足的车型     │
│ 但部分车型有     │   base_rate，wage/fuel_price 不用   │
│ ≥3 条样本        │   拟合值，改用固定参数模式重跑       │
├─────────────────┼──────────────────────────────────┤
│ 全部 < 3 条样本  │ → 不采纳，回去补样本               │
│ 或全是负数       │                                    │
└─────────────────┴──────────────────────────────────┘
```

### 8.2 更新车辆型号库.csv（车型基础费率）

对于每个通过审核的 model_id，把 `base_rate_vnd_per_km` 四舍五入后写入 CSV：

```
原始 CSV 行：
high_side,high_side_10t,高栏车 10吨,10.0,35,7.6,2.3,2.0,27500,18.0,0,0,0,truck,...

校准输出：
"base_rate_vnd_per_km": {"high_side_10t": 32000, ...}
                                                        ↓
更新后 CSV 行：
high_side,high_side_10t,高栏车 10吨,10.0,35,7.6,2.3,2.0,32000,18.0,0,0,0,truck,...
```

**注意事项：**
- Excel 打开 CSV 直接改，保存后重启后端生效
- 改完在 CSV 的 `notes` 列标注更新日期和数据来源（如 "2026-07-03 校准更新，源:DuyAnh报价"）
- 备份原 CSV（`cp 车辆型号库.csv 车辆型号库_20260703.csv`）

### 8.3 更新 config.py（全局参数）

```python
# backend/app/config.py
# 如果 wage_hourly_vnd 拟合结果可信（非负、条件数不偏高）：
default_wage_hourly_vnd: float = 200000.0  # ← 更新为拟合值

# fuel_price_vnd 优先用 Petrolimex 实时值（见 cron 任务），
# 拟合值仅作参考——因为样本的路线工况单一，拟合油价通常不可靠
```

### 8.4 验证更新后的正算公式

```bash
cd OSRM++/backend

# 1. 重启后端加载新 CSV
docker restart osrmplus-backend

# 2. 跑正算单测（如果改了费率，单测里的断言值可能需要更新）
python -m pytest test_cost_engine.py -v

# 3. 手算验算：抽查几个典型路线
python -c "
from app.services.cost_engine import compute_cost_full_truck
r = compute_cost_full_truck(
    distance_m=300000, duration_s=14400, cargo_weight_ton=15,
    vehicle_model_id='high_side_18t',
    fuel_price_vnd=21170, wage_hourly_vnd=180000,
    loading_rate_vnd_per_ton=50000, insurance_rate=0.003,
)
bd = r.breakdown
print(f'距离:{bd.cost_distance:,.0f} 时间:{bd.cost_time:,.0f} 油耗:{bd.cost_fuel:,.0f} 总:{bd.cost_total:,.0f}')
"

# 4. 对比：新报价 vs 原始供应商报价
# 从校准输出的 predictions 数组里，抽几条误差最大的，
# 用新 CSV 重新跑正算，看误差是否缩小
```

### 8.5 回滚

如果更新后发现报价异常，恢复备份的 CSV 并重启：

```bash
cp 车辆型号库_20260703.csv 车辆型号库.csv
docker restart osrmplus-backend
```

---

## 9. 与正算公式的一致性约束

反算的本质是用同一套公式"反过来"解费率，所以正算和反算必须对每一个计算环节给出相同的数值。以下检查点在改过公式后必须验证：

### 时间链一致性

```python
# 正算（cost_engine._compute_for_model）
_sf, _adj, _rest, _loading, total_duration_h = 公式.计算总用时(
    载重比例=load_ratio, 原始行驶小时=t_raw_h,
    货物重量吨=cargo_weight_ton, 需要装卸=need_loading,
)

# 反算（calibration._design_row）— 同一个函数
_sf, _adj, _rest, _loading, total_duration_h = 公式.计算总用时(
    载重比例=load_ratio, 原始行驶小时=t_raw_h,
    货物重量吨=weight_ton, 需要装卸=sample.need_loading,
)
```

✅ 2026-07-03 已提取为共用函数，保证两边完全一致。

### 设计矩阵系数一致性

| 系数 | 正算值 | 反算设计矩阵行 | 必须相等 |
|------|--------|--------------|:---:|
| `distance_coef` | `D_km × multiplier × (1+return) × ratio` | `calibration._design_row` 第 0 列 | ✅ |
| `fuel_coef` | `D_km × fuel_rate × load_factor × (1+fuel_penalty) × ratio` | 最后列（P_fuel） | ✅ |
| `time_coef` | `total_duration × ratio` | 倒数第 2 列（R_wage） | ✅ |

### fixed_known 分类一致性

两类费用在正算和反算中必须用相同的"是否受 capacity_ratio 影响"分类：

| 费用项 | 正算（cost_engine） | 反算（_design_row.fixed_known） |
|--------|:---:|:---:|
| 装卸费 | 不打折 | 不打折 |
| 保险费 | 不打折 | 不打折 |
| misc | 不打折 | 不打折 |
| 路桥费 | × ratio | × ratio |
| 车身附加费 | × ratio | × ratio |
| 三项路况附加 | × ratio | × ratio |

### 验证方法

改过 `费用计算公式.py` 或 `_design_row` 后，跑：

```bash
cd OSRM++/backend
python -m pytest test_cost_engine.py test_calibration.py -v
```

两个测试文件的 fixture 是独立维护的（刻意不耦合真实 CSV），改公式结构时两个都要同步更新。

---

## 10. 局限性

- 只拟合 `base_rate_vnd_per_km` / `wage_hourly_vnd` / `fuel_price_vnd` 这三类；
  货物类型倍率、车身类型倍率、重载速度惩罚阈值等假设是准的、不参与拟合。
  如果连这些也要反推，需要更多样、更大量的数据，且要改 `calibration.py` 里的
  设计矩阵去增加对应的未知数列。
- 依赖本地 OSRM 服务把路线换算成距离/时间；如果历史运单的实际路线跟当前 OSRM 地图
  数据算出来的最优路线不完全一致（比如实际绕了远路、走了收费站），会引入误差。
- 供应商报价单的目的地经常只写到省/市一级（不是具体收货地址），地理编码只能定位到
  该省市的大概位置（一般是省会/市中心），跟实际收货点之间的距离会有误差；如果知道
  具体收货地址，优先用具体地址。
- 报价费率表假设"满载"，如果供应商实际报价是按某个固定吨位（不是车辆额定载重）算的，
  拟合出来的费率会偏；这种情况下最好能从供应商那边确认一下报价基准吨位。
- 车型库粒度仍然可能比供应商报价单粗（比如报价单按 7 个吨位报价，车型库某个大类下
  只有 2-3 个具体型号），多个真实吨位映射到同一个 `model_id` 会导致同档内价格被
  平均化；这个问题不需要改代码解决——直接在 `车辆型号库.csv` 里补充更细的具体型号
  （Excel 里加一行），重新映射、重新跑一遍拟合即可，见 §8 的真实案例。
- `consolidated` 样本的 `capacity_ratio` 是在 resolve 阶段用当次读到的
  `车辆型号库.csv` 内容算出来的（重量/体积占该车型载重/容积的比例）——如果
  `车辆型号库.csv` 后续改了某个车型的 `max_load_ton`/`volume_capacity_m3`，
  历史样本重新跑一遍时 `capacity_ratio` 会跟着变，拟合结果不是对旧 CSV 版本稳定的。
  如果需要精确复现某一次历史拟合的结果，要连同当时的 `车辆型号库.csv` 版本一起留存
  （比如拟合前先复制一份带日期后缀的快照）。
