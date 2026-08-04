# 玖能官网 + OSRM++ 部署规划（Vercel + VPS 混合架构）

> **最终方案**：前端 Vercel（免费/CDN/HTTPS）+ 后端新加坡 VPS（OSRM 报价引擎）
> 域名：jiuneng.space（Vercel 接管，旧 Netlify 官网下线）

---

## 一、目标架构

```
                        INTERNET
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐     ┌─────────▼──────────┐
    │  Vercel (前端)     │     │  VPS (后端 8GB+)    │
    │  jiuneng.space    │     │  :80/:443 → Caddy  │
    │  官网+报价+批量+AI │     │   /api/* → backend  │
    │  git push 自动部署 │     │   backend:8000      │
    └────────────────────┘     │   osrm:5000 (4.5GB)│
                               └────────────────────┘
```

- **前端**：Next.js 16，Vercel 托管，`git push` 自动部署
- **后端**：FastAPI（backend:8000）+ OSRM 路由引擎（osrm:5000, 4.5GB 地图数据）
- **API 地址**：`https://jiuneng.space/api/*`（Caddy 反代到 backend）

---

## 二、已完成 ✅

### 2.1 Git + GitHub
- 仓库：`https://github.com/miiinniam/jiuneng-osrm`（public）
- `backend/.env` 已被 .gitignore 排除（API Key 不提交）

### 2.2 前端 Vercel 配置
- `frontend/vercel.json`：framework=nextjs
- `frontend/.env.production.example`：`NEXT_PUBLIC_API_BASE_URL=https://jiuneng.space/api/v1`
- 修复 `useAIChat.ts` 正则 `/s` flag（ES2017 不兼容，阻塞 Vercel 构建）
- ✅ 本地 `next build` 验证通过（6 页面全静态/动态正常）

### 2.3 后端生产化
- `backend/Dockerfile`：去 --reload，单 worker（SQLite 不并发）
- `backend/app/main.py`：CORS 从环境变量读取（默认含 jiuneng.space）
- `docker-compose.prod.yml`：osrm + backend + caddy（前端不跑在 VPS）
- `Caddyfile`：/api/* 反代到 backend:8000
- `.env.production`：CORS_ORIGINS + DEEPSEEK_API_KEY 模板

---

## 三、待用户操作（网页端，30 分钟）

### 3.1 Vercel 部署前端
1. 登录 https://vercel.com（用 GitHub 账号）
2. New Project → Import `miiinniam/jiuneng-osrm`
3. **Root Directory 设为 `frontend`**
4. 环境变量（Production）：
   - `NEXT_PUBLIC_API_BASE_URL=https://jiuneng.space/api/v1`
5. Deploy → 得到 `xxx.vercel.app`

### 3.2 Vercel 绑定域名
1. Project → Settings → Domains → 添加 `jiuneng.space`
2. 按提示在 DNS 提供商处添加记录（Vercel 给出 A/NS 记录）
3. 旧 Netlify 站点停止（Netlify → Site → 删域名或删站）

### 3.3 租 VPS + 部署后端
1. 购买：**HostHatch 新加坡 8GB**（约 ¥200/月）或 **12GB**（约 ¥280/月）
   - RackNerd 洛杉矶 8GB ¥180（越南延迟 ~180ms）
   - Vultr 新加坡 8GB ¥290（延迟 ~40ms）
2. VPS 初始化：Docker + Docker Compose + 防火墙（22/80/443）
3. 上传代码：`git clone https://github.com/miiinniam/jiuneng-osrm`
4. 上传 OSRM 数据（4.5GB）：
   ```bash
   tar -czf osrm-data.tar.gz -C "D:/01_业务/玖能/OSRM/data" .
   scp osrm-data.tar.gz root@<VPS_IP>:/tmp/
   docker compose -f docker-compose.prod.yml up -d osrm  # 创建 volume
   docker run --rm -v osrm_data:/data -v /tmp:/src alpine sh -c "cd /data && tar -xzf /src/osrm-data.tar.gz"
   ```
5. 上传车辆型号库 CSV：
   ```bash
   docker run --rm -v vehicle_registry:/vr -v "$PWD/车辆型号库:/src" alpine sh -c "cp /src/车辆型号库.csv /vr/"
   ```
6. 配置环境变量：`cp .env.production .env` + 填入真实 DEEPSEEK_API_KEY
7. 启动：`docker compose -f docker-compose.prod.yml up -d --build`
8. 验证：`curl https://jiuneng.space/api/v1/reference/exchange-rate`

### 3.4 DNS 指向
- jiuneng.space 的 DNS 记录分两路：
  - 根域名（前端）→ Vercel 提供的记录
  - `api.jiuneng.space` 或同域 /api 路径 → 见 Caddyfile 方案
- **推荐**：所有流量走 Vercel（前端），API 走 `https://jiuneng.space/api/*`，需要 Caddy 与 Vercel 同域共存 → 实际用 Vercel 的 rewrites 反代 `/api/*` 到 VPS IP（Vercel 支持 Rewrites 到外部 URL）

> ⚠️ **重要修正**：jiuneng.space 在 Vercel 后，`/api/*` 由 Vercel 处理。Vercel 支持 `rewrites` 把 `/api/*` 代理到外部服务器（VPS）。这样 Caddy 只需监听 VPS 的 8000 内部端口，不需要 80/443。
> 替代方案：`api.jiuneng.space` 子域名 → DNS A 记录 → VPS，前端 API_BASE 改为 `https://api.jiuneng.space/api/v1`（更简单，推荐）

---

## 四、数据清单

| 数据 | 大小 | 位置 |
|------|------|------|
| OSRM 地图 | 4.5GB | VPS volume `osrm_data` |
| 车辆型号库 CSV | 7KB | VPS volume `vehicle_registry` |
| exchange_rate.json | 118B | VPS volume `backend_data` |
| hs_tariff_2026.json | 2.4MB | 打进后端镜像 |
| osrm_plus.db | 12KB | VPS volume `backend_data` |

---

## 五、风险

1. **OSRM 内存 6-8GB**：8GB VPS 很紧，建议 12GB；设 mem_limit 7g
2. **SQLite 单 worker**：不要改多 worker
3. **NEXT_PUBLIC_* 构建时变量**：API 地址变了要重新部署 Vercel
4. **Vercel 函数超时**：AI 聊天 SSE 长连接可能超过 Vercel 免费层限制 → 确认 AI 调用走 VPS 直连（不经 Vercel 函数），前端直接 fetch `https://api.jiuneng.space` 即可
