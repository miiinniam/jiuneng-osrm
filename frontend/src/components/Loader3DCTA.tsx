"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { toLoaderVehicle } from "@/lib/loaderVehicleMap";

/**
 * 报价结果「去 3D 装柜」CTA — 条件渲染 (@web-design-01)
 * 映射命中 (OSRM++ model_id → Carbox id) → 品牌蓝按钮带 ?vehicle= 参数;
 * 未命中 (高栏/冷链/45尺等无对应) → 不渲染, 避免死链/错误近似
 */
export default function Loader3DCTA({
  vehicleModelId,
}: {
  vehicleModelId?: string | null;
}) {
  const { t } = useLocale();
  const carboxId = toLoaderVehicle(vehicleModelId);
  if (!carboxId) return null;
  return (
    <Link
      href={`/tools/loader?vehicle=${encodeURIComponent(carboxId)}`}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--blue)] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--blue-hover)]"
    >
      📦 {t.tools.quoteTo3dCta} →
    </Link>
  );
}
