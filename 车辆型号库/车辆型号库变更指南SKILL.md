# 车辆型号库变更指南（通用 Skill，不绑定任何特定 Agent 平台）

> 本文档面向任何能读 Markdown、能读写代码的编码 Agent（Claude Code / Hermes / Codex / 人工）。
> 不依赖任何平台专属的 Skill 格式。
>
> **这份文档解决的是"改动车辆信息之后，还有哪些地方要跟着改"的问题**——不是教你怎么用
> 反算 skill 拟合费率（那是 [`运费反算SKILL.md`](../公式反算文件/运费反算SKILL.md) 管的事），
> 也不是教你怎么从供应商报价里提取数据（那是
> [`报价数据提取SKILL.md`](../公式反算文件/报价数据提取SKILL.md) 管的事）。
> 这份文档管的是：车辆型号库（`车辆型号库.csv` + `vehicle_registry.py`）是整个
> 系统里被引用最多的一份数据，改它的**结构**（不是改个数字那么简单）时，牵一发动全身，
> 这里列出完整的关联关系图，照着走一遍不会漏改。

## 1. 触发场景

用户说"车型信息要加个字段"/"要新增一个车辆大类"/"拼货怎么匹配车型这个逻辑要改一下"/
"车型库改了个东西，后端是不是要跟着改"这类话的时候，先看这份文档，搞清楚这次改动
属于下面 §3 的哪一类、按对应的清单走，而不是想到哪改到哪。

## 2. 核心架构原则（改之前先确认没有违反这几条）

这几条是这个项目从最开始就坚持的设计原则，任何改动都不应该破坏它们：

1. **单一公式源**：所有真正的计算逻辑（阈值、系数、公式结构）都只写在
   `backend/app/services/费用计算公式.py` 里。`cost_engine.py` 只负责编排（查车型、
   校验、组装结果），`calibration.py` 反算时复用的也是这同一批公式函数
   （`from app.services import 费用计算公式 as 公式`）。**新增任何跟"钱怎么算"有关的
   逻辑，先问自己：这应该是公式文件里的一个新函数，还是编排层的判断逻辑？** 不要把
   公式散落到 cost_engine.py 或 calibration.py 里。
2. **正算和反算必须用同一套匹配/计算假设**：拼货模式下"用哪个车型、占用多少运力"这件事，
   `cost_engine.py`（正算，为新报价自动匹配最经济车型）和 `calibration.py`
   （反算，从历史真实运单的已知车型算 `capacity_ratio`）算法逻辑不同，但**用来算
   capacity_ratio 的公式函数是同一个**（`费用计算公式.容量占比`）。如果哪天要改
   "拼货怎么判断占用运力比例"这条规则，`费用计算公式.py` 改一处，两边自动同步；
   如果需要改"匹配算法本身"（比如从"选总价最低"改成"选占用运力最低"），
   `cost_engine.match_consolidated_model` 和 `calibration.py` 里对应的 resolve 逻辑
   要一起看一遍，确认没有产生"正算这么选车、反算却假设了另一种选车逻辑"的不一致
   ——这种不一致会让反算拟合出的费率失去意义（拟合的前提是"这条历史数据是在当时的
   计价规则下产生的"）。
3. **CSV 是运行时数据源，不是编译时常量，而且不会热重载**：`vehicle_registry.py`
   只在后端进程启动（import）时读一次 `车辆型号库.csv`。改了 CSV 内容之后必须重启后端
   才会生效（Docker Desktop：`docker restart osrmplus-backend`；改完结构性内容
   建议整个重新 `docker build` 一遍确保干净）。这是刻意的设计（避免热重载引入的额外
   复杂度和故障面），不要"以为改了 CSV 马上生效"就去调试别的地方。
4. **启动时会做健全性校验，结构性错误会 fail fast**：`model_id` 重复、`category`
   不在合法枚举里、某个大类下一个型号都没有，这几种情况后端会在启动时直接抛异常拒绝
   启动（见 `vehicle_registry.py` 的 `_validate`），不会带着错误数据继续跑。改了 CSV
   结构后端启动不起来，先看这几条。
