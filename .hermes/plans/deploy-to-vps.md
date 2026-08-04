# OSRM++ 线上部署规划

> **方案 C：廉价 VPS 一体部署** | 预算 ¥200-350/月 | 目标：内部工具

---

## 一、目标架构

```
                         INTERNET
                            │
                    ┌───────▼────────┐
                    │  Caddy / Nginx  │  ← 反向代理 + 自动 HTTPS
                    │  :80 → :443     │
                    └───┬───┬───┬─────┘
                        │   │   │
              ┌─────────┼───┼───┼─────────┐
              │   VPS (8GB+ RAM, 50-100G SSD) │
              │         │   │   │         │
              │  ┌──────▼───▼───▼──────┐  │
              │  │  osrm-frontend      │  │  Next.js production
              │  │  :47820 (内部)       │  │  `next build && next start`
              │  └──────────┬──────────┘  │
              │             │ HTTP         │
              │  ┌──────────▼──────────┐  │
              │  │  osrm-backend       │  │  FastAPI + uvicorn
              │  │  :8000 (内部)        │  │  (无 --reload, 多 worker)
              │  └──────────┬──────────┘  │
              │             │ HTTP         │
              │  ┌──────────▼──────────┐  │
              │  │  osrm-routing       │  │  OSRM 路由引擎 (4.5GB 数据)
              │  │  :5001 (内部)        │  │  内存占用 ~6-8GB
              │  └─────────────────────┘  │
              └───────────────────────────┘
```

Caddy 或 Nginx 对外暴露 443，自动获取 Let's Encrypt 证书，内部代理到各服务。

---

## 二、需要改动的文件清单

### 2.1 后端改动

#### `backend/Dockerfile` — 生产模式

当前是开发模式（`--reload` + `WATCHFILES_FORCE_POLLING`），需要改为生产模式：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制所有代码（不再用 bind mount）
COPY . .

# 生产环境：单 worker（配合 docker compose scale 扩展）
# 如需多 worker：--workers 4
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**改动点：** 去掉 `--reload`，去掉 `WATCHFILES_FORCE_POLLING`

#### `backend/app/main.py` — CORS 增加生产域名

```python
# 第 29-39 行，allow_origins 改为从环境变量读取
import os

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:47820,http://127.0.0.1:47820").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### `backend/.env` — 密钥安全

当前 `.env` 文件中有 AI API Key。生产环境通过 docker-compose `environment` 或 Docker secrets 注入，**不要把 .env 打进镜像**。

### 2.2 前端改动

#### `frontend/Dockerfile` — 生产模式

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

EXPOSE 47820
CMD ["node_modules/.bin/next", "start", "-p", "47820"]
```

**改动点：** 多阶段构建，`npm run build` 在构建时执行，运行时用 `next start`

> ⚠️ `NEXT_PUBLIC_API_BASE_URL` 是 build-time 环境变量。构建时需设为生产 API 地址（如 `https://osrm.jiuneng.com/api/v1`）。**不能用 `localhost`**，因为浏览器端 JavaScript 会直接请求这个地址。

#### `frontend/src/lib/api.ts` — 无需改动

当前的 `process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"` 已经正确，只需在构建时传入正确的环境变量即可。

### 2.3 新增 Docker Compose 生产文件

#### `docker-compose.prod.yml`

