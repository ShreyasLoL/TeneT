import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const {
  BH_LUT_DIMS,
  BH_M,
  BH_SHADOW_RADIUS_BC,
  bToLutU,
} = await import('../../stage/blackhole/constants.ts');
const { parseBhl1Buffer } = await import('../../stage/blackhole/lutLoader.ts');

function halfToFloat(h) {
  const s = (h & 0x8000) << 16;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x03ff;
  let bits;
  if (e === 0) {
    if (m === 0) bits = s;
    else {
      let exp = 1;
      let mant = m;
      while ((mant & 0x0400) === 0) {
        mant <<= 1;
        exp--;
      }
      mant &= 0x03ff;
      bits = s | ((exp + 127 - 15) << 23) | (mant << 13);
    }
  } else if (e === 31) {
    bits = s | 0x7f800000 | (m << 13);
  } else {
    bits = s | ((e + 127 - 15) << 23) | (m << 13);
  }
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, bits, true);
  return new DataView(buf).getFloat32(0, true);
}

function loadLutHalf(relPath) {
  const b = fs.readFileSync(path.join(ROOT, relPath));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const parsed = parseBhl1Buffer(ab);
  const u16 = new Uint16Array(parsed.payload, parsed.byteOffset, parsed.byteLength / 2);
  const f32 = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) f32[i] = halfToFloat(u16[i]);
  return { ...parsed, data: f32 };
}

const defl = loadLutHalf('public/bh/deflection_lut.bin');
const trans = loadLutHalf('public/bh/transfer_lut.bin');

function sampleDefl(b) {
  const u = Math.max(0, Math.min(1, bToLutU(b)));
  const fx = u * defl.w - 0.5;
  const i0 = Math.max(0, Math.min(defl.w - 1, Math.floor(fx)));
  const i1 = Math.max(0, Math.min(defl.w - 1, i0 + 1));
  const t = Math.max(0, Math.min(1, fx - i0));
  return {
    phiInf: defl.data[i0 * 4 + 0] * (1 - t) + defl.data[i1 * 4 + 0] * t,
    alpha: defl.data[i0 * 4 + 1] * (1 - t) + defl.data[i1 * 4 + 1] * t,
    escaped: defl.data[i0 * 4 + 2] * (1 - t) + defl.data[i1 * 4 + 2] * t,
  };
}