5. **测试用固定的小型车型库 fixture，不读真实 CSV**：`test_cost_engine.py`/
   `test_calibration.py` 里手写了几个 `VehicleModel` 测试对象（`monkeypatch` 替换掉
   `cost_engine.VEHICLE_MODELS`/`get_model`），刻意不耦合真实 CSV 的具体数字——真实 CSV
   是用户会持续在 Excel 里调整的业务数据，测试断言不该绑死在这些会变的数字上。
   **改了 `VehicleModel` 的字段结构（加字段/删字段）时，要同步改这几个测试 fixture
   的字段**，不是去改真实 CSV 再跑测试。

## 3. 按改动类型分类的操作指南

### 3.1 只改车型的具体数值（费率、载重、油耗……），不改字段结构、不改型号数量

最简单的情况——直接编辑 `车辆型号库/车辆型号库.csv`（Excel 打开），改完保存，
重启后端容器生效。**不需要改任何代码**。

如果同时**新增或删除了某一行（型号）**：
- 检查 `frontend/src/app/page.tsx` 的 `INITIAL_FORM.vehicleModelId` 默认值是不是
  被删掉的那个型号——是的话换一个还存在的 `model_id`。
- 检查 `公式反算文件/供应商报价/samples_*.json` 里有没有历史样本引用了被删掉的
  `model_id`——反算 CLI 跑到这些样本会报 `未知车型` 错误，需要决定是保留该型号
  还是把这些样本迁移映射到别的型号。
- 前端已保存的模板（`templates` 表）如果引用了被删掉的型号，加载时不会报错
  （`TemplateBar` 走的是宽松合并逻辑），但用户会发现车型选择变成了默认值，
  这是已知的、可接受的降级行为，不需要额外处理。

### 3.2 给车型新增一个字段（CSV 新增一列）

先问自己：**这个新字段是否要参与费用计算，还是只是展示/筛选用的元信息**（现有的
`length_m`/`width_m`/`height_m`/`notes`/`osrm_profile` 目前就是纯信息性/工程性字段，
不直接进公式）。两种情况改动范围不一样：

**A. 纯信息性字段**（不参与计价公式）需要改：

| 文件 | 改什么 |
|------|--------|
| `车辆型号库.csv` | 新增列，给现有行填值（没有的可以留空） |
| `backend/app/services/vehicle_registry.py` | `VehicleModel` dataclass 加字段；`_load_registry` 里加对应的解析逻辑（参考 `length_m` 等可空字段的写法，用 `_parse_float`/直接 `.strip()`） |
| `backend/app/api/reference.py` | `/reference/vehicle-models` 返回的字典里加这个字段 |
| `frontend/src/lib/types.ts` | `VehicleModel` interface 加字段 |
| `backend/tests/test_cost_engine.py` / `test_calibration.py` | 测试用的 `VehicleModel(...)` 固定实例加上这个新字段（哪怕值填个占位符，dataclass 少字段会直接报错） |
| 如果要在界面上展示 | `frontend/src/components/QuoteForm.tsx` 的 specs 展示逻辑 + 对应 i18n 文案 |

**B. 参与计价公式的字段**（比如"专项许可证附加费"这种真的会影响总价的新字段），
在 A 的基础上还要加：

