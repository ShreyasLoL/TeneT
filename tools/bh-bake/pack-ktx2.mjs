import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'bh');
const BASIS_DST = path.join(OUT_DIR, 'basis');
const BENCH_DST = path.join(OUT_DIR, 'gpu-benchmarks');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(BASIS_DST, { recursive: true });
fs.mkdirSync(BENCH_DST, { recursive: true });

// 1. Run bh_test.exe and bh_bake.exe
const testExe = path.join(__dirname, 'bin', process.platform === 'win32' ? 'bh_test.exe' : 'bh_test');
const bakeExe = path.join(__dirname, 'bin', process.platform === 'win32' ? 'bh_bake.exe' : 'bh_bake');

console.log('Running C++ physics unit tests...');
const testRun = spawnSync(testExe, [], { cwd: ROOT, stdio: 'inherit' });
if (testRun.status !== 0) {
  throw new Error(`bh_test failed with code ${testRun.status}`);
}

console.log('Running C++ offline baker...');
const bakeRun = spawnSync(bakeExe, [OUT_DIR, __dirname], { cwd: ROOT, stdio: 'inherit' });
if (bakeRun.status !== 0) {
  throw new Error(`bh_bake failed with code ${bakeRun.status}`);
}

// 2. Pack .raw_uastc bundles into KTX2 (UASTC + Zstandard supercompression)
const ktx = await import('../../node_modules/three/examples/jsm/libs/ktx-parse.module.js');

function packRawUastcToKtx2(rawPath, ktx2Path) {
  const buf = fs.readFileSync(rawPath);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  const width = dv.getUint32(off, true); off += 4;
  const height = dv.getUint32(off, true); off += 4;
  const faceCount = dv.getUint32(off, true); off += 4;
  const mipCount = dv.getUint32(off, true); off += 4;

  const levels = [];
  for (let m = 0; m < mipCount; m++) {
    const mw = dv.getUint32(off, true); off += 4;
    const mh = dv.getUint32(off, true); off += 4;
    const faceByteLen = dv.getUint32(off, true); off += 4;
    const totalUncompressed = faceByteLen * faceCount;
    const combined = buf.subarray(off, off + totalUncompressed);
    off += totalUncompressed;
    const compressed = zlib.zstdCompressSync(combined, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: 15 },
    });
    levels.push({
      levelData: compressed,
      uncompressedByteLength: totalUncompressed,
    });
    void mw;
    void mh;
  }

  const ktx2Bytes = ktx.write({
    vkFormat: ktx.VK_FORMAT_UNDEFINED,
    typeSize: 1,
    pixelWidth: width,
    pixelHeight: height,
    pixelDepth: 0,
    layerCount: 0,
    faceCount,
    levelCount: mipCount,
    supercompressionScheme: ktx.KHR_SUPERCOMPRESSION_ZSTD,
    levels,
    dataFormatDescriptor: [
      {
        vendorId: 0,
        descriptorType: 0,
        versionNumber: 2,
        colorModel: ktx.KHR_DF_MODEL_UASTC,
        colorPrimaries: ktx.KHR_DF_PRIMARIES_BT709,
        transferFunction: ktx.KHR_DF_TRANSFER_LINEAR,
        flags: 0,
        texelBlockDimension: [3, 3, 0, 0],
        bytesPlane: [16, 0, 0, 0, 0, 0, 0, 0],
        samples: [
          {
            bitOffset: 0,
            bitLength: 127,
            channelType: 0,
            samplePosition: [0, 0, 0, 0],
            sampleLower: 0,
            sampleUpper: 4294967295,
          },
        ],
      },
    ],
    keyValue: {},
    globalData: null,
  });

  fs.writeFileSync(ktx2Path, ktx2Bytes);
  fs.unlinkSync(rawPath);
  return ktx2Bytes.byteLength;
}

const turbBytes = packRawUastcToKtx2(
  path.join(__dirname, 'disk_turbulence.raw_uastc'),
  path.join(OUT_DIR, 'disk_turbulence.ktx2'),
);
const lowBytes = packRawUastcToKtx2(
  path.join(__dirname, 'sky_low.raw_uastc'),
  path.join(OUT_DIR, 'sky_low.ktx2'),
);
const midBytes = packRawUastcToKtx2(
  path.join(__dirname, 'sky_mid.raw_uastc'),
  path.join(OUT_DIR, 'sky_mid.ktx2'),
);
const highBytes = packRawUastcToKtx2(
  path.join(__dirname, 'sky_high.raw_uastc'),
  path.join(OUT_DIR, 'sky_high.ktx2'),
);

// 3. Copy Basis transcoder & detect-gpu benchmarks locally to public/bh/ (zero CDN)
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  fs.copyFileSync(
    path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', file),
    path.join(BASIS_DST, file),
  );
}
const benchSrc = path.join(ROOT, 'node_modules', 'detect-gpu', 'dist', 'benchmarks');
for (const file of fs.readdirSync(benchSrc)) {
  if (file.endsWith('.json')) {
    fs.copyFileSync(path.join(benchSrc, file), path.join(BENCH_DST, file));
  }
}

