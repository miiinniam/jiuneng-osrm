# OSRM++ 越南运输费用预测工具 — 开发目标

> **项目代号**: OSRM++  
> **目标**: 基于 OSRM 路由引擎，构建面向越南市场的运输费用智能预测系统  
> **最终用户**: 玖能国际（JIUNENG International）物流 / 关务 / 贸易团队  
> **核心原则**: 用户只需填写核心业务信息（路线、货物、车辆），其余由系统智能计算；公式透明、可审计、可修改  

---

## 目录

1. [项目愿景](#1-项目愿景)
2. [技术栈](#2-技术栈)
3. [系统架构](#3-系统架构)
4. [用户界面设计](#4-用户界面设计)
5. [后台处理引擎](#5-后台处理引擎)
6. [核心计算公式](#6-核心计算公式)
7. [数据模型](#7-数据模型)
8. [API 设计](#8-api-设计)
9. [开发阶段与里程碑](#9-开发阶段与里程碑)
10. [非功能性需求](#10-非功能性需求)
11. [风险与应对](#11-风险与应对)

---

## 1. 项目愿景

### 1.1 我们要解决什么问题？

越南运输市场缺乏透明、标准化的费用预测工具。当前痛点：

- **报价依赖经验**：不同业务员对同一条路线给出的报价差异大
- **外部变量多**：油价波动、车辆类型、货物重量、是否空返 — 人工计算容易遗漏
- **缺乏可视化**：客户看不到路线，无法理解费用构成
- **批量处理困难**：多条路线的比价/预算需要逐条手算

### 1.2 目标用户画像

| 角色 | 典型场景 | 核心需求 |
|------|----------|----------|
| **物流业务员** | 日常给客户报价 | 快速出价、模板复用、费用透明 |
| **运营主管** | 月度成本分析、路线优化 | 批量导入、灵敏度分析、历史记录 |
| **客户 / 合作伙伴** | 询价、比价 | 地图可视化、明细拆解、PDF 报价单 |

### 1.3 成功指标（MVP）

- [x] 单条路线从输入到出价 **< 10 秒**
- [x] 费用误差控制在 **±15%** 以内（对照人工报价）
- [x] 支持 **3 种以上** 车辆类型
- [x] 支持 **批量导入/导出** Excel
- [x] 越南语 + 中文双语言界面

---

## 2. 技术栈

| 层 | 技术选择 | 原因 |
|----|----------|------|
| **路由引擎** | OSRM (Open Source Routing Machine) | 本地部署、毫秒级响应、支持 truck/car/foot 等多种 profile |
| **地理编码** | Nominatim / Photon (本地部署) | 地址 ↔ 经纬度转换，离线可用 |
| **地图前端** | Leaflet.js + Leaflet Routing Machine | 轻量、成熟、可与 OSRM 直连 |
| **后端框架** | Python FastAPI | 异步高性能、生态丰富（pandas, openpyxl） |
| **前端框架** | React (Next.js) + Tailwind CSS | 生态成熟、SSR 可选、适合表单密集型应用 |
| **数据库** | PostgreSQL + PostGIS（路线缓存），SQLite（轻量部署） | 兼顾性能与可移植性 |
| **任务队列** | Celery + Redis（批量计算） | 异步批量处理 |
| **部署** | Docker Compose（一体化） | 一键部署 OSRM + API + 前端 |

---

## 3. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                      前端 (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 路线输入  │  │ 货物参数  │  │ 车辆选择  │  │ 费用展示  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Leaflet 地图 + 路线预览                   │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────┬───────────────────────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼───────────────────────────────────────────┐
│                   API 层 (FastAPI)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ /route   │  │ /cost    │  │ /batch   │  │ /export  │ │
│  │ 路线计算  │  │ 费用预测  │  │ 批量处理  │  │ 报价导出  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
│ OSRM 引擎   │ │ 费用计算器 │ │ 任务队列       │
│ (Docker)    │ │ (Python)   │ │ Celery+Redis  │
└──────┬──────┘ └─────┬──────┘ └────┬──────────┘
       │              │              │
┌──────▼──────────────▼──────────────▼────────────────────┐
│                    数据层                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 路线缓存  │  │ 费用历史  │  │ 用户模板  │  │ 油价快照  │ │
│  │PostgreSQL │  │PostgreSQL│  │PostgreSQL│  │PostgreSQL│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 4. 用户界面设计

### 4.1 整体布局

采用 **左地图 + 右表单** 的经典布局：

```
┌──────────────────────────┬─────────────────────┐
│                          │ 步骤指示器 (1→2→3→4) │
│                          ├─────────────────────┤
│     Leaflet 地图          │                     │
│     (路线实时预览)         │   分步表单区域       │
│                          │                     │
│                          │   · 路线信息         │
│   🅰 起点标记              │   · 货物信息         │
│   🅱 终点标记              │   · 车辆参数         │
│   🔵 途经点（可选）        │   · 成本参数         │
│                          │                     │
│   路线高亮 + 距离标注      ├─────────────────────┤
│                          │  实时预估结果面板     │
│                          │  总费用: xxx VND     │
│                          │  距离: xxx km        │
│                          │  时间: xxx 小时      │
│                          │  [保存模板] [导出]    │
└──────────────────────────┴─────────────────────┘
```

### 4.2 步骤 1：基本路线信息

**字段清单：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 起点 | 文本输入 + 地图点选 | ✅ | 支持地址搜索（Nominatim），自动补全 |
| 终点 | 文本输入 + 地图点选 | ✅ | 同上 |
| 途经点 | 动态列表（可增删） | ❌ | 支持多点配送路线 |
| 出发日期/时间 | DateTimePicker | ❌ | 用于精确时间预测（考虑高峰时段） |

**交互细节：**
- 输入地址后自动地理编码 → 地图标记
- 地图点击直接选点（反地理编码填回输入框）
- 途经点支持拖拽排序

### 4.3 步骤 2：货物信息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 货物重量 | 数字输入（吨/kg 切换） | ✅ | 影响油耗和载重速度因子 |
| 货物体积 | 数字输入（m³） | 拼货模式下 ✅，整车模式 ❌ | 拼货（consolidated）模式下用于匹配车型运力，见 §4.4 |
| 货物类型 | 下拉选择 | ✅ | 普通 / 冷链 / 危险品 / 超大件 / 其他 |

**货物类型对费用的影响：**

| 货物类型 | 费率调整 | 特殊要求 |
|----------|----------|----------|
| 普通货物 | 1.0× | — |
| 冷链/易腐 | 1.3× | 需冷链车辆，油耗+20% |
| 危险品 | 1.5× | 专用路线、保险附加费 |
| 超大件 | 1.4× | 可能需护送车辆 |
| 重型设备 | 1.5× | 需低平板挂车，通常需超限运输许可 |

### 4.4 步骤 3：车辆与运输方式

面向设备/机械物流客户，装车方式分两类，对应两套不同计价公式（详见 §6.3.0/§6.3.1-6.3.4
里"拼货可分摊费用"的说明）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 装车方式 | 单选 | ✅ | `consolidated`（拼货，多家货物共用一辆车）/ `full_truck`（整车，专车专线） |
| 车型 | 下拉选择（按大类分组） | 仅 `full_truck` 必填 | `consolidated` 模式由系统在所有装得下的车型里自动匹配总价最低的一个，用户不选 |
| 是否空车返回 | 复选框 | ❌ | 勾选后返程费用计入 |
| 是否需要装卸服务 | 复选框 | ❌ | 按重量加收装卸费 |

**车辆型号库：** 车型不再是固定档位，而是维护在
`OSRM++/车辆型号库/车辆型号库.csv` 里的一份可由用户在 Excel 中直接编辑的清单（正算/反算
共用的车辆主数据，单独成目录，不属于"反算专属"，所以没有放进 `公式反算文件/`），
分 5 大类——小卡车(`small_box`) / 平板车(`flatbed`) / 高栏车(`high_side`) /
集装箱车(`container`) / 冷链车(`cold_chain`)，每类下有多个具体型号，各自独立维护
载重上限、（可选的）厢体容积、货厢尺寸、基础费率、油耗、路桥费率等参数。后端启动时
一次性加载这份 CSV（`backend/app/services/vehicle_registry.py`），改了 CSV 需要
重启后端才生效；前端通过 `GET /reference/vehicle-models` 动态获取当前车型列表，
不在本文档或代码里重复列出具体数值。

### 4.5 步骤 4：成本参数（高级）

这些参数有 **系统默认值**，高级用户可展开修改：

| 字段 | 默认值来源 | 用户可修改 |
|------|-----------|-----------|
| 当前油价 (VND/L) | Petrolimex 自动拉取 | ✅ |
| 司机小时工资 (VND/h) | 系统预设 180,000 | ✅ |
| 高速偏好 | 优先 / 避开 / 无所谓 | ✅ |
| 装卸费 (VND/吨) | 50,000 | ✅ |
| 保险费率 | 货值 × 0.3% | ✅ |
| 特殊要求 | 文本框（夜间配送、避开收费站等） | ✅ |

### 4.6 高级功能界面

#### 模板管理
- **保存为模板**：一键保存当前配置（路线 + 车辆 + 参数）
- **加载模板**：下拉菜单选择常用模板快速填充
- **模板列表**：管理（重命名 / 删除 / 设为默认）

#### 批量模式
- **上传 Excel**：拖拽或点击上传
- **Excel 模板下载**：提供标准模板（起点、终点、重量、车辆类型）
- **批量结果表格**：每行一个计算结果，支持排序/筛选
- **批量导出**：一键导出全部结果为 Excel

#### 历史记录
- 表格视图：日期、路线、费用、操作人
- 搜索与筛选：按日期范围、路线、车辆类型
- 点击行查看完整明细（地图 + 费用拆解）

---

## 5. 后台处理引擎

### 5.1 请求处理流程

```
用户提交表单
    │
    ▼
┌─────────────────────┐
│ 1. 地址 → 经纬度     │  Nominatim / Photon 地理编码
│    缓存编码结果       │  Redis (TTL 30天)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 2. OSRM Route API   │  GET /route/v1/{profile}/{coords}
│    · profile 按车型   │  ?alternatives=false
│    · 获取 distance    │  &steps=false
│    · 获取 duration    │  &overview=full
│    · 获取 geometry    │  &geometries=geojson
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 3. 数据调整          │
│    · 速度因子（载重）  │
│    · 休息时间计算     │
│    · 装卸时间附加     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 4. 费用计算          │  详见 §6 核心计算公式
│    · 距离成本         │
│    · 时间成本         │
│    · 油耗成本         │
│    · 固定费用         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ 5. 结果组装 & 返回    │
│    · GeoJSON 路线     │
│    · 费用明细 JSON    │
│    · 总报价           │
│    · 智能建议         │
└─────────────────────┘
```

### 5.2 OSRM 集成细节

```python
# 伪代码：OSRM 调用封装
# osrm_profile 现在是车辆型号库.csv 里每个具体 model_id 自带的一列（driving/truck），
# 不再需要单独维护一张 vehicle_type -> profile 的映射表
class OSRMClient:
    BASE_URL = "http://osrm:5000"

    def get_route(
        self,
        coordinates: list[tuple[float, float]],  # [(lng, lat), ...]
        osrm_profile: str,
        alternatives: bool = False,
    ) -> RouteResult:
        profile = osrm_profile
        coords_str = ";".join(f"{lng},{lat}" for lng, lat in coordinates)
        
        response = httpx.get(
            f"{self.BASE_URL}/route/v1/{profile}/{coords_str}",
            params={
                "alternatives": str(alternatives).lower(),
                "steps": "false",
                "overview": "full",
                "geometries": "geojson",
            },
        )
        data = response.json()
        route = data["routes"][0]
        
        return RouteResult(
            distance_meters=route["distance"],       # 米
            duration_seconds=route["duration"],       # 秒
            geometry=route["geometry"],               # GeoJSON
        )
```

**OSRM Profile 定制需求：**
- 需要为 `truck` profile 定制越南特定的限高、限重参数
- 需要本地 OSRM 数据（越南 + 中国边境地图）

### 5.3 地理编码集成

- **首选**：本地 Photon（基于 Nominatim，性能更好）
- **备用**：Nominatim（更精确，但更慢）
- **缓存策略**：Redis 缓存地理编码结果 30 天，相同地址不重复查询

---

## 6. 核心计算公式

### 6.1 变量定义

| 变量 | 含义 | 单位 | 来源 |
|------|------|------|------|
| `D_raw` | OSRM 原始距离 | 米 | OSRM API |
| `T_raw` | OSRM 原始行驶时间 | 秒 | OSRM API |
| `W_cargo` | 货物重量 | 吨 | 用户输入 |
| `W_max` | 车辆载重上限 | 吨 | 车辆型号库（`车辆型号库.csv`） |
| `V_cargo` | 货物体积 | m³ | 用户输入（拼货模式必填） |
| `V_max` | 车型厢体容积上限 | m³ | 车辆型号库；平板车等无厢体车型为空，不参与体积占比计算 |
| `capacity_ratio` | 拼货容量占比 | — | §6.3.0，整车模式恒为 1.0 |
| `P_fuel` | 当前油价 | VND/L | Petrolimex / 手动 |
| `R_wage` | 司机小时工资 | VND/h | 系统预设 / 手动 |
| `F_consumption` | 车辆油耗率 | L/km | 车辆型号库（`车辆型号库.csv`） |
| `R_base` | 车辆基础费率 | VND/km | 车辆型号库（`车辆型号库.csv`） |
| `C_type` | 货物类型系数 | — | 货物类型查表 |

### 6.2 时间调整

#### 6.2.1 速度因子（重载惩罚）

```
              ┌ 1.00    if W_cargo / W_max ≤ 0.5   (轻载，正常速度)
speed_factor = ┤ 1.15    if 0.5 < W_cargo / W_max ≤ 0.8  (中载，慢15%)
              └ 1.25    if W_cargo / W_max > 0.8          (重载，慢25%)
```

```
T_adjusted = T_raw × speed_factor
```

#### 6.2.2 强制休息时间（越南交规）

```
rest_hours = 0
remaining = T_adjusted

while remaining > 4:
    rest_hours += 0.5          # 每连续驾驶4小时，强制休息30分钟
    remaining -= 4

if T_adjusted > 8:
    rest_hours += 8            # 单日驾驶超8小时需过夜休息
```

#### 6.2.3 装卸时间

```
T_loading = W_cargo × 0.5     # 每吨货物装卸0.5小时
```

> **或可配置**：装卸时间按固定值（如 1 小时）+ 每吨附加

#### 6.2.4 总用时

```
T_total = T_adjusted + rest_hours + T_loading
```

### 6.3 费用分解

#### 6.3.0 拼货容量占比（仅拼货/`consolidated` 模式使用）

```
                    ┌ W_cargo / W_max                                  if V_max 为空（如平板车无厢体）
capacity_ratio = max┤
                    └ max(W_cargo / W_max, V_cargo / V_max)            否则
```

拼货场景下，这批货占用了匹配车型的多大比例运力——按重量比和体积比取较大值（哪个先
"装满"就按哪个算）。**整车模式下 `capacity_ratio` 恒为 1.0**，是这个公式的特例，
§6.3.1-6.3.4 里标注"可分摊"的子项才会乘这个系数，整车模式乘 1.0 等价于不打折。
拼货模式下具体用哪个车型（也就是 `W_max`/`V_max` 取哪个型号的值），由系统在车型库里
自动匹配总价最低、且能装下这批货物的型号，见 §4.4。

> **已知的模型简化**：`capacity_ratio` 只按"这一批货物自己的重量体积"计算，不建模
> "同一辆车上可能还装着其他货主的货物"——系统拿不到其他货主的数据，这是当前版本的
> 天然局限。

#### 6.3.1 距离成本（基础运费）

```
D_km = D_raw / 1000                                          # 米→公里

cost_distance_full = D_km × R_base × C_type × (1 + return_factor)
cost_distance = cost_distance_full × capacity_ratio

# return_factor: 空车返回 = 0.5（返程50%费用），不空返 = 0
```

#### 6.3.2 时间成本

```
cost_time_full = T_total × R_wage
cost_time = cost_time_full × capacity_ratio
```

#### 6.3.3 油耗成本

```
fuel_per_km = F_consumption / 100                            # L/100km -> L/km
cost_fuel_full = D_km * fuel_per_km * P_fuel * load_factor * (1 + combined_fuel_penalty)
cost_fuel = cost_fuel_full * capacity_ratio

# combined_fuel_penalty = cargo fuel penalty + vehicle fuel penalty (stacked)
#   e.g.: cold_chain cargo(0.20) + diesel reefer(0.25) = 0.45 total
#
# load_factor (per cargo weight / vehicle max load, NOT affected by capacity_ratio):
#   W_cargo / W_max <= 0.5  -> 1.0
#   W_cargo / W_max >  0.5  -> 1.0 + 0.2 * (W_cargo / W_max - 0.5)
```

#### 6.3.4 固定费用

```
cost_fixed = cost_loading + cost_insurance + cost_toll + cost_body_surcharge
           + cost_restricted_zone + cost_construction_zone + cost_mountain_road
           + cost_misc
```

| 子项 | 计算公式 | 是否受 `capacity_ratio` 影响 | 说明 |
|------|----------|:---:|------|
| 装卸费 `cost_loading` | `W_cargo × 50,000` | 否，全额 | 50,000 VND/吨，可配置，按实际重量收，本身已经是"这批货专属" |
| 保险费 `cost_insurance` | `cargo_value × 0.003` | 否，全额 | 货值 × 0.3%（需用户输入货值），保的是这批货自己的价值 |
| 路桥费 `cost_toll` | `D_km × toll_rate × capacity_ratio` | 是 | 高速费率，按车型查表；拼货模式是"整趟车"性质的费用，按占用运力比例分摊 |
| 车身附加费 `cost_body_surcharge` | `车型固定附加费 × capacity_ratio` | 是 | 比如冷链机组维护，每趟固定收一次，拼货模式同样按运力比例分摊 |
| 禁限行绕行费 `cost_restricted_zone` | `150,000 × cargo_rate_multiplier × capacity_ratio` | 是 | 用户手动勾选触发（本地地图无实时限行数据），占位金额待核实 |
| 施工封闭绕行费 `cost_construction_zone` | `150,000 × cargo_rate_multiplier × capacity_ratio` | 是 | 用户手动勾选触发（本地地图无实时封路数据），占位金额待核实 |
| 上坡山区附加费 `cost_mountain_road` | `200,000 × cargo_rate_multiplier × capacity_ratio` | 是 | 用户手动勾选触发（本地地图无坡度数据），占位金额待核实 |
| 其他 `cost_misc` | 用户自定义 | 否，全额 | 文本框输入固定金额，含义不明确，按不分摊处理 |

> `combined_rate_multiplier` = 货物类型系数（拼货/整车双模式改造之前是"货物类型系数 ×
> 车身类型系数"，现在车身/车型的差异已经直接体现在具体车型的 `R_base` 数字里，
> 不再需要独立的车身系数，这是本次改造带来的语义简化）。危险品/超大件/冷链货物
> 本来系数就更高，这三项路况附加费也会同步多收，不需要再为"特种货物"单独建一套系数。

#### 6.3.5 总费用

```
cost_total = cost_distance + cost_time + cost_fuel + cost_fixed
```

#### 6.3.6 输出指标

```
cost_per_km = cost_total / D_km                              # 每公里成本
cost_per_ton_km = cost_total / (D_km × W_cargo)              # 吨公里成本（物流KPI）
```

### 6.4 批量模式特殊处理

批量模式下使用 **OSRM Table API** 而非 Route API：

```python
# OSRM Table API — 一次请求获取所有起终点对的矩阵
# GET /table/v1/{profile}/{coords}
# 返回距离矩阵 + 时间矩阵

# 然后对每一对 (origin_i, destination_j) 单独计算费用
```

---

## 7. 数据模型

### 7.1 核心表结构

```sql
-- 报价记录
CREATE TABLE quotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 路线
    origin_address  TEXT NOT NULL,
    origin_lat      DOUBLE PRECISION NOT NULL,
    origin_lng      DOUBLE PRECISION NOT NULL,
    dest_address    TEXT NOT NULL,
    dest_lat        DOUBLE PRECISION NOT NULL,
    dest_lng        DOUBLE PRECISION NOT NULL,
    waypoints       JSONB,                  -- [{lat, lng, address}, ...]
    
    -- 货物
    cargo_weight_kg DOUBLE PRECISION NOT NULL,
    cargo_volume_m3 DOUBLE PRECISION,
    cargo_type      VARCHAR(50) NOT NULL,   -- normal, cold_chain, hazardous, oversized, other
    
    -- 车辆
    loading_mode    VARCHAR(20) NOT NULL,   -- consolidated, full_truck
    vehicle_model_id VARCHAR(50),           -- full_truck 必填；对应车辆型号库.csv 的 model_id
    empty_return    BOOLEAN DEFAULT FALSE,
    need_loading    BOOLEAN DEFAULT FALSE,
    
    -- 成本参数（快照）
    fuel_price_vnd  DOUBLE PRECISION NOT NULL,
    wage_hourly_vnd DOUBLE PRECISION NOT NULL,
    highway_pref    VARCHAR(20) DEFAULT 'prefer',  -- prefer, avoid, neutral
    
    -- OSRM结果
    route_distance_m  DOUBLE PRECISION,
    route_duration_s  DOUBLE PRECISION,
    route_geometry    JSONB,               -- GeoJSON
    
    -- 计算结果
    adjusted_duration_h DOUBLE PRECISION,
    rest_hours          DOUBLE PRECISION,
    loading_hours       DOUBLE PRECISION,
    total_duration_h    DOUBLE PRECISION,
    
    cost_distance    DOUBLE PRECISION,
    cost_time        DOUBLE PRECISION,
    cost_fuel        DOUBLE PRECISION,
    cost_fixed       DOUBLE PRECISION,
    cost_total       DOUBLE PRECISION,
    
    -- 元数据
    user_id         VARCHAR(100),
    template_id     UUID REFERENCES templates(id),
    notes           TEXT
);

-- 用户模板
CREATE TABLE templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    user_id         VARCHAR(100),
    config          JSONB NOT NULL,         -- 序列化表单配置
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 油价快照
CREATE TABLE fuel_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(50) NOT NULL,   -- petrolimex, manual
    price_vnd       DOUBLE PRECISION NOT NULL,
    fuel_type       VARCHAR(20) DEFAULT 'diesel', -- diesel, ron95, ron92
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 车辆型号库：不再是数据库表，改为文件维护
-- （OSRM++/车辆型号库/车辆型号库.csv，用户直接用 Excel 编辑，后端启动时一次性加载，
--  见 backend/app/services/vehicle_registry.py；如果未来要接入管理界面增删改，
--  再评估是否迁回数据库表）

-- 货物类型费率
CREATE TABLE cargo_type_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cargo_type      VARCHAR(50) UNIQUE NOT NULL,
    rate_multiplier DOUBLE PRECISION NOT NULL,  -- 对距离成本的倍率
    fuel_penalty    DOUBLE PRECISION DEFAULT 0   -- 油耗额外增加百分比
);
```

### 7.2 缓存策略

| 缓存项       | 存储              | TTL   | 说明            |
| --------- | --------------- | ----- | ------------- |
| 地理编码结果    | Redis           | 30 天  | 地址→经纬度，极少变动   |
| OSRM 路线结果 | Redis           | 24 小时 | 相同起终点+相同车型可复用 |
| 油价        | Redis           | 24 小时 | 越南油价每天更新1次    |
| 模板配置      | 前端 localStorage | 永久    | 用户模板本地缓存      |


---

## 8. API 设计

### 8.1 RESTful API 端点

```
基础路径: /api/v1

POST   /quotations               创建报价（单条）
GET    /quotations               报价列表（分页 + 筛选）
GET    /quotations/{id}          报价详情（含路线 GeoJSON）
DELETE /quotations/{id}          删除报价

POST   /quotations/batch         批量报价（上传 Excel）
GET    /quotations/batch/{job_id} 查询批量任务状态

GET    /route                    获取路线（不保存报价）
POST   /route/cost               即时计算费用（不保存）

GET    /templates                模板列表
POST   /templates                创建模板
PUT    /templates/{id}           更新模板
DELETE /templates/{id}           删除模板

GET    /reference/vehicles       车辆类型预设参数
GET    /reference/cargo-types    货物类型费率
GET    /reference/fuel-price     当前油价

GET    /export/{id}?format=pdf   导出报价单 PDF
GET    /export/{id}?format=xlsx  导出报价 Excel
```

### 8.2 请求/响应示例

#### POST /quotations

```json
// Request
{
  "route": {
    "origin": "友谊关, 凭祥市, 广西",
    "destination": "Hanoi, Vietnam",
    "waypoints": [],
    "departure": "2026-07-02T08:00:00+07:00"
  },
  "cargo": {
    "weight_kg": 15000,
    "volume_m3": 45.0,
    "type": "normal"
  },
  "vehicle": {
    "type": "heavy_truck",
    "empty_return": false,
    "need_loading": true
  },
  "cost_params": {
    "fuel_price_vnd": 24500,
    "wage_hourly_vnd": 180000,
    "highway_pref": "prefer"
  }
}

// Response
{
  "id": "uuid-xxx",
  "route": {
    "distance_km": 172.5,
    "duration_h": 3.8,
    "geometry": { /* GeoJSON */ }
  },
  "breakdown": {
    "cost_distance": 2587500,
    "cost_time": 1026000,
    "cost_fuel": 1488375,
    "cost_fixed": 800000,
    "cost_total": 5901875,
    "cost_per_km": 34216,
    "cost_per_ton_km": 2281
  },
  "suggestions": [
    "建议白天出发，避开晚间山路",
    "重载运输，预计需1名司机"
  ]
}
```

---

## 9. 开发阶段与里程碑

### Phase 0：基础设施搭建（Week 1-2）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| OSRM Docker 部署 | 本地可访问 OSRM API | P0 |
| 越南地图数据导入 | OSRM 可计算越南境内路线 | P0 |
| Python 项目骨架 | FastAPI + 目录结构 + Dockerfile | P0 |
| React 项目骨架 | Next.js + Tailwind + Leaflet | P0 |
| 数据库 Schema 建表 | PostgreSQL/PostGIS 初始化 | P0 |

### Phase 1：核心计算引擎（Week 3-4）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 地理编码服务集成 | 地址→经纬度转换 | P0 |
| OSRM 集成模块 | 封装 Route/Table API 调用 | P0 |
| 费用计算引擎 | 实现 §6 全部公式 | P0 |
| 车辆/货物预设 CRUD API | 参数可配置 | P0 |
| 单元测试 | 费用计算正确性验证 | P0 |

### Phase 2：单条报价 MVP（Week 5-6）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 分步表单 UI | 4 步表单 + 表单验证 | P0 |
| 地图组件 | Leaflet 集成 + 路线绘制 | P0 |
| 实时预估面板 | 即时显示费用概要 | P0 |
| 创建/查看报价 API | 完整 CRUD | P0 |
| 模板管理 | 保存/加载/删除模板 | P1 |

### Phase 3：批量与导出（Week 7-8）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| Excel 批量导入 | 文件上传 + 解析 + 验证 | P1 |
| 异步批量计算 | Celery 任务队列 | P1 |
| 批量结果展示 | 表格 + 筛选 + 排序 | P1 |
| PDF 报价单导出 | 含地图截图 + 费用明细 | P1 |
| Excel 结果导出 | 批量结果一键下载 | P1 |

### Phase 4：高级功能（Week 9-10）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 历史记录查询 | 搜索 + 筛选 + 分页 | P1 |
| 灵敏度分析 | "重量+10% → 费用变化" | P2 |
| 实时油价自动拉取 | Petrolimex 定时同步 | P2 |
| 多语言 (vi/zh/en) | i18n 框架 + 翻译 | P1 |
| 智能建议引擎 | 基于规则的建议生成 | P2 |

### Phase 5：打磨与上线（Week 11-12）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 性能优化 | 缓存层 + 查询优化 | P1 |
| UI/UX 打磨 | 响应式适配 + 移动端 | P1 |
| 压力测试 | 批量 100 条路线并发 | P2 |
| 文档 | 用户手册 + API 文档 | P1 |
| Docker Compose 一键部署 | 单命令启动全套服务 | P1 |

---

## 10. 非功能性需求

### 10.1 性能

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 单条报价响应时间 | < 3 秒（含 OSRM 调用） | P95 延迟 |
| 批量 100 条处理时间 | < 60 秒 | 端到端计时 |
| OSRM 缓存命中率 | > 70% | Redis 统计 |
| 地理编码缓存命中率 | > 90% | Redis 统计 |
| 前端首屏加载 | < 2 秒 | Lighthouse |

### 10.2 可靠性

- OSRM 不可用时，降级为直线距离 × 1.3 的道路系数估算
- 地理编码失败时，允许用户手动输入经纬度
- 批量任务中断后可从断点续传

### 10.3 安全性

- API 需要 Token 认证（内部工具，简单 JWT 即可）
- SQL 注入防护（ORM 参数化查询）
- CORS 限制为内网 IP

### 10.4 可维护性

- 所有费用参数可配置（数据库 / 环境变量 / 车辆型号库.csv，不硬编码）
- 车辆型号通过 `车辆型号库.csv`（用户直接 Excel 编辑）增删改；货物类型仍在
  `presets.py` 里维护，未来考虑一并做成管理界面
- 日志记录所有计算过程，便于审计和调试

---

## 11. 风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| OSRM 地图数据覆盖不全 | 偏远路线无法计算 | 中 | 降级为直线距离估算 + 人工修正系数 |
| 越南油价数据源不稳定 | 油价默认值缺失 | 低 | 缓存最近一次成功值 + 手动输入兜底 |
| 费用公式与实际偏差大 | 报价不可信 | 中 | 预留公式参数调整界面；收集实际运费反馈校准 |
| 批量 Excel 格式兼容性 | 上传失败 | 中 | 严格的模板校验 + 友好的错误提示（哪行第几列有问题） |
| 多语言翻译遗漏 | 用户体验差 | 中 | 先用 vi + zh；en 委托 AI 翻译 |
| 性能瓶颈（批量 100+） | 用户等待过久 | 低 | 异步处理 + 进度条 + 分页结果 |

---

## 附录 A：越南运输市场参考数据

> 以下数据为初始默认值，后续根据实际运营数据校准。

| 参数 | 默认值 | 参考来源 |
|------|--------|----------|
| 柴油价格 | 23,320 VND/L | Petrolimex (DO 0.05S-II Vùng 1, 2026-07-16) |
| 司机月薪 | 15,000,000 - 20,000,000 VND | 越南物流行业平均 |
| 司机小时工资 | ~180,000 VND/h | 月薪 ÷ 22天 ÷ 8小时 |
| 大卡车油耗 | 30-40 L/100km（满载） | 行业经验值 |
| 高速限速 | 80-90 km/h（卡车） | 越南交规 |
| 每日最大驾驶时间 | 8 小时 | 越南劳动法 + 交规 |
| 连续驾驶休息间隔 | 每 4 小时休息 30 分钟 | 越南交规 |
| 友谊关→河内 距离 | ~170 km | OSRM 实测 |
| 友谊关→海防 距离 | ~270 km | OSRM 实测 |
| 友谊关→胡志明 距离 | ~1,900 km | OSRM 实测 |
| 禁限行/施工封闭/上坡山区附加费 | 0 / 0 / 0 VND（2026-07-16 归零） | 原为占位值(150K/150K/200K)，无市场数据支撑；待收集供应商报价后校准恢复 |

## 附录 B：关键文件结构

```
OSRM++/
├── osrm/                       # OSRM 引擎配置
│   ├── Dockerfile
│   ├── data/                   # 越南 + 中国边境 .osm.pbf
│   └── profiles/               # 自定义 profile (truck.lua)
│
├── backend/                    # Python FastAPI
│   ├── app/
│   │   ├── main.py             # 应用入口
│   │   ├── config.py           # 配置管理
│   │   ├── api/
│   │   │   ├── quotations.py   # 报价 CRUD
│   │   │   ├── templates.py   # 模板管理
│   │   │   └── references.py  # 参考数据
│   │   ├── services/
│   │   │   ├── osrm_client.py  # OSRM API 封装
│   │   │   ├── geocoder.py     # 地理编码
│   │   │   ├── cost_engine.py  # 费用计算引擎 ★
│   │   │   └── fuel_sync.py    # 油价同步
│   │   ├── models/             # SQLAlchemy 模型
│   │   └── tasks/              # Celery 异步任务
│   ├── tests/
│   └── requirements.txt
│
├── frontend/                   # React Next.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.tsx      # Leaflet 地图
│   │   │   ├── StepForm/       # 分步表单
│   │   │   ├── CostPanel.tsx   # 费用面板
│   │   │   └── BatchUpload.tsx # 批量上传
│   │   ├── pages/
│   │   │   ├── index.tsx       # 主页（单条报价）
│   │   │   ├── batch.tsx       # 批量模式
│   │   │   ├── history.tsx     # 历史记录
│   │   │   └── templates.tsx   # 模板管理
│   │   ├── hooks/              # 自定义 hooks
│   │   └── lib/                # 工具函数
│   └── package.json
│
├── docker-compose.yml          # 一键部署
├── .env.example                # 环境变量模板
└── DEVELOPMENT_GOALS.md        # 本文档
```

---

> **文档版本**: v1.1  
> **最后更新**: 2026-07-16 (同步公式 v1.2 + 油价更新 + 路况附加费归零)  
> **维护人**: JIUNENG 技术团队  
> **下一步**: 收集供应商报价数据 → 车型库逐批校准
