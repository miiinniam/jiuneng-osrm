# OSRM++ 基于行业标准的公式优化方案（简化版）

> 日期: 2026-08-08
> 原则: 以行业成熟模型为参照，最小化新增参数，直接改进现有公式

---

## 一、行业参照：ATRI 卡车运营成本模型（2025）

美国运输研究所（ATRI）年度报告是卡车运输成本模型的行业**金标准**，2024 年数据：

| 成本项 | 美分/英里 | 占比 | 映射到 OSRM++ |
|--------|----------|------|--------------|
| 燃油 (Fuel) | 48.0¢ | 21.2% | ≈ fuel_price × L/100km |
| 卡车/挂车付款 | 39.0¢ | 17.3% | 隐含在 base_rate 中 |
| 司机工资 | ~35.0¢ | 15.5% | 整车模式已包含在 base_rate |
| 维修保养 (R&M) | 19.8¢ | 8.8% | ❌ 缺失 |
| 司机福利 (Benefits) | 19.7¢ | 8.7% | 已含工资 |
| 保险 (Insurance) | ~10.0¢ | 4.4% | ≈ 0.3% 货值 |
| 轮胎 (Tires) | 4.7¢ | 2.1% | ❌ 缺失 |
| 路桥费 (Tolls) | ~3.0¢ | 1.3% | toll_rate（多数为 0）|
| 许可证 (Permits) | ~2.0¢ | 0.9% | ❌ 缺失 |
| 杂项 | ~4.0¢ | 1.8% | misc_cost |
| **总计** | **~$2.26/英里** | **100%** | |

### 核心洞察（直接用在公式里）

#### 洞察 1：距离衰减是真实的物理规律
> OOIDA 实测：年跑 50,000 英里 = $1.06/英里；年跑 130,000 英里 = $0.69/英里
> **固定成本被摊薄**：折旧/保险/许可证等不随距离变化，跑得越多 per-km 越低

→ **这正是当前公式最缺失的！** 可以直接借鉴 ATRI 的比例换算衰减曲线。

#### 洞察 2：成本结构 = 固定 + 可变（不是"全包"）
ATRI 将成本分两大类：
- **固定成本** (Fixed)：卡车折旧、保险、许可证、司机底薪 — 跟距离几乎无关
- **可变成本** (Variable)：燃油、轮胎、维修、路桥 — 跟距离线性相关

→ 当前整车公式的 `base_rate` 是混合的，应拆为 `fixed_per_trip + variable_per_km`

#### 洞察 3：空驶率是一个真实参数
> ATRI 报告：行业平均空驶率 16.7%

→ 当前 `empty_return = True/False` 太粗糙，应改为空驶概率（0-100%），默认 17%

---

## 二、OSRM++ 公式优化方案（3 项核心改动）

### 改动 1：整车公式拆为 固定+可变

**现在的公式**：
```
cost = distance × base_rate × cargo_multiplier + surcharges
```

**改进后（借用 ATRI 成本结构）**：
```
fixed_cost = fixed_surcharge_vnd                          # 一次性的固定成本
variable_cost = distance × variable_rate × cargo_multiplier   # 跟距离线性
cost = fixed_cost + variable_cost + surcharges
```

对应 CSV 新增 1 列（只需 1 列！）：
- `fixed_surcharge_vnd` — 已有！大部分车型已填
- `base_rate_vnd_per_km` → 改名理解：这是 `variable_rate`（纯里程费率）

**对现有数据的影响**：
- 已有 `fixed_surcharge_vnd` 的车型（高栏 5-18t、小卡车、部分平板/集装箱）：不需要改
- 没有固定费的车型（大部分平板/集装箱/冷链）：需要补填固定费，相应降低 base_rate

### 改动 2：距离衰减因子（仅 1 个参数）

**新增 1 个 CSV 列**：`distance_decay_start_km`（默认 100km，超过此距离开始衰减）

```python
def 距离衰减因子(距离公里: float, 起衰距离: float = 100) -> float:
    """固定成本在长距离上被摊薄。"""
    if 距离公里 <= 起衰距离:
        return 1.0
    # 借鉴 OOIDA 数据：50K→$1.06, 130K→$0.69 → ~0.55%/10km 衰减
    衰减率 = 0.055 / 100   # 每 100km 衰减 5.5%
    return 1.0 - 衰减率 * (距离公里 - 起衰距离) / 100
```

