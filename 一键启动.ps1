# 一键启动 OSRM++ 全套服务：OSRM 路由引擎 + 后端 API + 前端界面
# 用法：双击同目录下的 一键启动.bat（推荐），或者右键这个 .ps1 文件选"用 PowerShell 运行"
#
# 注意：这个文件必须保存为带 UTF-8 BOM 的编码，否则 PowerShell 5.1 会用系统默认代码页
# （GBK）解析本文件里的中文，显示会变成乱码——跟 ..\start.ps1 头部注释提到的坑是同一个坑。
#
# 前端固定用端口 47820（一个刻意选的冷门端口），不用 Next.js 默认的 3000：
# 这台机器上同时跑着好几个不相关的项目（JIUNENG 官网、LogiCharger 等），它们的开发服务器
# 长期占着 3000、3100 这类常见端口——甚至发现过同一个端口号被不同项目分别用 IPv4/IPv6
# 各自监听、共存不冲突的情况，导致 "localhost:3000" 到底打开的是谁的页面完全不确定，
# 浏览器打开过一次别的项目的页面。与其去猜"现在这个端口到底是谁的"，不如从一开始就固定用一个
# 冷门到不会被撞上的端口号，问题从根上消失。前端端口号只在这一个地方维护
# （frontend/package.json 的 dev 脚本、.claude/launch.json 里也要保持一致，改端口时三处一起改）。
#
# 后端跑在 Docker 容器里，用的是 Docker Desktop（不是 OSRM 引擎那边用的 WSL2 原生 Docker
# ——这台机器后来装了 Docker Desktop，它和 WSL2 里的原生 dockerd 是两个不同的 Docker
# 引擎/网络栈，同时用会互相抢占端口，之前踩过这个坑）。用 -v 把 backend 目录绑定挂载进容器，
# 容器里改代码等于宿主机改代码，--reload 照样生效；容器**不能用 --network host**——
# Docker Desktop 在 Windows 上的 host 网络模式指向它自己内部隐藏的 VM，不会把端口暴露到
# Windows 本机，所以改用显式 -p 端口映射；连接本地 OSRM 服务也不能再用
# localhost:5001（那是 WSL2 "Ubuntu" 发行版自己的网络命名空间，Docker Desktop 的容器
# 看不到），改用 Docker Desktop 提供的 host.docker.internal 别名访问 Windows 本机端口。
# 前端目前还是原生 npm run dev 跑在 Windows 上，没有一起容器化——Next.js 的热更新在
# "容器挂载 Windows 盘"这种网络文件系统下经常连不上 inotify 通知、体验会变差，原生跑更可靠。
#
# 车辆型号库.csv（拼货/整车双模式改造新增，用户会在 Excel 里手工维护，正算/反算都要用到，
# 不属于"反算专属"数据，单独放在 OSRM++/车辆型号库/ 目录，不跟 公式反算文件/ 混在一起）
# 放在 backend/ 外面，容器只挂载了 backend/ -> /app，默认看不到，所以这里额外挂一个独立
# 目录 + 用 VEHICLE_REGISTRY_CSV_PATH 环境变量告诉 vehicle_registry.py 去哪读
# （这个环境变量覆盖机制是 vehicle_registry.py 自己设计好的）。
#
# 用 Docker Desktop 意味着**必须先手动启动 Docker Desktop 这个应用**（它不像 WSL2 原生
# dockerd 那样能被脚本静默拉起），脚本会检测它有没有在跑，没跑会提示你手动启动。

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$osrmPlusRoot = Split-Path -Parent $MyInvocation.MyCommand.Path   # OSRM++ 目录
$osrmRoot = Split-Path -Parent $osrmPlusRoot                       # OSRM 目录（上一级，start.ps1 所在）

$BackendPort = 8000
$BackendContainerName = "osrmplus-backend"
$BackendImageName = "osrmplus-backend"
$FrontendPort = 47820
$FrontendUrl = "http://localhost:$FrontendPort"
$FrontendLogFile = Join-Path $osrmPlusRoot "frontend\.dev-server.log"

function Test-Port([int]$Port, [int]$TimeoutMs = 300) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect("localhost", $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne($TimeoutMs)
        if ($ok) { $client.EndConnect($iar) | Out-Null }
        return [bool]$ok
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-BackendReady {
    # 只看端口通不通会跟别的服务混淆，实际打一次 /health 确认是我们自己的后端
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:$BackendPort/health" -TimeoutSec 2
        return $resp.status -eq "ok"
    } catch {
        return $false
    }
}