| 文件 | 改什么 |
|------|--------|
| `backend/app/services/费用计算公式.py` | 新增一个纯函数处理这个字段对应的费用计算（参考 `车身附加费`/`路桥费` 这类简单的"基础值 × 触发条件"函数的写法） |
| `backend/app/services/cost_engine.py` | `_compute_for_model` 里调用这个新公式函数，决定它属于"可分摊"费用（要乘 `capacity_ratio`，比如路桥费/车身附加费那一类）还是"本单专属"费用（不打折，比如装卸费/保险费那一类）——**这是一个业务决策，不是技术细节，改之前想清楚"拼货模式下这笔钱该不该按占用运力比例分摊"**；`CostBreakdown` dataclass 加对应字段 |
| `backend/app/schemas.py` | `BreakdownOutput` 加对应字段（前后端字段名要对上，`build_quote_response` 靠 `__dict__` 直通映射，字段名一致就自动带过去，不需要改 `route.py`） |
| `backend/app/services/calibration.py` | `_design_row` 中要把这笔费用计入 `fixed_known`（统一函数，自动根据 `sample.loading_mode` 区分整车/拼货的`车身附加费`和`装卸费`语义——参照 `cost_engine.py` 保持完全一致的"可分摊/本单专属"分类） |
| `frontend/src/components/CostPanel.tsx` | 新增一行展示这项费用 |
| `frontend/src/lib/i18n/{types,zh,vi,en}.ts` | 对应的 `costPanel` 命名空间新增标签，三语都要补 |
| `DEVELOPMENT_GOALS.md` §6.3.4 | 固定费用表里加一行，注明是否受 `capacity_ratio` 影响 |

### 3.3 新增一个车辆大类（`category`，目前是 small_box/flatbed/high_side/container/cold_chain 这 5 个）

改动范围比新增字段小很多——`category` 只是分组标签，不参与费用计算：

| 文件 | 改什么 |
|------|--------|
| `车辆型号库.csv` | 新增该大类下的具体型号行 |
| `backend/app/services/vehicle_registry.py` | `VEHICLE_CATEGORIES` 元组加上新的大类字符串（**必须做**，不然启动校验会因为"这个 category 不在合法枚举里"直接拒绝启动） |
| `frontend/src/lib/i18n/{types,zh,vi,en}.ts` | `labels.vehicleCategory` 三语都要新增这个大类的展示名，不然前端下拉框的 `<optgroup>` 标题会显示成英文/拼音原始值 |

不需要改 `cost_engine.py`/`calibration.py`/公式文件——`category` 从头到尾只在
"车型下拉框怎么分组展示"和"启动校验"这两处起作用，不参与任何计价逻辑。

### 3.4 改动"拼货怎么匹配车型/怎么算占用运力比例"这个逻辑本身

这是影响面最深的一类改动（比如：想把"选总价最低的车型"改成"选占用运力比例最低的车型"，
或者除了重量/体积之外还要考虑第三个维度比如"货物长度是否超过车厢长度"）：

1. 先改 `费用计算公式.py` 的 `容量占比` 函数（如果是加新维度）或者
   `cost_engine.match_consolidated_model` 的候选筛选/排序逻辑（如果是改匹配算法）。
2. **`calibration.py` 的 `resolve_shipment` 里对应的 `capacity_ratio` 计算逻辑必须
   同步改**——目前设计是历史样本的 `vehicle_model_id` 是真实已知的（不是靠"总价最低"
   反过来猜的，这样能避免循环依赖：选车用到费率、费率又是反算要拟合的目标），
   只是调用同一个 `容量占比` 函数算 ratio，所以只要 §2 第1条的公式函数改对了，
   这里通常不需要额外改；但如果新增的匹配维度需要额外的输入字段（比如货物长度），
   `ObservedShipment`/`ResolvedSample` dataclass 要加对应字段，
   `_load_shipments_from_json` 要加读取逻辑。
3. `backend/app/schemas.py` 的 `CargoInput`（如果需要用户填新的输入维度）+
   `QuoteRequest` 的 `model_validator` 校验逻辑。
4. 前端 `lib/types.ts`/`QuoteForm.tsx` 对应的新输入字段。
5. **务必在 `backend/tests/test_cost_engine.py` 里加一个手算验证的用例**——这类改动
   逻辑复杂，容易算错，必须有一条能手工验证数字对不对的测试兜底（参考现有的
   "容量占比取重量比和体积比较大值"那几个测试的写法）。
6. `公式反算文件/报价数据提取SKILL.md` 的 §5（车型映射方法）和
   `运费反算SKILL.md` 如果涉及新维度的数据提取要求，也要同步更新。

### 3.5 重命名或删除现有的 `model_id`

`model_id` 是贯穿前后端的稳定主键（API payload、批量 Excel 的"车型ID"列、反算样本 JSON
都用它），改名相当于一次破坏性变更：