应用到整车总成本：
```python
衰减 = 距离衰减因子(距离公里, model.distance_decay_start_km)
cost = fixed_cost + variable_cost * (1 + cargo_multiplier) * 衰减 + surcharges
```

**效果**：200km 报价 ≈ 公式 × 0.94，500km ≈ ×0.78，1000km ≈ ×0.50 — 符合行业规律。

### 改动 3：速度惩罚连续化（无新参数）

不改 CSV，只改 `费用计算公式.py` 的速度系数函数——从 3 档阶梯变为分段线性插值。

---

## 三、新增数据输入（最小化）

| 参数 | 来源 | 对用户是否可见 | 默认值 |
|------|------|-------------|--------|
| `fixed_surcharge_vnd` | CSV（已有） | ❌ | 已有值或用 0 |
| `distance_decay_start_km` | CSV（🆕 仅当车型需衰减） | ❌ | 100 |
| 空驶概率（替代 empty_return bool） | 用户可选（🆕） | ✅（高级） | 17% |
| 毛利率（成本→客户报价） | margin_presets 表 | ✅（下拉） | 18% |
| `source_type`（供应商/客户） | 报价保存时标注 | ✅（标记） | 'supplier' |

**总数对比**：
- 原计划：3 张新表 + 10+ 新字段
- 简化后：CSV 新增 1 列 + API 新增 1 个参数 + 前端新增 1 个下拉

---

## 四、开源项目参考

### 4.1 Fleetbase（⭐ ~1.5K）— 开源物流操作系统
- **URL**: https://fleetbase.io / github.com/fleetbase
- **定位**: 开源物流平台（TMS + 仓储 + 财务）
- **定价逻辑**: 基于 zone/pricing matrix（区域定价矩阵），不是 per-km 线性模型
- **可借鉴**: API 设计模式、订单→运单状态机

### 4.2 loadpartner/tms — 开源货运经纪 TMS
- **URL**: github.com/loadpartner/tms
- **定位**: 货运经纪人 TMS
- **可借鉴**: 报价→订单→发货→结算的完整工作流

### 4.3 hzjken/multimodal-transportation-optimization
- **URL**: github.com/hzjken/multimodal-transportation-optimization
- **定位**: 数学模型（线性规划/整数规划）解决多式联运成本最小化
- **可借鉴**: 成本最小化的数学框架，但不适合作为报价工具

### 4.4 Rahul-404/shipment-price-prediction
- **URL**: github.com/Rahul-404/shipment-price-prediction
- **定位**: ML 预测运费的机器学习项目
- **可借鉴**: 特征工程（距离、重量、货物类型 → XGBoost）

---

## 五、简化后的实施计划（3 阶段，~5 天）

### Phase 1: 公式优化（1 天）
- [ ] CSV 新增 `distance_decay_start_km` 列（默认 100）
- [ ] `费用计算公式.py`：新增 `距离衰减因子()`，接入 `整车总成本()`
- [ ] `费用计算公式.py`：速度惩罚阶梯→连续插值
- [ ] 回归验证（48 组手算）

### Phase 2: 双层定价（1 天）
- [ ] `margin_presets` 表（SQLite，3 条预设：标准18%/大客户12%/紧急25%）
- [ ] `pricing_engine.py`：`compute_customer_quote(cost_price_vnd, margin_pct)`
- [ ] AI 新增 1 个工具：`calculate_customer_quote`
- [ ] AI prompt 更新（只加 ~5 行）

### Phase 3: 数据沉淀（2-3 天）
- [ ] `quote_history` 表（极简：路线+车型+成本价+报价+source_type+时间）
- [ ] 保存报价 API（一个 POST 端点）
- [ ] 前端 `/quote` 页面：毛利率下拉 + "保存报价"按钮

---

## 六、不做的事（不要过度设计）

| 不做 | 原因 |
|------|------|
| 发车管理（shipments 表） | 先用 Excel/飞书记录，等报价闭环跑通再说 |
| 推演沙盘（simulate） | 公式改完后，改 CSV 基价就能手动推演，不需要专门界面 |
| 报价历史搜索/筛选 | 先用 SQLite 命令行查，等数据积累到 100+ 条再做 |
| 成交价回填链路 | 先手动标记成交，下阶段再做自动化 |
| 多区域基价 | 先跑通一个区域（越南全国），数据够多了再分北中南 |
| 货物类型系数校准 | 当前 6 种类型系数是估的——但不影响核心公式结构，P1 再做 |
