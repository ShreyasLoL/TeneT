import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function tryResolveFile(basePath) {
  for (const cand of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return pathToFileURL(cand).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const hit = tryResolveFile(path.join(ROOT, specifier.slice(2)));
      if (hit) return { url: hit, shortCircuit: true };
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const hit = tryResolveFile(path.resolve(parentDir, specifier));
      if (hit) return { url: hit, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { resetFixtureStore, fixtureGetDefinitions, fixtureGetState, fixtureExecuteCommand } =
  await import('../../lib/api/fixtures.ts');

const require = createRequire(import.meta.url);
const pwPath = path.join(process.env.TEMP, 'tenet-pw', 'node_modules', 'playwright-core');
const { chromium } = require(pwPath);

const PORT = 3109;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_FILE = path.join(ROOT, 'Tasks', 'harness', 'out', 'bh-before.json');
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

const INIT_SCRIPT = `
(() => {
  if (window.__BH_BEFORE__) return;
  const H = {
    webglContextCount: 0,
    rendererInfo: null,
    shaderErrors: [],
    gpuResources: { buffers: 0, textures: 0, programs: 0, framebuffers: 0 },
    frameDraws: 0,
    frameTris: 0,
    lastCompletedDraws: 0,
    lastCompletedTris: 0,
    drawFlushScheduled: false,
  };
  function scheduleDrawFlush() {
    if (H.drawFlushScheduled) return;
    H.drawFlushScheduled = true;
    queueMicrotask(() => {
      setTimeout(() => {
        if (H.frameDraws > 0) {
          H.lastCompletedDraws = H.frameDraws;
          H.lastCompletedTris = H.frameTris;
          H.frameDraws = 0;
          H.frameTris = 0;
        }
        H.drawFlushScheduled = false;
      }, 0);
    });
  }
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const ctx = origGetContext.call(this, type, attrs);
    if (ctx && (type === 'webgl2' || type === 'webgl') && !ctx.__bhWrapped) {
      ctx.__bhWrapped = true;
      H.webglContextCount++;
      try {
        const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
        H.rendererInfo = {
          webgl2: type === 'webgl2',
          renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
        };
      } catch {}
      const wrapRes = (cFn, dFn, k) => {
        const oc = ctx[cFn]?.bind(ctx);
        const od = ctx[dFn]?.bind(ctx);
        if (oc) ctx[cFn] = (...a) => { H.gpuResources[k]++; return oc(...a); };
        if (od) ctx[dFn] = (...a) => { H.gpuResources[k] = Math.max(0, H.gpuResources[k] - 1); return od(...a); };
      };
      wrapRes('createBuffer', 'deleteBuffer', 'buffers');
      wrapRes('createTexture', 'deleteTexture', 'textures');
      wrapRes('createProgram', 'deleteProgram', 'programs');
      wrapRes('createFramebuffer', 'deleteFramebuffer', 'framebuffers');
      const countTris = (mode, count, inst = 1) => {
        if (mode === ctx.TRIANGLES) return Math.floor(count / 3) * inst;
        if (mode === ctx.TRIANGLE_STRIP || mode === ctx.TRIANGLE_FAN) return Math.max(0, count - 2) * inst;
        return 0;
      };
      const oda = ctx.drawArrays.bind(ctx);
      ctx.drawArrays = (m, f, c) => { H.frameDraws++; H.frameTris += countTris(m, c, 1); scheduleDrawFlush(); return oda(m, f, c); };
      const ode = ctx.drawElements.bind(ctx);
      ctx.drawElements = (m, c, t, o) => { H.frameDraws++; H.frameTris += countTris(m, c, 1); scheduleDrawFlush(); return ode(m, c, t, o); };
      if (ctx.drawArraysInstanced) {
        const odai = ctx.drawArraysInstanced.bind(ctx);
        ctx.drawArraysInstanced = (m, f, c, p) => { H.frameDraws++; H.frameTris += countTris(m, c, p); scheduleDrawFlush(); return odai(m, f, c, p); };
      }
      if (ctx.drawElementsInstanced) {
        const odei = ctx.drawElementsInstanced.bind(ctx);
        ctx.drawElementsInstanced = (m, c, t, o, p) => { H.frameDraws++; H.frameTris += countTris(m, c, p); scheduleDrawFlush(); return odei(m, c, t, o, p); };
      }
    }
    return ctx;
  };
  H.sampleFrames = (durationMs) => new Promise((resolve) => {
    const deltas = [];
    const draws = [];
    let last = performance.now();
    const start = last;
    const step = (now) => {
      const dt = now - last;
      last = now;
      if (deltas.length > 0 || dt < 250) {
        deltas.push(dt);
        draws.push(H.lastCompletedDraws);
      }
      if (now - start < durationMs) {
        requestAnimationFrame(step);
      } else {
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
          maxDraws: draws.length ? Math.max(...draws) : H.lastCompletedDraws,
        });
      }
    };
    requestAnimationFrame((t0) => { last = t0; requestAnimationFrame(step); });
  });
  window.__BH_BEFORE__ = H;
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
    if (req.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.abort();
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
      '--use-angle=d3d11',
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--window-position=-2400,-2400',
      '--window-size=1440,900',
    ],
  });

  // 1. Desktop phases: intro-start, intro-mid, intro-end, fork-steady, fork-dive
  resetFixtureStore();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT_SCRIPT);
  await attachFixtureRoutes(ctx);
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/?fixture=1`, { waitUntil: 'domcontentloaded' });
  const introStart = await page.evaluate(() => window.__BH_BEFORE__.sampleFrames(1300));
  const introMid = await page.evaluate(() => window.__BH_BEFORE__.sampleFrames(1500));
  const introEnd = await page.evaluate(() => window.__BH_BEFORE__.sampleFrames(1400));
  await page.waitForTimeout(400);
  const forkSteady = await page.evaluate(() => window.__BH_BEFORE__.sampleFrames(2500));
  const diveP = page.evaluate(() => window.__BH_BEFORE__.sampleFrames(1400));
  const enterLink = page.locator('main a[href="/log"] >> visible=true').first();
  if ((await enterLink.count()) > 0) await enterLink.click();
  const forkDive = await diveP;
  const resourcesDesktop = await page.evaluate(() => ({
    renderer: window.__BH_BEFORE__.rendererInfo,
    webglContexts: window.__BH_BEFORE__.webglContextCount,
    gpuResources: window.__BH_BEFORE__.gpuResources,
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
  const lowPowerSteady = await pageLp.evaluate(() => window.__BH_BEFORE__.sampleFrames(2000));
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
  const cpu6xIntro = await pageCpu.evaluate(() => window.__BH_BEFORE__.sampleFrames(3200));
  const cpu6xSteady = await pageCpu.evaluate(() => window.__BH_BEFORE__.sampleFrames(2500));
  await ctxCpu.close();

  const out = {
    timestamp: new Date().toISOString(),
    resourcesDesktop,
    phases: { introStart, introMid, introEnd, forkSteady, forkDive, lowPowerSteady },
    cpu6x: { cpu6xIntro, cpu6xSteady },
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log('SAVED_BEFORE:', OUT_FILE);
  console.log(JSON.stringify(out, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  serverProc.kill();
}
