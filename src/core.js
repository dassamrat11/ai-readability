import { encode } from 'gpt-tokenizer';
import fs from 'node:fs';
import path from 'node:path';

export function scoreText(text) {
  const tokens = encode(text).length;
  const lines = text.split('\n');

  // signal: detect minified / base64 / dense junk lines
  let noiseChars = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const longNoSpace = t.length > 200 && !t.includes(' ');
    const fewSpaces   = t.length > 80 && (t.split(' ').length - 1) / t.length < 0.02;
    if (longNoSpace || fewSpaces) noiseChars += line.length;
  }
  const signal = 1 - (text.length ? noiseChars / text.length : 0);

  // structure: is it chunkable?
  const blank    = lines.filter(l => !l.trim()).length / Math.max(lines.length, 1);
  const bounds   = (text.match(/^(#{1,6}\s|(function|class|def|public|private)\b)/gm) || []).length;
  const avgLen   = text.length / Math.max(lines.length, 1);
  let structure  = 0.5 + Math.min(blank * 2, 0.25) + Math.min(bounds / 50, 0.25);
  if (avgLen > 300) structure -= 0.3;
  structure = Math.max(0, Math.min(1, structure));

  // redundancy: duplicate lines
  const ne = lines.filter(l => l.trim());
  const redundancy = ne.length ? 1 - new Set(ne).size / ne.length : 0;

  const value = Math.round((0.60 * signal + 0.25 * structure + 0.15 * (1 - redundancy)) * 100);
  const grade = gradeOf(value);
  return { grade, value, tokens, signal: +signal.toFixed(2), structure: +structure.toFixed(2), redundancy: +redundancy.toFixed(2) };
}

export function gradeOf(value) {
  return value >= 90 ? 'A' : value >= 75 ? 'B' : value >= 60 ? 'C' : value >= 45 ? 'D' : 'F';
}

const GEN_DIRS = new Set([
  'dist','build','out','coverage','.next','.nuxt','target','bin','obj',
  'test-results','playwright-report','__pycache__','.pytest_cache','vendor'
]);
const GEN_FILE = [
  /^package-lock\.json$/, /^yarn\.lock$/, /^pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/, /\.bundle\.js$/, /\.map$/, /\.lock$/, /\.generated\./
];

export function isGenerated(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.slice(0, -1).some(s => GEN_DIRS.has(s))) return true;
  return GEN_FILE.some(re => re.test(parts[parts.length - 1]));
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const TEXT = new Set(['.js','.ts','.jsx','.tsx','.json','.md','.txt','.py','.java','.html','.css','.yml','.yaml']);

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, out); }
    else if (TEXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}
