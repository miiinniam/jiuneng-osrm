# OSRM++ 双层定价体系 + 整车发车升级方案

> 日期: 2026-08-08
> 范围: 公式增强 / 整车发车 / 成本-报价推演 / AI 优化
> 核心目标: 供应商成本→毛利率→客户报价 全链路打通，公式精度提升

---

## 一、现状与目标对照

| 维度 | 现状 | 目标 |
|------|------|------|
| **数据层** | 只有供应商报价（要价），无成交价 | 供应商报价 + 客户成交价 双路数据 |
| **定价层** | 只有一个价格（≈供应商成本） | 成本价 → 毛利率 → 客户报价 双层体系 |
| **业务层** | 只有报价计算，无运单/发车 | 整车发车管理（运单状态跟踪） |
| **推演层** | 无 | 参数可调的成本-报价模拟沙盘 |
| **AI 层** | 6 工具，只算单一价格 | 支持双价格 + 毛利分析 + 发车查询 |
| **公式层** | 纯线性、阶梯跳跃、无距离衰减 | P0 精度修复（距离衰减+速度平滑+车型油耗斜率） |

---

## 二、数据模型新增

### 2.1 报价记录表（quote_history）

```sql
CREATE TABLE quote_history (
    id              TEXT PRIMARY KEY,           -- UUID
    created_at      TIMESTAMP NOT NULL,
    
    -- 路线
    origin_lat      REAL NOT NULL,
    origin_lng      REAL NOT NULL,
    origin_name     TEXT,
    dest_lat        REAL NOT NULL,
    dest_lng        REAL NOT NULL,
    dest_name       TEXT,
    distance_km     REAL NOT NULL,
    duration_h      REAL NOT NULL,
    
    -- 货物
    cargo_type      TEXT NOT NULL,
    weight_ton      REAL NOT NULL,
    volume_m3       REAL,
    
    -- 车辆
    vehicle_model_id TEXT NOT NULL,
    loading_mode    TEXT NOT NULL,              -- full_truck / consolidated
    vehicle_count   INTEGER DEFAULT 1,
    
    -- 🔑 双价格（核心新增）
    cost_price_vnd  REAL,                       -- 供应商成本价（来自供应商报价/公式校准）
    cost_source     TEXT,                       -- 成本来源: 'formula' / 'supplier_quote' / 'manual'
    quote_price_vnd REAL,                       -- 🆕 给客户的报价
    margin_pct      REAL,                       -- 🆕 毛利率 %
    quote_source    TEXT DEFAULT 'formula',     -- 报价来源: 'formula' / 'manual'

    -- 报价元数据
    customer_name   TEXT,                       -- 客户名称
    status          TEXT DEFAULT 'quoted',      -- quoted / accepted / rejected / shipped
    notes           TEXT,
    quote_json      TEXT,                       -- 完整 QuoteResponse JSON 快照
    source_type     TEXT NOT NULL DEFAULT 'system',  -- 'system'(系统计算) / 'supplier'(供应商) / 'customer'(客户报价)
    
    -- 成交回填（后续手动/自动补）
    actual_price_vnd REAL,                     -- 🆕 实际成交价
    actual_date      TIMESTAMP,                -- 🆕 成交日期
);
```

### 2.2 发车记录表（shipments）— 🆕

```sql
CREATE TABLE shipments (
    id              TEXT PRIMARY KEY,
    quote_id        TEXT REFERENCES quote_history(id),
    created_at      TIMESTAMP NOT NULL,
    
    -- 发车信息
    dispatch_date   TIMESTAMP,                 -- 发车日期
    estimated_arrival TIMESTAMP,               -- 预计到达
    actual_arrival   TIMESTAMP,                -- 实际到达
    
    -- 状态
    status          TEXT DEFAULT 'pending',     -- pending / dispatched / in_transit / arrived / completed / cancelled
    
    -- 实际费用
    actual_freight_vnd  REAL,                   -- 实际运费（结算价）
    actual_border_rmb   REAL,                   -- 实际口岸费
    
    -- 备注
    driver_name     TEXT,
    plate_number    TEXT,
    notes           TEXT
);
```

