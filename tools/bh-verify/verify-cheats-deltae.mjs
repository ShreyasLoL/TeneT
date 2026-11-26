import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT, 'Tasks', 'harness', 'out', 'bh-deltae.json');

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

const PORT = 3112;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

const serverProc = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
  { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'pipe' },
);

// Runs inside browser page for fast pixel-level CIEDE2000, Doppler asymmetry, and Orchid share
const INPAGE_METRICS = `
window.__BH_DELTA_E__ = (() => {
  const tmpCanvas = document.createElement('canvas');
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

  function grabPixels(scaleW = 360, scaleH = 225) {
    const glCanvas = document.querySelector('canvas');
    tmpCanvas.width = scaleW;
    tmpCanvas.height = scaleH;
    tmpCtx.drawImage(glCanvas, 0, 0, scaleW, scaleH);
    return tmpCtx.getImageData(0, 0, scaleW, scaleH).data;
  }

  function srgbToLab(r8, g8, b8) {
    const lin = (c) => {
      const u = c / 255;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    const r = lin(r8), g = lin(g8), b = lin(b8);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
    const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const avgL = 0.5 * (L1 + L2);
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const avgC = 0.5 * (C1 + C2);
    const avgC7 = Math.pow(avgC, 7);
    const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const hAngle = (b, ap) => (Math.abs(ap) < 1e-6 && Math.abs(b) < 1e-6) ? 0 : ((Math.atan2(b, ap) * 180 / Math.PI) + 360) % 360;
    const h1p = hAngle(b1, a1p);
    const h2p = hAngle(b2, a2p);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p > 1e-6) {
      let d = h2p - h1p;
      if (d > 180) d -= 360;
      else if (d < -180) d += 360;
      dhp = d;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
    const avgLp = avgL;
    const avgCp = 0.5 * (C1p + C2p);
    let avghp = h1p + h2p;
    if (C1p * C2p > 1e-6) {
      if (Math.abs(h1p - h2p) > 180) avghp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) * 0.5;
      else avghp *= 0.5;
    }
    const T = 1 - 0.17 * Math.cos(((avghp - 30) * Math.PI) / 180)
              + 0.24 * Math.cos((2 * avghp * Math.PI) / 180)
              + 0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180)
              - 0.20 * Math.cos(((4 * avghp - 63) * Math.PI) / 180);
    const dTheta = 30 * Math.exp(-Math.pow((avghp - 275) / 25, 2));
    const avgCp7 = Math.pow(avgCp, 7);
    const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + Math.pow(25, 7)));
    const L50 = Math.pow(avgLp - 50, 2);
    const SL = 1 + (0.015 * L50) / Math.sqrt(20 + L50);
    const SC = 1 + 0.045 * avgCp;
    const SH = 1 + 0.015 * avgCp * T;
    const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;
    return Math.sqrt(
      Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + RT * (dCp / SC) * (dHp / SH)
    );
  }

  function compareBuffers(bufA, bufB) {
    let sum = 0, max = 0;
    const vals = [];
    const n = bufA.length / 4;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const de = ciede2000(
        srgbToLab(bufA[o], bufA[o + 1], bufA[o + 2]),
        srgbToLab(bufB[o], bufB[o + 1], bufB[o + 2])
      );
      sum += de;
      if (de > max) max = de;
      vals.push(de);
    }
    vals.sort((a, b) => a - b);
    return {
      meanDeltaE: Number((sum / n).toFixed(3)),
      p95DeltaE: Number(vals[Math.floor(n * 0.95)].toFixed(3)),
      maxDeltaE: Number(max.toFixed(3)),
    };
  }

  function analyzeFrame(buf, w = 360, h = 225) {
    let leftLin = 0, rightLin = 0, leftSrgb = 0, rightSrgb = 0, orchidPixels = 0;
    const total = w * h;
    const srgbToLin = (v) => {
      const u = v / 255;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const r = buf[o], g = buf[o + 1], b = buf[o + 2];
        const lumSrgb = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const lumLin = 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
        // Inner accretion disk equatorial lobes (y in [0.44..0.56], left/right flanks of shadow)
        if (y >= h * 0.44 && y <= h * 0.56) {
          if (x >= w * 0.35 && x <= w * 0.46) { leftLin += lumLin; leftSrgb += lumSrgb; }
          if (x >= w * 0.54 && x <= w * 0.65) { rightLin += lumLin; rightSrgb += lumSrgb; }
        }
        // Orchid (#E04DEA) signature: strong R & B, depressed G, clear brightness
        if (r > 130 && b > 140 && g < Math.min(r, b) * 0.68) {
          orchidPixels++;
        }
      }
    }
    const maxLin = Math.max(leftLin, rightLin), minLin = Math.max(1e-5, Math.min(leftLin, rightLin));
    const maxSrgb = Math.max(leftSrgb, rightSrgb), minSrgb = Math.max(1e-3, Math.min(leftSrgb, rightSrgb));
    return {
      dopplerAsymmetryLinear: Number((maxLin / minLin).toFixed(2)),
      dopplerAsymmetrySrgb: Number((maxSrgb / minSrgb).toFixed(2)),
      orchidSharePct: Number(((orchidPixels / total) * 100).toFixed(3)),
    };
  }

  return { grabPixels, compareBuffers, analyzeFrame };
})();
`;