- `车辆型号库.csv` 里改名。
- `frontend/src/app/page.tsx` 的 `INITIAL_FORM.vehicleModelId` 如果引用了旧名字要改。
- `公式反算文件/供应商报价/samples_*.json` 里所有引用旧 `model_id` 的样本都要批量改名
  （可以写个一次性脚本，参考本项目历史上做过的
  "旧 vehicle_type/body_type 迁移到新 vehicle_model_id"迁移脚本的思路：按名字批量替换,
  然后跑一遍 `python -m app.services.calibration` 确认没有"未知车型"报错）。
- 已保存的前端模板（`templates` 表）引用旧名字——不用管，走 §3.1 提到的宽松降级
  逻辑即可，不需要写数据库 migration。

## 4. 一个完整的例子：给车型新增"是否需要专项运输许可证"字段，且需要额外收费

假设需求是：某些车型（比如超长平板挂车）运输某些货物需要专项许可证，每趟额外收一笔
固定费用，且这笔费用跟"车身固定附加费"一样，属于"整趟车"性质，拼货模式要按运力比例分摊。

1. `车辆型号库.csv`：新增列 `permit_surcharge_vnd`，给需要许可证的型号（比如
   `flatbed_13m`）填一个数字，其余型号填 `0`。
2. `vehicle_registry.py`：`VehicleModel` 加 `permit_surcharge_vnd: float` 字段；
   `_load_registry` 里加 `permit_surcharge_vnd=float(row["permit_surcharge_vnd"] or 0)`。
3. `费用计算公式.py`：新增函数
   ```python
   def 专项许可证附加费(许可证附加费: float) -> float:
       return 许可证附加费
   ```
   （逻辑跟现有的 `车身附加费` 一模一样，因为语义也一样——车型自带的固定附加费）。
4. `cost_engine.py` 的 `_compute_for_model`：算出
   `cost_permit_full = 公式.专项许可证附加费(model.permit_surcharge_vnd)`，
   跟 `cost_body_surcharge` 一样归入"可分摊"分组，乘 `capacity_ratio`；`CostBreakdown`
   加 `cost_permit: float` 字段，`cost_fixed` 汇总公式里加上它。
5. `schemas.py` 的 `BreakdownOutput` 加 `cost_permit: float`。
6. `calibration.py` 的 `_design_row`（统一函数，参照 `cost_engine.py` 的分类——车身附加费"可分摊"，装卸费"本单专属"）
   `fixed_known` 里加 `公式.专项许可证附加费(model.permit_surcharge_vnd)`
   （consolidated 版本记得乘 `ratio`，参照路桥费/车身附加费的写法）。
7. `reference.py`：`/reference/vehicle-models` 返回值加 `permit_surcharge_vnd`。
8. 前端 `types.ts` 的 `VehicleModel`/`QuoteResponse.breakdown` 加对应字段；
   `CostPanel.tsx` 新增一行展示；`i18n` 三语加标签。
9. `test_cost_engine.py`：给测试 fixture 车型加 `permit_surcharge_vnd` 字段（大部分填0，
   挑一个填非零值），新增一条断言验证这笔费用在整车/拼货模式下的计算是否正确。
10. `DEVELOPMENT_GOALS.md` §6.3.4 固定费用表加一行。

## 5. 与正算/反算公式的互联

车型 CSV 的每个字段都在公式系统中扮演具体角色。改了 CSV 数值后，了解这些字段影响哪些公式、哪些反算逻辑：

### CSV 字段 → 公式映射

