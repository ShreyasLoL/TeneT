import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBootstrapAssets } from './bootstrapAssets';
import { parseBhl1Buffer } from './lutLoader';

describe('black hole BHL1 LUT parser & bootstrap assets', () => {
  it('parses baked binary LUT headers from public/bh/', () => {
    const defBuf = fs.readFileSync(path.join(process.cwd(), 'public/bh/deflection_lut.bin'));
    const ab = defBuf.buffer.slice(defBuf.byteOffset, defBuf.byteOffset + defBuf.byteLength);
    const parsed = parseBhl1Buffer(ab);
    expect(parsed.w).toBe(2048);
    expect(parsed.h).toBe(1);
    expect(parsed.channels).toBe(4);
    expect(parsed.byteLength).toBe(2048 * 4 * 2);

    const trBuf = fs.readFileSync(path.join(process.cwd(), 'public/bh/transfer_lut.bin'));
    const trAb = trBuf.buffer.slice(trBuf.byteOffset, trBuf.byteOffset + trBuf.byteLength);
    const parsedTr = parseBhl1Buffer(trAb);
    expect(parsedTr.w).toBe(256);
    expect(parsedTr.h).toBe(256);
    expect(parsedTr.d).toBe(5);
    expect(parsedTr.channels).toBe(2);
  });

  it('creates instant bootstrap assets with valid sizes', () => {
    const assets = createBootstrapAssets();
    expect(assets.isBootstrap).toBe(true);
    expect(assets.brightStars.length).toBe(2048 * 5);
    expect(assets.particlesInit.length).toBe(8192 * 4);
  });
});