let browser;
try {
  await waitForServer(BASE_URL, 20000);
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    args: [
      '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
      '--window-position=-2400,-2400', '--window-size=1440,900',
    ],
  });

  resetFixtureStore();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INPAGE_METRICS);
  await ctx.route('**/api/**', async (route) => {
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

  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/?fixture=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__TENET_BH__), { timeout: 10000 });
  await page.waitForTimeout(2400);

  const results = {};
  for (const tier of [1, 2]) {
    await page.evaluate(async (t) => { await window.__TENET_BH__.setTier(t); }, tier);
    await page.waitForTimeout(600);
    results[`T${tier}`] = await page.evaluate(() => {
      const bh = window.__TENET_BH__;
      const m = window.__BH_DELTA_E__;
      bh.setSimTime(12.0);
      bh.setCameraPose(0, 3.897, 27.728, 0, 0, 0, 42);
      bh.setCheatsEnabled(false);
      bh.renderDeterministicFrames(8, 1 / 60);
      const refStatic = m.grabPixels();

      bh.setCheatsEnabled(true);
      bh.renderDeterministicFrames(10, 1 / 60);
      const cheatStatic = m.grabPixels();
      const staticDiff = m.compareBuffers(refStatic, cheatStatic);
      const frameStats = m.analyzeFrame(refStatic);

      bh.setSimTime(14.5);
      bh.setCameraPose(4.6, 2.2, 18.8, 0, 0, 0, 41);
      bh.setCheatsEnabled(false);
      bh.renderDeterministicFrames(8, 1 / 60);
      const refMotion = m.grabPixels();

      bh.setCheatsEnabled(true);
      bh.renderDeterministicFrames(10, 1 / 60);
      const cheatMotion = m.grabPixels();
      const motionDiff = m.compareBuffers(refMotion, cheatMotion);

      let maxSeqStepMean = 0;
      let prev = cheatMotion;
      for (let f = 0; f < 12; f++) {
        bh.renderDeterministicFrames(1, 1 / 60);
        const next = m.grabPixels();
        const stepDiff = m.compareBuffers(prev, next);
        if (stepDiff.meanDeltaE > maxSeqStepMean) maxSeqStepMean = stepDiff.meanDeltaE;
        prev = next;
      }

      return {
        static: staticDiff,
        midMotion: motionDiff,
        maxSeqStepMeanDeltaE: maxSeqStepMean,
        ...frameStats,
      };
    });
  }

  await ctx.close();
  fs.writeFileSync(OUT_FILE, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  serverProc.kill();
}