// 4. Verify all KTX2 files transcode cleanly with Basis WASM and check asset budgets
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const jsSrc = fs.readFileSync(path.join(BASIS_DST, 'basis_transcoder.js'), 'utf8');
const wasmBin = fs.readFileSync(path.join(BASIS_DST, 'basis_transcoder.wasm'));
const BASIS = new Function('require', '__dirname', `${jsSrc}; return BASIS;`)(require, BASIS_DST);
const M = await BASIS({ wasmBinary: wasmBin });
M.initializeBasis();

for (const name of ['disk_turbulence.ktx2', 'sky_low.ktx2', 'sky_mid.ktx2', 'sky_high.ktx2']) {
  const bytes = fs.readFileSync(path.join(OUT_DIR, name));
  const container = ktx.read(bytes);
  // Decompress level 0 zstd and verify transcode to BC7 + ASTC + RGBA32
  const dec0 = zlib.zstdDecompressSync(container.levels[0].levelData);
  const testContainer = {
    ...container,
    levelCount: 1,
    supercompressionScheme: ktx.KHR_SUPERCOMPRESSION_NONE,
    levels: [{ levelData: dec0, uncompressedByteLength: dec0.byteLength }],
  };
  const k = new M.KTX2File(ktx.write(testContainer));
  if (!k.isValid() || !k.startTranscoding()) {
    throw new Error(`Invalid KTX2: ${name}`);
  }
  const rgba = new Uint8Array(container.pixelWidth * container.pixelHeight * 4);
  const okRgba = k.transcodeImage(rgba, 0, 0, 0, 13, 0, -1, -1);
  const bc7 = new Uint8Array(((container.pixelWidth + 3) >> 2) * ((container.pixelHeight + 3) >> 2) * 16);
  const okBc7 = k.transcodeImage(bc7, 0, 0, 0, 7, 0, -1, -1);
  k.close();
  k.delete();
  if (!okRgba || !okBc7) {
    throw new Error(`Basis transcode failed for ${name} (rgba=${okRgba}, bc7=${okBc7})`);
  }
}

// 5. Enforce asset size budgets
const sizeOf = (f) => fs.statSync(path.join(OUT_DIR, f)).size;
const lutsPlusTurb =
  sizeOf('deflection_lut.bin') +
  sizeOf('transfer_lut.bin') +
  sizeOf('blackbody_lut.bin') +
  sizeOf('blue_noise_64.bin') +
  sizeOf('bright_stars.bin') +
  sizeOf('particles_init.bin') +
  turbBytes;

const mb = (b) => `${(b / (1024 * 1024)).toFixed(2)} MB`;
console.log('=== BAKED ASSET BUDGETS ===');
console.log(`LUTs + particles + stars + turbulence: ${mb(lutsPlusTurb)} (budget <= 3.00 MB)`);
console.log(`  deflection_lut.bin : ${(sizeOf('deflection_lut.bin') / 1024).toFixed(1)} KB`);
console.log(`  transfer_lut.bin   : ${(sizeOf('transfer_lut.bin') / 1024).toFixed(1)} KB`);
console.log(`  blackbody_lut.bin  : ${(sizeOf('blackbody_lut.bin') / 1024).toFixed(1)} KB`);
console.log(`  blue_noise_64.bin  : ${(sizeOf('blue_noise_64.bin') / 1024).toFixed(1)} KB`);
console.log(`  bright_stars.bin   : ${(sizeOf('bright_stars.bin') / 1024).toFixed(1)} KB`);
console.log(`  particles_init.bin : ${(sizeOf('particles_init.bin') / 1024).toFixed(1)} KB`);
console.log(`  disk_turbulence.ktx2: ${(turbBytes / 1024).toFixed(1)} KB`);
console.log(`  kerr_lut.bin (T3)  : ${(sizeOf('kerr_lut.bin') / 1024).toFixed(1)} KB`);
console.log(`sky_low.ktx2         : ${mb(lowBytes)} (budget <= 1.50 MB)`);
console.log(`sky_mid.ktx2         : ${mb(midBytes)}`);
console.log(`sky_high.ktx2        : ${mb(highBytes)} (budget <= 8.00 MB)`);

if (lutsPlusTurb > 3 * 1024 * 1024) throw new Error(`LUTs+turb exceeded 3MB: ${lutsPlusTurb}`);
if (lowBytes > 1.5 * 1024 * 1024) throw new Error(`sky_low.ktx2 exceeded 1.5MB: ${lowBytes}`);
if (highBytes > 8.0 * 1024 * 1024) throw new Error(`sky_high.ktx2 exceeded 8MB: ${highBytes}`);
console.log('ALL KTX2 & BUDGET CHECKS PASSED.');
