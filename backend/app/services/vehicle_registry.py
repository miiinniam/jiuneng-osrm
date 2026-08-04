"""车辆型号库 —— 从 CSV 加载具体车型（5大类，每类多个具体型号）。

替代旧 presets.py 里的 VEHICLE_PRESETS + BODY_TYPE_PRESETS 两张表（那两张表描述的是
"吨位档位 × 车身类型"的抽象组合，本模块改为直接维护"具体真实车型"的清单，用户在
Excel 里手工维护 车辆型号库.csv，改完重启后端生效——不做热重载，见下方说明）。

CARGO_TYPE_RATES 不受影响，继续留在 presets.py。
"""

import csv
import os
from dataclasses import dataclass
from pathlib import Path

VEHICLE_CATEGORIES = ("small_box", "flatbed", "high_side", "container", "cold_chain")


@dataclass(frozen=True)
class VehicleModel:
    category: str
    model_id: str
    display_name: str
    max_load_ton: float
    volume_capacity_m3: float | None
    length_m: float | None
    width_m: float | None
    height_m: float | None
    base_rate_vnd_per_km: float
    fuel_l_per_100km: float
    fuel_penalty: float
    fixed_surcharge_vnd: float
    toll_rate_vnd_per_km: float
    osrm_profile: str
    suitable_cargo_types: tuple[str, ...]
    notes: str


class VehicleRegistryError(ValueError):
    pass


def _resolve_csv_path() -> Path:
    env_override = os.getenv("VEHICLE_REGISTRY_CSV_PATH")
    if env_override:
        return Path(env_override)
    # Docker 镜像内：backend/Dockerfile 已 COPY 车辆型号库.csv 到 /app/
    docker_candidate = Path("/app/车辆型号库.csv")
    if docker_candidate.exists():
        return docker_candidate
    # 原生运行：backend/app/services/vehicle_registry.py -> parents[3] == OSRM++/
    # 车辆型号库是正算/反算共用的车辆主数据，不属于"反算专属"，单独放在 车辆型号库/
    # 目录（不在 公式反算文件/ 里，那个目录只放反算相关的技能文档和样本数据）。
    return Path(__file__).resolve().parents[3] / "车辆型号库" / "车辆型号库.csv"


def _parse_float(value: str) -> float | None:
    value = (value or "").strip()
    return float(value) if value else None


def _validate(models: list["VehicleModel"]) -> None:
    seen_ids: set[str] = set()
    categories_present: set[str] = set()
    for m in models:
        if m.model_id in seen_ids:
            raise VehicleRegistryError(f"车辆型号库存在重复的 model_id: {m.model_id}")
        seen_ids.add(m.model_id)
        if m.category not in VEHICLE_CATEGORIES:
            raise VehicleRegistryError(
                f"车型「{m.model_id}」的 category「{m.category}」不在合法枚举内: {VEHICLE_CATEGORIES}"
            )
        categories_present.add(m.category)

    missing_categories = set(VEHICLE_CATEGORIES) - categories_present
    if missing_categories:
        raise VehicleRegistryError(
            f"以下车辆大类在车辆型号库里一个型号都没有，拼货自动匹配会永远选不到: {missing_categories}"
        )


def _load_registry(csv_path: Path) -> list[VehicleModel]:
    if not csv_path.exists():
        raise FileNotFoundError(
            f"车辆型号库 CSV 不存在: {csv_path}（原生运行检查相对路径，"
            f"容器内检查 VEHICLE_REGISTRY_CSV_PATH 环境变量和挂载）"
        )
    models = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            models.append(
                VehicleModel(
                    category=row["category"].strip(),
                    model_id=row["model_id"].strip(),
                    display_name=row["display_name"].strip(),
                    max_load_ton=float(row["max_load_ton"]),
                    volume_capacity_m3=_parse_float(row["volume_capacity_m3"]),
                    length_m=_parse_float(row["length_m"]),
                    width_m=_parse_float(row["width_m"]),
                    height_m=_parse_float(row["height_m"]),
                    base_rate_vnd_per_km=float(row["base_rate_vnd_per_km"]),
                    fuel_l_per_100km=float(row["fuel_l_per_100km"]),
                    fuel_penalty=float(row["fuel_penalty"] or 0),
                    fixed_surcharge_vnd=float(row["fixed_surcharge_vnd"] or 0),
                    toll_rate_vnd_per_km=float(row["toll_rate_vnd_per_km"] or 0),
                    osrm_profile=row["osrm_profile"].strip(),
                    suitable_cargo_types=tuple(
                        t.strip() for t in row["suitable_cargo_types"].split(";") if t.strip()
                    ),
                    notes=row["notes"].strip(),
                )
            )
    _validate(models)
    return models


_CSV_PATH = _resolve_csv_path()
try:
    VEHICLE_MODELS: list[VehicleModel] = _load_registry(_CSV_PATH)
except FileNotFoundError:
    import logging
    logging.getLogger(__name__).warning("车辆型号库CSV不存在，使用空列表降级")
    VEHICLE_MODELS = []
VEHICLE_MODEL_INDEX: dict[str, VehicleModel] = {m.model_id: m for m in VEHICLE_MODELS}


def get_model(model_id: str) -> VehicleModel | None:
    return VEHICLE_MODEL_INDEX.get(model_id)


def models_by_category() -> dict[str, list[VehicleModel]]:
    result: dict[str, list[VehicleModel]] = {c: [] for c in VEHICLE_CATEGORIES}
    for m in VEHICLE_MODELS:
        result[m.category].append(m)
    return result
