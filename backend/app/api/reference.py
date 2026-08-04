from fastapi import APIRouter

from app.config import settings
from app.services.exchange_rate import force_refresh, get_exchange_rate
from app.services.presets import CARGO_IMPORT_EXPORT_ESTIMATES, CARGO_TYPE_RATES
from app.services.vehicle_registry import models_by_category

router = APIRouter()


@router.get("/reference/vehicle-models")
async def list_vehicle_models() -> dict:
    return {
        category: [
            {
                "model_id": m.model_id,
                "display_name": m.display_name,
                "max_load_ton": m.max_load_ton,
                "volume_capacity_m3": m.volume_capacity_m3,
                "length_m": m.length_m,
                "width_m": m.width_m,
                "height_m": m.height_m,
                "base_rate_vnd_per_km": m.base_rate_vnd_per_km,
                "fuel_l_per_100km": m.fuel_l_per_100km,
                "fuel_penalty": m.fuel_penalty,
                "fixed_surcharge_vnd": m.fixed_surcharge_vnd,
                "toll_rate_vnd_per_km": m.toll_rate_vnd_per_km,
                "osrm_profile": m.osrm_profile,
                "suitable_cargo_types": list(m.suitable_cargo_types),
                "notes": m.notes,
            }
            for m in models
        ]
        for category, models in models_by_category().items()
    }


@router.get("/reference/cargo-types")
async def list_cargo_types() -> dict:
    return {
        cargo_type: {"rate_multiplier": r.rate_multiplier, "fuel_penalty": r.fuel_penalty}
        for cargo_type, r in CARGO_TYPE_RATES.items()
    }


@router.get("/reference/fuel-price")
async def get_fuel_price() -> dict:
    # TODO: Phase 4 接入 Petrolimex 自动同步，目前是系统默认值
    return {"price_vnd": settings.default_fuel_price_vnd, "source": "manual_default"}


@router.get("/reference/cargo-estimates")
async def get_cargo_estimates(cargo_type: str | None = None) -> dict:
    """返回货物类型进出口费用快速估算（非 HS 码精确查询）。
    
    不传 cargo_type 返回全部货物类型；传入则只返回该类型的估算。
    """
    if cargo_type:
        est = CARGO_IMPORT_EXPORT_ESTIMATES.get(cargo_type)
        if est is None:
            from fastapi import HTTPException
            raise HTTPException(404, f"未知货物类型: {cargo_type}")
        return {
            "cargo_type": cargo_type,
            "export_fee_rmb_per_vehicle": est.export_fee_rmb_per_vehicle,
            "import_fee_rmb_per_vehicle": est.import_fee_rmb_per_vehicle,
            "estimated_duty_rate": est.estimated_duty_rate,
            "estimated_vat_rate": est.estimated_vat_rate,
            "description_zh": est.description_zh,
            "description_vi": est.description_vi,
        }
    return {
        ct: {
            "export_fee_rmb_per_vehicle": est.export_fee_rmb_per_vehicle,
            "import_fee_rmb_per_vehicle": est.import_fee_rmb_per_vehicle,
            "estimated_duty_rate": est.estimated_duty_rate,
            "estimated_vat_rate": est.estimated_vat_rate,
            "description_zh": est.description_zh,
            "description_vi": est.description_vi,
        }
        for ct, est in CARGO_IMPORT_EXPORT_ESTIMATES.items()
    }
