/**
 * 明亮化验收脚本（2026-09，v0.7 浅色化回归用）
 *
 * 本脚本做（桌面 1440 + 移动 420 各跑一遍）：
 *   1. 截整页 PNG 到 OUT 目录（亮度带断言由配套的 verify-light-brightness.py 做，
 *      Node 无依赖解 PNG 不划算 —— 见该文件；本脚本不重复声称做了亮度计算）
 *   2. 抽取每个 section/footer 的 computed 背景色，断言无深色满幅 section
 *   3. 断言两个视口横向溢出 = 0
 *   4. 真跑一遍首页报价：友谊关 → 河内 + 吨位 → 点计算 → 读回越南盾结果（直连 Render 后端）
 *
 * 运行：cd frontend && node scripts/verify-light-theme.mjs
 *      python scripts/verify-light-brightness.py
 * 退出码：0 = 全部断言通过；1 = 有失败项（failures 数组会打印出来）—— 不再静默假绿。
 *
 * ⚠️ 换端口会失效：后端 CORS 白名单只有 localhost:47820 / localhost:3000 / 生产域名，
 *    用别的端口起 dev server 时浏览器直连 Render 会被 CORS 挡掉（报价段整段 no-op）。
 *    要么用 47820，要么同步改后端 CORS_ORIGINS。
 *
 * 三个已知坑（来自 references/mobile-redesign-and-cdp-e2e.md）：
 *   - 必须连 /json/list 里的 page target，/json/version 没有 Runtime/Page 域
 *   - 脚本必须落在项目目录里再 node 运行（git-bash 的 /tmp 对 Windows node 无效）
 *   - 可见性用 el.offsetParent，不要用子元素自己的 computed display
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9444;
const BASE = process.env.BASE_URL || "http://localhost:47820";
const OUT = process.env.OUT_DIR || "C:/Users/fayypp/AppData/Local/hermes/cache/scratch/osrm-light";
mkdirSync(OUT, { recursive: true });

/** 断言失败项：非空则退出码 1 */
const failures = [];

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/fayypp/AppData/Local/Temp/cdp-light-theme",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 中途抛错也不能残留 headless chrome
process.on("exit", () => { try { chrome.kill(); } catch { /* ignore */ } });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { await sleep(300); }
  }
  throw new Error("CDP page target not ready");
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) { c.pending.get(msg.id)(msg); c.pending.delete(msg.id); }
    };
    return c;
  }
  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const cdp = await CDP.connect(await getWsUrl());
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

const evalJs = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

async function shot(name) {
  const m = await cdp.send("Page.getLayoutMetrics");
  const size = m.result.cssContentSize || m.result.contentSize;
  const r = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
  });
  const p = `${OUT}/${name}.png`;
  writeFileSync(p, Buffer.from(r.result.data, "base64"));
  return { path: p, w: Math.ceil(size.width), h: Math.ceil(size.height) };
}

async function setViewport(width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
}

async function clickAt(x, y) {
  const base = { x, y, button: "left", clickCount: 1 };
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
}

const summary = { base: BASE, sections: {}, shots: [], overflow: {}, quote: {} };

// ─────────────── 桌面整页 ───────────────
await setViewport(1440, 900, false);
await cdp.send("Page.navigate", { url: BASE + "/" });
await sleep(6000);

summary.sections = JSON.parse(await evalJs(`(() => {
  const rows = [...document.querySelectorAll('section, footer')].map((s) => {
    const cs = getComputedStyle(s);
    return { id: s.id || s.tagName.toLowerCase(), bg: cs.backgroundColor,
             bgImage: cs.backgroundImage.slice(0, 60),
             h: Math.round(s.getBoundingClientRect().height) };
  });
  const card = document.querySelector('#quote > div');
  return JSON.stringify({
    pageBg: getComputedStyle(document.body).backgroundColor,
    tokens: ['--surface-50','--surface-100','--navy','--blue','--cyan'].map(k => k + '=' + getComputedStyle(document.documentElement).getPropertyValue(k).trim()),
    quoteCard: card ? { bg: getComputedStyle(card).backgroundColor, border: getComputedStyle(card).borderColor } : null,
    themeMeta: (document.querySelector('meta[name="theme-color"]')||{}).content || null,
    rows,
    firstH1Color: getComputedStyle(document.querySelector('h1')).color,
    navBg: getComputedStyle(document.querySelector('header')).backgroundColor,
  });
})()`));
{
  // 深色满幅 section 检测：computed background-color 亮度 < 120 即判失败
  const dark = (summary.sections.rows || []).filter((r) => {
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(r.bg || "");
    if (!m) return false;                       // 渐变交由截图带扫描判定
    // ⚠️ 必须排除透明：rgba(0,0,0,0) 表示"不设底色、透出页面浅色"，按黑算会假报深色区
    const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (alpha < 0.5) return false;
    const [R, G, B] = [+m[1], +m[2], +m[3]];
    return 0.299 * R + 0.587 * G + 0.114 * B < 120;
  });
  summary.darkSections = dark;
  if (dark.length) failures.push(`存在深色满幅 section: ${JSON.stringify(dark)}`);
}
summary.shots.push(await shot("desktop-home-full"));
summary.overflow.desktop = await evalJs(`JSON.stringify({overflow: document.documentElement.scrollWidth - innerWidth, docH: document.documentElement.scrollHeight})`);
if (JSON.parse(summary.overflow.desktop).overflow !== 0) failures.push("桌面横向溢出");