### 2.3 利润率预设表（margin_presets）

```sql
CREATE TABLE margin_presets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,              -- 如 "标准客户" / "大客户优惠" / "紧急加急"
    margin_pct      REAL NOT NULL,             -- 毛利率，如 0.18 = 18%
    cargo_type      TEXT,                       -- 适用货物类型（NULL=全部）
    is_default      BOOLEAN DEFAULT FALSE,
    
    -- 阶梯规则（可选）
    min_weight_ton  REAL,
    max_weight_ton  REAL,
    min_distance_km REAL,
    max_distance_km REAL
);
```

---

## 三、后端新增模块

### 3.1 定价引擎 `backend/app/services/pricing_engine.py` — 🆕

```
职责：从供应商成本价 → 客户报价的计算层

核心函数：
  compute_customer_quote(
      cost_price_vnd,         # 供应商成本（来自 cost_engine 或供应商报价）
      margin_preset_id=None,  # 预设利润率模板
      margin_pct=None,        # 手动指定利润率
      weight_ton=None,        # 用于匹配阶梯规则
      distance_km=None,
  ) -> QuoteResult            # 成本 + 毛利 + 客户价

  suggest_margin(
      route_info, cargo_info, vehicle_info
  ) -> float                  # AI 建议的毛利率
```

### 3.2 推演模拟器 `backend/app/services/quote_simulator.py` — 🆕

```
职责：内部定价决策工具——参数可调的成本-报价沙盘

核心函数：
  simulate(
      scenarios: list[SimScenario],  # 多组参数组合
      cost_data: QuoteRequest,       # 基础路线/货物信息
  ) -> list[SimResult]               # 每组参数的成本/报价/毛利对比

SimScenario 包含：
  - base_rate 调整：如 +10% / -5%
  - margin_pct 调整：如 15% / 20% / 25%
  - 货物类型切换
  - 车型切换

输出：
  | 方案 | 基价/km | 毛利率 | 成本(VND) | 报价(VND) | 毛利(VND) |
```

### 3.3 发车管理 API `backend/app/api/shipments.py` — 🆕

```
POST   /shipments             创建发车记录（关联 quote_id）
GET    /shipments             发车列表（分页+筛选）
GET    /shipments/{id}        发车详情
PATCH  /shipments/{id}        更新状态/补填实际费用
GET    /shipments/stats       发车统计（进行中/已完成/总运费等）
```

---

## 四、公式增强（P0 精度修复）

### 4.1 距离衰减因子 `费用计算公式.py`

```python
# 🆕 新增函数
def 距离衰减因子(距离公里: float) -> float:
    """长途规模效应：越远 per-km 成本越低。"""
    if 距离公里 <= 100:
        return 1.0
    elif 距离公里 <= 300:
        return 1.0 - 0.08 * (距离公里 - 100) / 200    # 1.00 → 0.92
    elif 距离公里 <= 800:
        return 0.92 - 0.07 * (距离公里 - 300) / 500    # 0.92 → 0.85
    else:
        return 0.85  # 超长途保底
```

应用到整车总成本公式：
```python
def 整车总成本(...):
    衰减 = 距离衰减因子(距离公里)
    return (
        距离成本(距离公里, 基价每公里, 货物类型系数, 空车返回) * 衰减
        + ...
    )
```

### 4.2 速度惩罚连续化

