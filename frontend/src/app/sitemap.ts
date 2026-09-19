import type { MetadataRoute } from "next";
import { TRANSLATIONS } from "@/lib/i18n";

// ⚠️ 用 www（jiuneng.space 会 308 跳到 www）
const BASE = "https://www.jiuneng.space";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/quote", priority: 0.9, changeFrequency: "monthly" },
    { path: "/batch", priority: 0.7, changeFrequency: "monthly" },
    { path: "/tools/loader", priority: 0.6, changeFrequency: "monthly" },
  ];

  // 案例 ID 从 i18n 派生，避免和文案数据重复维护导致漏页
  const caseIds = TRANSLATIONS.zh.site.cases.items.map((c) => c.id);

  return [
    ...pages.map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...caseIds.map((id) => ({
      url: `${BASE}/cases/${id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