function sampleTransferU(b, phi, rObs) {
  const uB = Math.max(0, Math.min(1, bToLutU(b)));
  const uP = Math.max(0, Math.min(1, phi / BH_LUT_DIMS.phiMax));
  const radii = BH_LUT_DIMS.observerRadii;
  let sliceIdx = 0;
  let sliceT = 0;
  for (let i = 0; i < radii.length - 1; i++) {
    if (rObs <= radii[i + 1] || i === radii.length - 2) {
      sliceIdx = i;
      sliceT = Math.max(0, Math.min(1, (rObs - radii[i]) / (radii[i + 1] - radii[i])));
      break;
    }
  }
  const fx = Math.max(0, Math.min(trans.w - 1, uB * trans.w - 0.5));
  const fy = Math.max(0, Math.min(trans.h - 1, uP * trans.h - 0.5));
  const x0 = Math.floor(fx), x1 = Math.min(trans.w - 1, x0 + 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(trans.h - 1, y0 + 1), ty = fy - y0;

  const at = (s, x, y) => trans.data[((s * trans.h + y) * trans.w + x) * 2];
  const interpSlice = (s) => {
    const v00 = at(s, x0, y0);
    const v10 = at(s, x1, y0);
    const v01 = at(s, x0, y1);
    const v11 = at(s, x1, y1);
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  };
  return interpSlice(sliceIdx) * (1 - sliceT) + interpSlice(sliceIdx + 1) * sliceT;
}

// Deterministic PRNG for 1500 random rays covering capture, photon ring, disk, and weak field
let seed = 123456789;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const rays = [];
const lines = [];
for (let i = 0; i < 1500; i++) {
  const regime = i % 4;
  let b;
  if (regime === 0) b = 0.2 + rand() * (BH_SHADOW_RADIUS_BC - 0.25); // capture
  else if (regime === 1) b = BH_SHADOW_RADIUS_BC + 0.03 + rand() * 3.5; // strong-field
  else if (regime === 2) b = 6.0 + rand() * 11.0; // disk outer
  else b = 17.0 + rand() * 44.0; // weak-field

  const rObs = BH_LUT_DIMS.observerRadii[i % BH_LUT_DIMS.observerRadii.length];
  const phi0 = 0.25 + rand() * 2.5;
  const phi1 = phi0 + Math.PI;
  const phi2 = phi0 + 2 * Math.PI;
  rays.push({ b, rObs, phi0, phi1, phi2, regime });
  lines.push(`${b.toFixed(6)} ${rObs.toFixed(4)} ${BH_LUT_DIMS.phiMax.toFixed(6)} ${phi0.toFixed(6)} ${phi1.toFixed(6)} ${phi2.toFixed(6)}`);
}

const bakeExe = path.join(ROOT, 'tools', 'bh-bake', 'bin', process.platform === 'win32' ? 'bh_bake.exe' : 'bh_bake');
const res = spawnSync(bakeExe, ['--eval-rays'], {
  input: lines.join('\n') + '\n',
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (res.status !== 0) throw new Error(`bh_bake --eval-rays failed: ${res.stderr}`);

const outLines = res.stdout.trim().split(/\r?\n/);
let captureMatches = 0;
let maxDeflErr = 0;
const diskErrs = [];

for (let i = 0; i < rays.length; i++) {
  const [escStr, , deflRefStr, u0RefStr, u1RefStr] = outLines[i].trim().split(/\s+/);
  const escRef = Number(escStr) === 1;
  const deflRef = Number(deflRefStr);
  const u0Ref = Number(u0RefStr);
  const u1Ref = Number(u1RefStr);

  const { b, rObs, phi0, phi1 } = rays[i];
  const lutD = sampleDefl(b);
  const lutEsc = lutD.escaped > 0.5;
  if (lutEsc === escRef) captureMatches++;

  if (b > 15.5 && escRef) {
    const mb = BH_M / b;
    const wf = 4 * mb + (15 * Math.PI / 4) * mb * mb + (128 / 3) * mb * mb * mb;
    const err = Math.abs(lutD.alpha - wf);
    if (err > maxDeflErr) maxDeflErr = err;
  }

  for (const [phi, uRef] of [[phi0, u0Ref], [phi1, u1Ref]]) {
    if (uRef > 0.05 && uRef < 0.34) {
      // Valid disk crossing region r in (3..20)
      const uLut = sampleTransferU(b, phi, rObs);
      diskErrs.push(Math.abs(uLut - uRef) / uRef);
    }
  }
}

diskErrs.sort((a, b) => a - b);
const p95DiskErr = diskErrs[Math.floor(diskErrs.length * 0.95)] ?? 0;
const meanDiskErr = diskErrs.reduce((a, b) => a + b, 0) / Math.max(1, diskErrs.length);
const captureAcc = captureMatches / rays.length;

console.log(JSON.stringify({
  raysTested: rays.length,
  captureAgreement: Number(captureAcc.toFixed(4)),
  weakFieldMaxAlphaErr: Number(maxDeflErr.toExponential(3)),
  diskCrossingSamples: diskErrs.length,
  diskRelUErrMean: Number(meanDiskErr.toFixed(5)),
  diskRelUErrP95: Number(p95DiskErr.toFixed(5)),
}, null, 2));

if (captureAcc < 0.995) throw new Error(`Capture agreement too low: ${captureAcc}`);
if (maxDeflErr > 1e-3) throw new Error(`Weak-field error too high: ${maxDeflErr}`);
if (p95DiskErr > 0.025) throw new Error(`Disk crossing p95 rel error too high: ${p95DiskErr}`);