```python
# 替换现有 3 档阶梯
速度惩罚阈值表 = [
    (0.3,  1.00),   # ≤30% 载重 → 正常
    (0.5,  1.00),   # 30-50% → 正常
    (0.8,  1.18),   # 50-80% → 线性渐变 1.00→1.18
    (1.0,  1.30),   # 80-100% → 1.18→1.30
]

def 速度系数(载重比例: float) -> float:
    """连续分段线性插值"""
    for i, (阈值, 系数) in enumerate(速度惩罚阈值表):
        if 载重比例 <= 阈值:
            if i == 0:
                return 系数
            prev_th, prev_coef = 速度惩罚阈值表[i - 1]
            t = (载重比例 - prev_th) / (阈值 - prev_th)
            return prev_coef + t * (系数 - prev_coef)
    return 速度惩罚阈值表[-1][1]
```

### 4.3 车型油耗斜率差异化

在 `车辆型号库.csv` 新增列 `fuel_load_slope`：

| 车型大类 | fuel_load_slope | 说明 |
|---------|----------------|------|
| small_box | 0.12 | 轻卡满载油耗增幅小 |
| flatbed | 0.18 | 平板中卡 |
| high_side | 0.18 | 高栏中卡 |
| container | 0.22 | 集装箱重卡 |
| cold_chain | 0.25 | 冷链最重（制冷机组） |
| flatbed_low_* | 0.25 | 低平板重卡 |

`费用计算公式.py` 改为：
```python
def 油耗载重系数(载重比例: float, 车型斜率: float | None = None) -> float:
    slope = 车型斜率 if 车型斜率 is not None else 0.20  # 兜底
    if 载重比例 <= 油耗修正起始比例:
        return 1.0
    return 1.0 + slope * (载重比例 - 油耗修正起始比例)
```

### 4.4 OSRM 卡车距离修正

```python
# 🆕 osrm_client.py
TRUCK_ROAD_FACTOR = 1.08  # 卡车实际路径 ≈ OSRM driving × 1.08

# 在 get_route 返回前：
distance_m *= TRUCK_ROAD_FACTOR  # 卡车绕行修正
```

---

## 五、AI 功能优化

### 5.1 新增 AI 工具

| # | 工具名 | 用途 |
|---|--------|------|
| 7 | **calculate_customer_quote** | 🆕 根据成本+毛利率计算客户报价。调用 pricing_engine。 |
| 8 | **query_quote_history** | 🆕 查询历史报价记录（按客户/日期/路线筛选） |
| 9 | **query_shipments** | 🆕 查询发车状态（在途/已完成） |
| 10 | **simulate_pricing** | 🆕 推演沙盘：调整参数看报价变化 |
| 11 | **suggest_margin** | 🆕 AI 根据货物+路线+客户类型建议毛利率 |

### 5.2 AI 提示词更新要点

```
- 新增"双层定价"概念：系统先算供应商成本，再加毛利率得客户报价
- AI 必须区分"成本价"和"客户报价"，不能混淆
- DDP 全链路：运费(VND)+口岸费(RMB)+毛利 → 客户到门价
- 历史数据查询：用户可以问"上个月海防→河内的报价多少钱"
- 发车查询：用户可以问"8月有几车在途"
- 推演功能：用户可以问"如果把基价下调10%、毛利率20%，报价是多少"
```

### 5.3 AI 对话上下文增强

```python
# ai_chat_prompt.py 新增
"""
## 双层定价说明
- **成本价(cost_price)**: 供应商收我们的运费，系统根据公式+供应商报价校准得出
- **客户报价(quote_price)**: 我们收客户的运费 = 成本价 × (1 + 毛利率)
- 默认毛利率: 18%（可配置）
- 用户说"给客户报价"时 → 输出客户报价（含毛利）
- 用户说"成本多少"时 → 输出成本价（不含毛利）
- 报价展示格式增加: "成本 ×X VND → +Y%毛利 → 客户报价 Z VND"
"""
```

---

## 六、API 新增/扩展

