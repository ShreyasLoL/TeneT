import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function listSourceFiles(dirRel: string): string[] {
  const out: string[] = [];
  const rootDir = path.join(ROOT, dirRel);
  if (!fs.existsSync(rootDir)) return out;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(rootDir);
  return out;
}

function extractUseFrameBodies(source: string): string[] {
  const bodies: string[] = [];
  let searchIdx = 0;
  while (true) {
    const idx = source.indexOf('useFrame(', searchIdx);
    if (idx === -1) break;
    const arrowIdx = source.indexOf('=>', idx);
    const braceStart = arrowIdx !== -1 ? source.indexOf('{', arrowIdx) : -1;
    if (braceStart === -1) {
      searchIdx = idx + 9;
      continue;
    }
    let depth = 1;
    let cursor = braceStart + 1;
    while (cursor < source.length && depth > 0) {
      const ch = source[cursor];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      cursor++;
    }
    bodies.push(source.slice(braceStart + 1, cursor - 1));
    searchIdx = cursor;
  }
  return bodies;
}

describe('codebase & hot-path invariants', () => {
  it('forbids per-frame allocations, array clones, and React setState inside useFrame', () => {
    const stageFiles = listSourceFiles('components/stage');
    const forbiddenPatterns = [
      /\bnew\s+(Vector|Matrix|Color|Quaternion|Euler|Ray|Plane|Sphere|Box|Float32Array|THREE\b)/,
      /\.(map|filter|reduce|findIndex|find)\s*\(/,
      /\b(setState|useTenetStore\.setState)\b/,
    ];

    for (const file of stageFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const bodies = extractUseFrameBodies(src);
      for (const body of bodies) {
        for (const pattern of forbiddenPatterns) {
          expect(
            pattern.test(body),
            `Forbidden hot-path pattern ${pattern} inside useFrame in ${path.relative(ROOT, file)}`,
          ).toBe(false);
        }
      }
    }
  });

  it('enforces copy voice law: zero exclamation marks and zero emojis in lib/copy.ts', () => {
    const copySrc = fs.readFileSync(path.join(ROOT, 'lib/copy.ts'), 'utf8');
    expect(copySrc.includes('!')).toBe(false);
    expect(/\p{Extended_Pictographic}/u.test(copySrc)).toBe(false);
  });

  it('enforces AGENTS.md Rule 1: zero hardcoded seed habit names in non-frozen app/components/lib code', () => {
    const dirs = ['app', 'components', 'lib/api', 'lib/stage', 'lib/store', 'lib/viz'];
    const addedDomainFiles = [
      path.join(ROOT, 'lib/domain/optimizer.ts'),
      path.join(ROOT, 'lib/domain/optimizerCore.ts'),
      path.join(ROOT, 'lib/domain/satisfiedOnFromDays.ts'),
      path.join(ROOT, 'lib/domain/validateValue.ts'),
    ];
    const seedWords = /\b(valorant|creatine|leetcode|bodyweight)\b/i;

    const files = [...dirs.flatMap((d) => listSourceFiles(d)), ...addedDomainFiles];
    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const src = fs.readFileSync(file, 'utf8');
      expect(
        seedWords.test(src),
        `Hardcoded seed word found in ${path.relative(ROOT, file)}`,
      ).toBe(false);
    }
  });

  it('keeps UI and 3D stage modules under 280 lines per single-responsibility rule', () => {
    for (const file of listSourceFiles('components')) {
      const lineCount = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
      expect(
        lineCount,
        `${path.relative(ROOT, file)} grew to ${lineCount} lines (> 280)`,
      ).toBeLessThanOrEqual(280);
    }
  });
});