| CSV 列 | 正算公式消费方 | 反算消费方 | 改了之后影响 |
|--------|--------------|-----------|-------------|
| `base_rate_vnd_per_km` | `公式.距离成本()` — 直接乘入距离成本 | `_design_row` 设计矩阵的未知数 | **改费率立刻影响报价** |
| `max_load_ton` | `load_ratio` 计算 → 速度惩罚 + 油耗修正 + 容量占比 | `_design_row` 的 load_ratio → fuel_coef | **改载重影响拼货匹配 + 速度/油耗修正** |
| `volume_capacity_m3` | `公式.容量占比()` — 拼货体积比 | `resolve_shipment` 的容量占比 | 改 → 拼货自动匹配结果可能变 |
| `fuel_l_per_100km` | `公式.油耗成本()` — 油耗计算 | `_design_row` 的 fuel_coef | 直接影响油耗成本 |
| `fuel_penalty` | `combined_fuel_penalty = cargo.fuel_penalty + model.fuel_penalty` | 同正算 | 改为叠加机制的一部分（见[正算公式SKILL.md §6.3.3](../公式反算文件/正算公式SKILL.md#633-油耗成本)） |
| `fixed_surcharge_vnd` | `公式.车身附加费()` — 每趟固定 | `_design_row.fixed_known` | 改 → 冷链接报价变化 |
| `toll_rate_vnd_per_km` | `公式.路桥费()` — 按公里 | `_design_row.fixed_known` | 改 → 高速费用变化 |
| `osrm_profile` | OSRM 路由请求的 profile 参数 | 同正算 | 改 → 路线可能不走卡车限行 |
| `suitable_cargo_types` | `_build_suggestions()` — 车型-货物匹配建议 | 不参与反算 | 改 → 前端会提示/不提示车型不适合 |
| `length_m/width_m/height_m` | 目前纯信息性，不参与计算 | 不参与 | 改 → 仅前端展示 |
| `notes` | 不参与计算 | 不参与 | 改 → 文档说明 |

### 关键公式参数来源总结

```
报价 = f(
    距离,           ← OSRM 路由
    时间,           ← OSRM 路由
    速度系数,        ← 公式常量(阈值表) + CSV(max_load_ton)
    基础费率,        ← CSV(base_rate_vnd_per_km)
    货物类型系数,     ← presets.py(CARGO_TYPE_RATES)
    油耗,           ← CSV(fuel_l_per_100km) + CSV(fuel_penalty) + presets(fuel_penalty)
    油价,           ← config.py(default_fuel_price_vnd) 或用户输入
    司机工资,        ← config.py(default_wage_hourly_vnd) 或用户输入
    固定费用(装卸/保险/路桥/车身/路况),  ← CSV + presets + config
    容量占比         ← CSV(max_load_ton, volume_capacity_m3) + 用户输入的货物参数
)
```

### 改了 CSV 后验证公式的 checklist

1. [ ] `python -m pytest backend/tests/test_cost_engine.py -v` — 正算单测
2. [ ] `python -m pytest backend/tests/test_calibration.py -v` — 反算单测
3. [ ] 拼货自动匹配是否正确（新载重/容积下，同一批货匹配到的车型可能变了）
4. [ ] 反算样本中有没有引用被改的 `model_id`（改了 model_id 要批量迁移 samples JSON）
5. [ ] `curl GET /reference/vehicle-models` 确认 API 返回新数值

---

## 6. 改完之后怎么验证

1. 后端单元测试：`cd OSRM++/backend && python -m pytest -v`——尤其关注
   `test_cost_engine.py`/`test_calibration.py`，这两个文件的测试 fixture 如果没跟着
   字段改动同步更新，会直接因为 dataclass 缺字段报错（这是好事，说明漏改了）。
2. 后端能正常启动：改完 CSV 结构后重启一次后端容器，看日志有没有在
   `vehicle_registry.py` 的启动校验那一步就挂掉。
3. 接口手测：`curl` 一下 `GET /reference/vehicle-models`，确认新字段确实出现在返回值里；
   `POST /route/cost` 分别测整车和拼货模式，确认新费用项数字对不对（capacity_ratio<1
   时应该是整车口径的对应比例）。
4. 浏览器实测：前端表单能看到新字段/新费用行，切换整车/拼货模式数字联动正确。
5. 反算 CLI 跑一遍现有样本数据（`python -m app.services.calibration
   公式反算文件/供应商报价/samples_all.json`），确认没有因为字段改动报错，
   拟合结果的量级看起来合理（不要求跟改动前数字完全一样，改动本身就会让口径变化）。