| 端点 | 方法 | 说明 |
|------|------|------|
| `/quote/customer` | POST | 🆕 客户报价（成本+毛利） |
| `/quote/simulate` | POST | 🆕 推演沙盘 |
| `/quote/history` | GET | 🆕 报价历史查询 |
| `/quote/history` | POST | 🆕 保存报价记录 |
| `/quote/history/{id}` | PATCH | 🆕 回填实际成交价 |
| `/shipments` | CRUD | 🆕 发车管理 |
| `/reference/margin-presets` | GET | 🆕 利润率预设列表 |
| `/ai/chat` | POST | 扩展：支持新工具 |

---

## 七、前端新增页面/组件

### 7.1 报价历史页 `/quote/history`
- 表格：日期 / 客户 / 路线 / 车型 / 成本价 / 报价 / 毛利 / 状态
- 筛选：按客户、日期范围、货物类型
- 详情弹窗：完整费用明细 + 发车状态

### 7.2 发车管理页 `/shipments`
- 看板视图：待发车 / 在途 / 已到达
- 新建发车：关联报价记录，填发车日期/司机/车牌
- 状态流转：pending → dispatched → in_transit → arrived

### 7.3 定价推演工具 `/quote/simulate`（管理员）
- 左侧：基准参数（路线+货物+车型+成本价）
- 右侧：参数滑块（基价调整 ±30%、毛利率 5-40%、距离衰减开关）
- 实时显示：N 组方案的成本/报价/毛利对比表+柱状图

### 7.4 客户报价页面增强

现有 `/quote` 报价结果增加：
- 成本价展示（折叠，默认隐藏——不给客户看）
- 毛利率选择器（下拉：标准 18% / 大客户 12% / 紧急 25% / 自定义）
- "保存报价"按钮（写入 quote_history + 可选关联客户名）
- "转为发车"按钮（创建 shipment 记录）

---

## 八、实施计划（按优先级）

### Phase 1：公式增强（1-2 天）— 立即影响准确度
- [ ] 距离衰减因子 (`费用计算公式.py` + `整车总成本`)
- [ ] 速度惩罚连续化 (`速度系数` 改为分段线性插值)
- [ ] 车型油耗斜率差异化 (CSV + `油耗载重系数` 改签)
- [ ] OSRM 卡车距离修正 (osrm_client.py)
- [ ] 回归测试：验证公式不变量 + 48 组手算交叉验证

### Phase 2：数据库 + 后端基座（2-3 天）
- [ ] SQLite 新建表：quote_history, shipments, margin_presets
- [ ] pricing_engine.py：成本→客户报价
- [ ] quote_simulator.py：推演沙盘
- [ ] 报价 CRUD API：保存/查询/回填成交价
- [ ] 发车 CRUD API

### Phase 3：AI 工具扩展（1 天）
- [ ] 新增 5 个 AI 工具 + execute_tool 分支
- [ ] 系统提示词更新（双层定价+发车查询+推演）
- [ ] SSE 流式验证

### Phase 4：前端（2-3 天）
- [ ] 报价历史页
- [ ] 发车管理页
- [ ] 定价推演工具
- [ ] `/quote` 页面集成毛利率选择器 + 保存/发车按钮

### Phase 5：数据积累 + 校准闭环（持续）
- [ ] 历史报价数据导入/手动录入
- [ ] 校准脚本升级（时间加权OLS + 异常值检测）
- [ ] 实际成交价回填 → 反推真实毛利率

---

## 九、风险与注意事项

| 风险 | 缓解 |
|------|------|
| 公式改动影响现有报价 | 改前存快照、改后交叉验证 48 组用例 |
| 双层定价在 AI 对话中混淆 | prompt 明确区分 + 独立工具函数 |
| CSV 新增列兼容 | 老车型默认值 fallback，新列 optional |
| 数据库迁移 | 用 SQLite ALTER TABLE，初始为空表不影响现有功能 |
| 推演工具让客户看到成本 | /simulate 仅管理员可访问，/quote 页面成本折叠 |
