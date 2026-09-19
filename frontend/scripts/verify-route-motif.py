"""CDP 验证路线母题在 4 个断点的表现。

方法学：窄视口一律走 CDP 读矩形，**不用** --window-size 截图判布局
（该方式算出的布局宽大于截图宽，会产生假性裁切）。

用法：python scripts/verify-route-motif.py
前置：dev 或 start 服务器跑在 47820。
"""
import asyncio
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9341
URL = "http://localhost:47820/"
VIEWPORTS = [
    (375, 812, "移动"),
    (390, 844, "移动大"),
    (768, 1024, "平板"),
    (1440, 900, "桌面"),
]

PROBE = """(() => {
  const svg = document.querySelector('#trunk-route-path');
  const band = svg ? svg.closest('div') : null;
  const spine = document.querySelector('.route-spine');
  const labels = [...document.querySelectorAll('span')]
     .filter(s => /凭祥|友谊关|河内|Pingxiang|Hanoi|Bằng Tường|Hà Nội/.test(s.textContent));
  const dots = document.querySelectorAll('svg.h-\\\\[13px\\\\]');
  return {
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    pathLen: svg ? svg.getTotalLength() : -1,
    bandW: band ? band.getBoundingClientRect().width : -1,
    bandH: band ? band.getBoundingClientRect().height : -1,
    bandAspect: band ? (band.getBoundingClientRect().width / band.getBoundingClientRect().height) : -1,
    spineBefore: spine ? getComputedStyle(spine, '::before').display : 'none',
    spineAfter: spine ? getComputedStyle(spine, '::after').display : 'none',
    spineFill: spine ? getComputedStyle(spine).getPropertyValue('--spine-fill').trim() : '',
    dotCount: dots.length,
    labelCount: labels.length,
    labelVisible: labels.filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none';
    }).length,
    dotDisplay: (() => {
      const d = document.querySelector('.trunk-route-dot');
      return d ? getComputedStyle(d).display : 'missing';
    })(),
  };
})()"""


async def main():
    profile = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu",
         f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        page = None
        for _ in range(60):
            try:
                tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
                page = next(t for t in tabs if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.5)
        if page is None:
            print("✗ 无法连接 Chrome")
            return 1

        import websockets
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=2 ** 24) as ws:
            counter = 0

            async def cdp(method, **params):
                nonlocal counter
                counter += 1
                mid = counter
                await ws.send(json.dumps({"id": mid, "method": method, "params": params}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == mid:
                        return msg.get("result", {})

            await cdp("Page.enable")
            fails = []

            for w, h, label in VIEWPORTS:
                await cdp("Emulation.setDeviceMetricsOverride",
                          width=w, height=h, deviceScaleFactor=1, mobile=w < 768)
                await cdp("Page.navigate", url=URL)
                await asyncio.sleep(6)

                res = await cdp("Runtime.evaluate", expression=PROBE, returnByValue=True)
                v = res["result"]["value"]
                ok = []

                # 1) 无横向溢出
                if v["scrollW"] != v["clientW"]:
                    fails.append(f"{label} {w}px 横向溢出 {v['scrollW']}>{v['clientW']}")
                else:
                    ok.append("无溢出")

                # 2) 路线路径已渲染
                if v["pathLen"] <= 0:
                    fails.append(f"{label} {w}px 路线路径长度为 0")
                else:
                    ok.append(f"路径长 {v['pathLen']:.0f}")

                # 3) 干线带尺寸与比例
                if v["bandW"] <= 0 or v["bandH"] <= 0:
                    fails.append(f"{label} {w}px 干线带尺寸为 0")
                else:
                    ok.append(f"带 {v['bandW']:.0f}×{v['bandH']:.0f}")
                    # 等比缩放校验：1160/168 ≈ 6.90
                    if abs(v["bandAspect"] - 1160 / 168) > 0.05:
                        fails.append(f"{label} {w}px 干线带比例失真 {v['bandAspect']:.2f}（应 6.90）")

                # 4) 端点标签
                if v["labelVisible"] < 2:
                    fails.append(f"{label} {w}px 可见端点标签不足（{v['labelVisible']}）")
                else:
                    ok.append(f"标签 {v['labelVisible']}")

                # 5) spine 响应式显示/隐藏
                if w < 768:
                    if v["spineBefore"] != "none":
                        fails.append(f"{label} {w}px spine 应隐藏，实际 {v['spineBefore']}")
                    else:
                        ok.append("spine 已隐藏")
                else:
                    if v["spineBefore"] == "none":
                        fails.append(f"{label} {w}px spine 应显示，实际隐藏")
                    else:
                        ok.append("spine 显示")

                print(f"  {label:6} {w}×{h}  " + " | ".join(ok))

            # 6) reduced-motion：路线仍渲染，光点隐藏
            await cdp("Emulation.setDeviceMetricsOverride",
                      width=1440, height=900, deviceScaleFactor=1, mobile=False)
            await cdp("Emulation.setEmulatedMedia",
                      features=[{"name": "prefers-reduced-motion", "value": "reduce"}])
            await cdp("Page.navigate", url=URL)
            await asyncio.sleep(6)
            res = await cdp("Runtime.evaluate", expression=PROBE, returnByValue=True)
            v = res["result"]["value"]
            ok = []
            if v["pathLen"] <= 0:
                fails.append("reduced-motion 下路线消失（违反规格 §6）")
            else:
                ok.append(f"路线可见 路径长 {v['pathLen']:.0f}")
            if v["dotDisplay"] != "none":
                fails.append(f"reduced-motion 下光点应隐藏，实际 {v['dotDisplay']}")
            else:
                ok.append("光点已隐藏")
            if v["spineFill"] not in ("1", "1.0"):
                fails.append(f"reduced-motion 下 spine 填充应为 1，实际 {v['spineFill']!r}")
            else:
                ok.append("spine 填充=1")
            print(f"  {'减动效':6} 1440×900  " + " | ".join(ok))

            # 7) 案例卡角标
            await cdp("Emulation.setEmulatedMedia", features=[])
            await cdp("Page.navigate", url=URL)
            await asyncio.sleep(6)
            res = await cdp("Runtime.evaluate", expression=PROBE, returnByValue=True)
            v = res["result"]["value"]
            if v["dotCount"] < 1:
                fails.append(f"案例卡微缩角标缺失（找到 {v['dotCount']}）")
            else:
                print(f"  {'角标':6} 1440×900  角标 {v['dotCount']} 个")

            print()
            if fails:
                print("✗ 失败项:")
                for f in fails:
                    print("   -", f)
                return 1
            print("✓ 全部通过")
            return 0
    finally:
        proc.terminate()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