```yaml
# OSRM++ 生产部署
# 用法: docker compose -f docker-compose.prod.yml up -d

services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend:latest
    container_name: osrm-routing
    command: osrm-routed --algorithm mld /data/vietnam-latest.osrm
    ports:
      - "127.0.0.1:5001:5000"  # 仅本地访问，不暴露到公网
    volumes:
      - osrm_data:/data:ro
    restart: unless-stopped
    mem_limit: 8g  # OSRM 内存限制

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: osrm-backend
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - backend_data:/app/data              # 持久化 exchange_rate.json, DB
      - vehicle_registry:/vehicle_registry:ro  # 车辆型号库
    environment:
      - OSRM_BASE_URL=http://osrm:5000
      - VEHICLE_REGISTRY_CSV_PATH=/vehicle_registry/车辆型号库.csv
      - CORS_ORIGINS=${CORS_ORIGINS}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}  # AI API Key
      - DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL:-https://api.deepseek.com}
    depends_on:
      - osrm
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
    container_name: osrm-frontend
    ports:
      - "127.0.0.1:47820:47820"
    environment:
      - NODE_ENV=production
    depends_on:
      - backend
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    container_name: osrm-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  osrm_data:        # OSRM 地图数据（4.5GB）
  backend_data:     # exchange_rate.json, hs_tariff, sqlite
  vehicle_registry: # 车辆型号库 CSV
  caddy_data:       # SSL 证书
  caddy_config:     # Caddy 配置
```

### 2.4 新增 Caddy 配置

#### `Caddyfile`

```
osrm.jiuneng.com {
    reverse_proxy frontend:47820

    handle_path /api/* {
        reverse_proxy backend:8000
    }

    # 安全头
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}
```

> 选择 Caddy 而非 Nginx 的理由：Caddy 自动申请和续期 Let's Encrypt 证书，零配置 HTTPS。Nginx 需要额外的 certbot 配置。

### 2.5 新增 `.env.production`

```bash
# 前端构建时注入（必须是浏览器可访问的域名/地址）
NEXT_PUBLIC_API_BASE_URL=https://osrm.jiuneng.com/api/v1

# 后端 CORS
CORS_ORIGINS=https://osrm.jiuneng.com

# AI API Key（从原 .env 复制）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 2.6 新增 `.dockerignore`（前后端都需要）

确保不要把 node_modules、.next、__pycache__、.env、.git 等打进镜像。

---

## 三、数据迁移清单

| 数据 | 大小 | 部署方式 | 说明 |
|------|------|----------|------|
| OSRM 地图数据 | **4.5GB** | Docker volume | 需手动上传到服务器 `osrm_data` volume |
| 车辆型号库 CSV | 7KB | Docker volume | `vehicle_registry` volume，可随时替换 |
| `exchange_rate.json` | 118B | Docker volume | 自动生成，首次为空也 OK |
| `hs_tariff_2026.json` | 2.4MB | **打进镜像** | 代码的一部分，不用 volume |
| `fixed_fees.json` | 2.7KB | **打进镜像** | 代码的一部分，不用 volume |
| `osrm_plus.db` | 12KB | Docker volume | SQLite，持久化保存模板数据 |

### OSRM 数据上传（最大的痛点）

4.5GB 数据通过 `scp` 上传到 VPS 大概需要：
- 100Mbps 上行 ≈ 6 分钟
- 20Mbps 上行 ≈ 30 分钟

**推荐步骤：**
```bash
# 1. 先在本地打包（减少文件数量）
tar -czf osrm-data.tar.gz -C "D:/01_业务/玖能/OSRM/data" .

# 2. 上传到 VPS
scp osrm-data.tar.gz root@<VPS_IP>:/tmp/

# 3. 在 VPS 上解压到 Docker volume
# （先 docker compose up -d osrm 创建 volume，然后）
docker run --rm -v osrm_data:/data -v /tmp:/src alpine \
  sh -c "cd /data && tar -xzf /src/osrm-data.tar.gz"