// ─────────────── 报价功能真跑（桌面） ───────────────
const typeInto = (sel, val) => evalJs(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return 'no-el';
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);

// 起终点输入框 = #quote 里前两个 text input
const inputs = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll('#quote input[type=text]')].map((e,i)=>({i, ph:e.placeholder})))`));
summary.quote.inputs = inputs;

await typeInto("#quote input[type=text]", "友谊关");
// 轮询下拉出现（Render 冷启动可能 20-30s）
let drop = null;
for (let i = 0; i < 30; i++) {
  await sleep(2000);
  const raw = await evalJs(`(() => {
    const items = [...document.querySelectorAll('#quote button')].filter(b => b.textContent && b.textContent.length > 6 && b.offsetParent);
    const box = items[0] ? items[0].getBoundingClientRect() : null;
    return JSON.stringify(items.length ? { text: items[0].textContent.trim().slice(0,60), x: box.x + box.width/2, y: box.y + box.height/2, n: items.length } : null);
  })()`);
  drop = raw ? JSON.parse(raw) : null;
  if (drop) break;
}
summary.quote.geocodeDropdown = drop;

if (!drop) failures.push("地理编码下拉未出现（后端冷启动？或端口不在 CORS 白名单）—— 报价段未验证");
if (drop) {
  await clickAt(drop.x, drop.y);
  await sleep(1500);

  // 目的地：必须写进第 2 个输入框，并只点它自己那个下拉里的项
  // （第一版脚本把「河内」打进起运地框 → 起运地被改写成河内、目的地永远未解析，报价拿不到结果）
  await evalJs(`(() => {
    const el = document.querySelectorAll('#quote input[type=text]')[1];
    if (!el) return 'no-2nd';
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '河内'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok';
  })()`);
  let destPick = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const ok = await evalJs(`(() => {
      const inp = document.querySelectorAll('#quote input[type=text]')[1];
      if (!inp) return null;
      // 每个 AddressPicker 的 structure: div.relative > label + input + div.absolute(下拉)
      const box = inp.parentElement.querySelector('div.absolute button');
      if (!box) return null;
      const r = box.getBoundingClientRect();
      return JSON.stringify({ text: box.textContent.trim().slice(0,60), x: r.x + r.width/2, y: r.y + r.height/2 });
    })()`);
    if (ok) { destPick = JSON.parse(ok); await clickAt(destPick.x, destPick.y); summary.quote.dest = destPick.text; break; }
  }
  summary.quote.destPick = destPick;
  await sleep(1500);
  // 吨位
  await evalJs(`(() => {
    const el = document.querySelector('#quote input[type=number]');
    if (!el) return 'no-num';
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '18'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok';
  })()`);
  await sleep(500);
  // 点「计算运费」按钮 —— 必须精确匹配，不能用 /报价/ 模糊匹配
  // （模糊匹配会先命中 tab 栏的「在线报价」按钮，实测踩过）
  const btn = JSON.parse(await evalJs(`(() => {
    const b = [...document.querySelectorAll('#quote button')]
      .filter(x => /^(计算运费|计算|估算|Calculate|Tính)/.test((x.textContent||'').trim()))[0];
    if (!b) return 'null';
    const r = b.getBoundingClientRect();
    return JSON.stringify({ text: b.textContent.trim().slice(0,40), x: r.x + r.width/2, y: r.y + r.height/2 });
  })()`) || "null");
  summary.quote.submitBtn = btn;
  summary.quote.inputValues = await evalJs(`JSON.stringify([...document.querySelectorAll('#quote input[type=text]')].map(e=>e.value))`);
  if (btn && btn.text !== undefined) {
    await clickAt(btn.x, btn.y);
    for (let i = 0; i < 25; i++) {
      await sleep(2000);
      const res = await evalJs(`(() => {
        const t = document.querySelector('#quote') ? document.querySelector('#quote').innerText : '';
        const m = t.match(/[\\d.,]{5,}\\s*(VND|₫|đ)/i);
        return m ? m[0] : null;
      })()`);
      if (res) { summary.quote.result = res; break; }
    }
    summary.quote.resultText = await evalJs(`document.querySelector('#quote').innerText.replace(/\\n+/g,' | ').slice(0,400)`);
    summary.shots.push(await shot("desktop-quote-result"));
  }
  if (!summary.quote.result) failures.push("首页报价未返回越南盾结果");
  const vals = JSON.parse(summary.quote.inputValues || "[]");
  if (vals.length < 2 || !vals[0] || !vals[1]) failures.push(`起终点未双选成功: ${JSON.stringify(vals)}`);
}

// ─────────────── 移动端整页 ───────────────
await setViewport(420, 900, true);
await cdp.send("Page.navigate", { url: BASE + "/" });
await sleep(6000);
summary.shots.push(await shot("mobile-home-full"));
summary.overflow.mobile = await evalJs(`JSON.stringify({overflow: document.documentElement.scrollWidth - innerWidth, docH: document.documentElement.scrollHeight, fab: !!document.querySelector('button[aria-label]')})`);

if (JSON.parse(summary.overflow.mobile).overflow !== 0) failures.push("移动端横向溢出");

summary.failures = failures;
console.log(JSON.stringify(summary, null, 1));
console.log(failures.length ? `\n❌ 验收失败 ${failures.length} 项:\n - ` + failures.join("\n - ") : "\n✅ 全部断言通过");
process.exit(failures.length ? 1 : 0);