function Test-DockerDesktopReady {
    try {
        docker version --format "{{.Server.Version}}" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-FrontendReady {
    # 47820 是专门为这个项目保留的冷门端口，正常不会被别的项目撞上；
    # 但还是顺手看一眼页面内容里有没有 "OSRM++"，防止哪天真的撞上了却没发现
    if (-not (Test-Port $FrontendPort)) { return $false }
    try {
        $resp = Invoke-WebRequest -Uri $FrontendUrl -TimeoutSec 3 -UseBasicParsing
        return $resp.Content -match "OSRM\+\+"
    } catch {
        return $false
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  OSRM++ 越南运输费用预测 —— 一键启动" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. OSRM 路由引擎（端口 5001） ----------
Write-Host "[1/3] 检查 OSRM 路由引擎 (端口 5001) ..." -ForegroundColor Yellow
if (Test-Port 5001) {
    Write-Host "      已经在运行，跳过启动" -ForegroundColor Green
} else {
    Write-Host "      未运行，正在通过 start.ps1 启动（WSL2 + Docker）..."
    & "$osrmRoot\start.ps1"
    Write-Host "      等待 OSRM 就绪..."
    $waited = 0
    while (-not (Test-Port 5001) -and $waited -lt 60) {
        Start-Sleep -Seconds 2
        $waited += 2
    }
    if (Test-Port 5001) {
        Write-Host "      OSRM 启动成功" -ForegroundColor Green
    } else {
        Write-Host "      OSRM 启动超时，请检查 WSL2/Docker 是否正常" -ForegroundColor Red
    }
}

# ---------- 2. 后端 API（Docker Desktop 容器，端口 8000，靠 /health 确认身份） ----------
Write-Host "[2/3] 检查后端 API (端口 $BackendPort) ..." -ForegroundColor Yellow
if (Test-BackendReady) {
    Write-Host "      已经在运行，跳过启动" -ForegroundColor Green
} elseif (-not (Test-DockerDesktopReady)) {
    Write-Host "      Docker Desktop 好像没有在运行，请先手动启动 Docker Desktop 应用再重新运行本脚本" -ForegroundColor Red
} else {
    $backendPath = Join-Path $osrmPlusRoot "backend"
    $registryPath = Join-Path $osrmPlusRoot "车辆型号库"
    Write-Host "      未运行，正在构建/启动 Docker 容器 ..."
    docker build -t $BackendImageName $backendPath
    try { docker rm -f $BackendContainerName 2>$null | Out-Null } catch {}
    docker run -d --name $BackendContainerName -p "${BackendPort}:8000" `
        -v "${backendPath}:/app" `
        -v "${registryPath}:/vehicle_registry" `
        -e VEHICLE_REGISTRY_CSV_PATH=/vehicle_registry/车辆型号库.csv `
        -e OSRM_BASE_URL=http://host.docker.internal:5001 `
        $BackendImageName | Out-Null

    Write-Host "      等待后端容器就绪..."
    $waited = 0
    while (-not (Test-BackendReady) -and $waited -lt 60) {
        Start-Sleep -Seconds 2
        $waited += 2
    }
    if (Test-BackendReady) {
        Write-Host "      后端容器启动成功" -ForegroundColor Green
    } else {
        Write-Host "      后端容器还没就绪，容器日志：" -ForegroundColor Red
        docker logs --tail 30 $BackendContainerName
    }
}

# ---------- 3. 前端界面（固定端口 47820） ----------
Write-Host "[3/3] 检查前端界面 (端口 $FrontendPort) ..." -ForegroundColor Yellow
if (Test-FrontendReady) {
    Write-Host "      已经在运行，跳过启动" -ForegroundColor Green
} else {
    if (Test-Port $FrontendPort) {
        Write-Host "      端口 $FrontendPort 被其它程序占用了（不应该发生，这个端口是专门给 OSRM++ 保留的），请检查后手动处理" -ForegroundColor Red
    } else {
        Write-Host "      未运行，正在新窗口启动 npm run dev ..."
        if (Test-Path $FrontendLogFile) { Remove-Item $FrontendLogFile -Force }
        Start-Process powershell -ArgumentList @(
            "-NoExit", "-Command",
            "cd '$osrmPlusRoot\frontend'; npm run dev 2>&1 | Tee-Object -FilePath '$FrontendLogFile'"
        ) -WindowStyle Normal

        Write-Host "      等待前端就绪（首次编译可能要一会儿）..."
        $waited = 0
        while (-not (Test-FrontendReady) -and $waited -lt 90) {
            Start-Sleep -Seconds 2
            $waited += 2
        }
        if (Test-FrontendReady) {
            Write-Host "      前端启动成功" -ForegroundColor Green
        } else {
            Write-Host "      前端启动超时，去前端窗口里看看是不是报错了" -ForegroundColor Red
        }
    }
}

# ---------- 打开浏览器 ----------
Write-Host ""
$backendOk = Test-BackendReady
$frontendOk = Test-FrontendReady

if ($backendOk -and $frontendOk) {
    try {
        Start-Process $FrontendUrl
        Write-Host "已自动打开浏览器：$FrontendUrl" -ForegroundColor Green
    } catch {
        Write-Host "自动打开浏览器失败（$($_.Exception.Message)），请手动打开：$FrontendUrl" -ForegroundColor Red
    }
} else {
    Write-Host "后端或前端还没就绪，浏览器不会自动打开" -ForegroundColor Red
    if (-not $backendOk) { Write-Host "  - 后端还没响应，看上面的容器日志，或手动执行 docker logs $BackendContainerName" -ForegroundColor Red }
    if (-not $frontendOk) { Write-Host "  - 前端还没就绪，去前端窗口里看看是不是报错了" -ForegroundColor Red }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  启动完成，常用地址：" -ForegroundColor Cyan
Write-Host "  前端界面      $FrontendUrl"
Write-Host "  后端 API 文档  http://localhost:$BackendPort/docs"
Write-Host "  OSRM 地图查看  http://localhost:9966"
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "提示：前端在独立窗口里运行，想停止就直接关掉那个窗口（或者按 Ctrl+C）；"
Write-Host "     后端是 Docker Desktop 里的容器，想停止用 docker stop $BackendContainerName；"
Write-Host "     OSRM 引擎跑在 WSL2 原生 Docker 里（两个不同的 Docker 引擎），互不影响。"
Write-Host ""