```

---

## 四、VPS 推荐对比

| 提供商 | 配置 | 月费(约) | 机房 | 越南延迟 |
|--------|------|----------|------|----------|
| **RackNerd** | 4C/8GB/100GB SSD/10TB流量 | ¥180 | 洛杉矶 | ~180ms |
| **HostHatch** | 4C/8GB/80GB NVMe | ¥200 | 新加坡 | ~40ms |
| **Vultr** | 4C/8GB/160GB | ¥290 | 新加坡 | ~40ms |
| **阿里云 ECS** | 4C/8GB | ¥380 | 香港 | ~30ms |

> 推荐 HostHatch 或 Vultr 新加坡机房，越南用户延迟 ~40ms，性价比好。

---

## 五、部署操作清单

### 阶段 1：本地准备（1-2 小时）

- [ ] 1.1 创建 `frontend/Dockerfile`（生产版本，多阶段构建）
- [ ] 1.2 修改 `backend/Dockerfile`（去掉 --reload）
- [ ] 1.3 修改 `backend/app/main.py`（CORS 从环境变量读取）
- [ ] 1.4 创建 `docker-compose.prod.yml`
- [ ] 1.5 创建 `Caddyfile`
- [ ] 1.6 创建 `.env.production`
- [ ] 1.7 创建 `backend/.dockerignore` 和 `frontend/.dockerignore`
- [ ] 1.8 本地测试 production build：`docker compose -f docker-compose.prod.yml build`
- [ ] 1.9 打包 OSRM 数据：`tar -czf osrm-data.tar.gz -C D:/01_业务/玖能/OSRM/data .`

### 阶段 2：VPS 初始化（30 分钟）

- [ ] 2.1 购买 VPS（推荐 HostHatch 新加坡 8GB，约 ¥200/月）
- [ ] 2.2 安装 Docker + Docker Compose
- [ ] 2.3 配置防火墙（只开 22, 80, 443）
- [ ] 2.4 购买域名，配置 DNS A 记录指向 VPS IP

### 阶段 3：部署（30 分钟）

- [ ] 3.1 将代码上传到 VPS（`git clone` 或 `scp`）
- [ ] 3.2 上传 OSRM 数据到 VPS
- [ ] 3.3 将 OSRM 数据解压到 Docker volume
- [ ] 3.4 复制 `.env.production` → `.env`，填入真实 API Key
- [ ] 3.5 上传 车辆型号库 CSV 到 VPS
- [ ] 3.6 `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] 3.7 检查日志：`docker compose -f docker-compose.prod.yml logs -f`
- [ ] 3.8 访问 `https://osrm.jiuneng.com` 验证

### 阶段 4：运维（持续）

- [ ] 4.1 配置自动备份（exchange_rate.json, osrm_plus.db）
- [ ] 4.2 监控内存使用（OSRM ~6-8GB，总 8GB 很紧）
- [ ] 4.3 如需升级内存 → VPS 提供商后台扩容

---

## 六、风险与注意事项

1. **⚠️ OSRM 内存吃紧**：8GB VPS 中 OSRM 占 6-8GB，前端+后端+Caddy 共享剩余 ~0.5-1GB。建议：
   - 设置 `mem_limit: 7g` 给 OSRM 留余地
   - 监控 OOM Killer，必要时加 swap（降低性能但防止崩溃）
   - 优先考虑 **10GB 或 12GB VPS**（HostHatch 有 12GB 约 ¥280/月）

2. **⚠️ OSRM 数据更新**：越南地图数据需要定期更新（OSM 数据变化）。需规划定期重新下载和预处理。

3. **⚠️ `NEXT_PUBLIC_*` 是构建时变量**：如果 API 地址变了，必须重新 build 前端镜像。

4. **⚠️ SQLite 并发**：当前用 SQLite（单文件），不支持多进程并发写。单 worker 无问题，多 worker 扩展时需改用 PostgreSQL。

5. **⚠️ 限流基于 IP**：当前限流是内存中的滑动窗口，重启后重置。单机够用，多机需 Redis。

---

## 七、成本汇总

| 项目 | 月费(约) | 年费(约) |
|------|----------|----------|
| VPS (8GB RAM) | ¥200-380 | ¥2400-4560 |
| 域名 | ¥0（分摊到月） | ¥50-80 |
| SSL 证书 | ¥0（Let's Encrypt） | ¥0 |
| **合计** | **¥200-400** | **¥2450-4640** |

---

## 八、下一步

1. 确认域名（如 `osrm.jiuneng.com` 或其他）
2. 确认 VPS 提供商
3. 开始实施阶段 1（代码改造）
