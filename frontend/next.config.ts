import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许局域网手机通过本机 IP 访问 dev 服务器（Next.js 16 默认阻断跨源 dev 资源，
  // 否则手机打开页面 HTML 正常但 JS 事件不挂载 → 界面点不动）
  allowedDevOrigins: ["192.168.1.101", "localhost"],
};

export default nextConfig;
