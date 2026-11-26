import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'Tasks', 'harness', 'out', 'bh-after.json');

function tryResolveFile(basePath) {
  for (const cand of [
    basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.mjs`,
    path.join(basePath, 'index.ts'), path.join(basePath, 'index.js'),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return pathToFileURL(cand).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const hit = tryResolveFile(path.join(ROOT, specifier.slice(2)));
      if (hit) return { url: hit, shortCircuit: true };
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const hit = tryResolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
      if (hit) return { url: hit, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { resetFixtureStore, fixtureGetDefinitions, fixtureGetState } = await import('../../lib/api/fixtures.ts');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.TEMP, 'tenet-pw', 'node_modules', 'playwright-core'));

const PORT = 3113;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const INIT_SCRIPT = `
(() => {
  const H = { webglContextCount: 0, rendererInfo: null, firstCanvasPaintMs: null, totalDraws: 0 };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const ctx = origGetContext.call(this, type, attrs);
    if (ctx && (type === 'webgl2' || type === 'webgl')) {
      H.webglContextCount++;
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      H.rendererInfo = {
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext,
        renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
      };
      const mark = () => {
        H.totalDraws++;
        if (H.firstCanvasPaintMs === null) H.firstCanvasPaintMs = performance.now();
      };
      const origDa = ctx.drawArrays.bind(ctx);
      ctx.drawArrays = (m, f, c) => { mark(); return origDa(m, f, c); };
      const origDe = ctx.drawElements.bind(ctx);
      ctx.drawElements = (m, c, t, o) => { mark(); return origDe(m, c, t, o); };
      if (ctx.drawElementsInstanced) {
        const origDei = ctx.drawElementsInstanced.bind(ctx);
        ctx.drawElementsInstanced = (m, c, t, o, p) => { mark(); return origDei(m, c, t, o, p); };
      }
    }
    return ctx;
  };
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => origRaf((t) => { H.rafTicks++; cb(t); });

  H.sampleFrames = (durationMs) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;
    const step = (now) => {
      const dt = now - last;
      last = now;
      if (deltas.length > 0 || dt < 250) deltas.push(dt);
      if (now - start < durationMs) origRaf(step);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const pct = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
        const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
        resolve({
          frames: deltas.length,
          meanMs: Number(mean.toFixed(2)),
          p50Ms: Number(pct(0.5).toFixed(2)),
          p95Ms: Number(pct(0.95).toFixed(2)),
          p99Ms: Number(pct(0.99).toFixed(2)),
          maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
          over50Ms: deltas.filter((d) => d > 50).length,
          info: window.__TENET_BH__ ? window.__TENET_BH__.getInfo() : null,
        });
      }
    };
    origRaf((t0) => { last = t0; origRaf(step); });
  });
  window.__BH_AFTER__ = H;
})();
`;

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/icon.svg`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server timeout');
}

async function attachFixtureRoutes(context) {
  await context.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/definitions') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureGetDefinitions()) });
    }
    if (req.method() === 'GET' && url.pathname === '/api/state') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureGetState(url.searchParams.get('from') || undefined, url.searchParams.get('to') || undefined)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

const serverProc = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
  { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' },
);

let browser;
try {
  await waitForServer(BASE_URL, 20000);
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    args: [
      '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--window-position=-2400,-2400', '--window-size=1440,900',
    ],
  });

  // 1. Desktop intro phases, forkSteady, forkDive, per-tier T0..T3 + VRAM + console errors
  resetFixtureStore();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT_SCRIPT);
  await attachFixtureRoutes(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`${BASE_URL}/?fixture=1`, { waitUntil: 'domcontentloaded' });
  const introStart = await page.evaluate(() => window.__BH_AFTER__.sampleFrames(1300));
  const introMid = await page.evaluate(() => window.__BH_AFTER__.sampleFrames(1500));
  const introEnd = await page.evaluate(() => window.__BH_AFTER__.sampleFrames(1400));
  await page.waitForTimeout(500);
  const forkSteady = await page.evaluate(() => window.__BH_AFTER__.sampleFrames(2200));

  const tierSteady = {};
  const vramMb = {};
  for (const t of [0, 1, 2, 3]) {
    await page.evaluate(async (tier) => { await window.__TENET_BH__?.setTier(tier); }, t);
    await page.waitForTimeout(700);
    tierSteady[`T${t}`] = await page.evaluate(() => window.__BH_AFTER__.sampleFrames(1500));
    vramMb[`T${t}`] = await page.evaluate(() => Number((window.__TENET_BH__?.getVramMb() ?? 0).toFixed(1)));
  }

  // Hidden-tab zero-draw verification
  const hiddenDraws = await page.evaluate(async () => {
    const start = window.__BH_AFTER__.totalDraws;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 450));
    const diff = window.__BH_AFTER__.totalDraws - start;
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return diff;
  });

  // Re-measure forkDive after returning to fork route
  await page.evaluate(async () => {
    await window.__TENET_BH__?.setTier(1);
  });
  const diveP = page.evaluate(() => window.__BH_AFTER__.sampleFrames(1400));
  const enterLink = page.locator('main a[href="/log"] >> visible=true').first();
  if ((await enterLink.count()) > 0) await enterLink.click();
  const forkDive = await diveP;

  const desktopMeta = await page.evaluate(() => ({
    renderer: window.__BH_AFTER__.rendererInfo,
    webglContexts: window.__BH_AFTER__.webglContextCount,
    firstCanvasPaintMs: Number((window.__BH_AFTER__.firstCanvasPaintMs ?? 0).toFixed(1)),
  }));
  await ctx.close();

  // 2. Low power mode
  resetFixtureStore();
  const ctxLp = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctxLp.addInitScript(() => {
    try { localStorage.setItem('tenet.lowPower', '1'); } catch {}
  });
  await ctxLp.addInitScript(INIT_SCRIPT);
  await attachFixtureRoutes(ctxLp);
  const pageLp = await ctxLp.newPage();
  await pageLp.goto(`${BASE_URL}/?fixture=1`, { waitUntil: 'networkidle' });
  await pageLp.waitForTimeout(500);
  const lowPowerSteady = await pageLp.evaluate(() => window.__BH_AFTER__.sampleFrames(2000));
  await ctxLp.close();

  // 3. CPU 6x throttle
  resetFixtureStore();
  const ctxCpu = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctxCpu.addInitScript(INIT_SCRIPT);
  await attachFixtureRoutes(ctxCpu);
  const pageCpu = await ctxCpu.newPage();
  const cdp = await ctxCpu.newCDPSession(pageCpu);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await pageCpu.goto(`${BASE_URL}/?fixture=1`, { waitUntil: 'domcontentloaded' });
  const cpu6xIntro = await pageCpu.evaluate(() => window.__BH_AFTER__.sampleFrames(2600));
  await pageCpu.waitForTimeout(1000);
  const cpu6xSteady = await pageCpu.evaluate(() => window.__BH_AFTER__.sampleFrames(2500));
  await ctxCpu.close();

  const out = {
    timestamp: new Date().toISOString(),
    desktopMeta,
    hiddenDraws,
    vramMb,
    errors,
    phases: { introStart, introMid, introEnd, forkSteady, forkDive, lowPowerSteady },
    tierSteady,
    cpu6x: { cpu6xIntro, cpu6xSteady },
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log('SAVED_AFTER:', OUT_FILE);
  console.log(JSON.stringify(out, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  serverProc.kill();
}
