import type { MetadataRoute } from "next";

// ⚠️ 用 www（jiuneng.space 会 308 跳到 www）
const BASE = "https://www.jiuneng.space";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 工具页与 API 无索引价值，避免爬虫浪费配额在参数化表单页上
        disallow: ["/api/", "/planner"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
