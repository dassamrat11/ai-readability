#!/usr/bin/env node
import { scoreText, isGenerated, walk, gradeOf } from './core.js';
import fs from 'node:fs';
import path from 'node:path';

const GEN_DIRS = new Set([
  'dist','build','out','coverage','.next','.nuxt','target','bin','obj',
  'test-results','playwright-report','__pycache__','.pytest_cache','vendor'
]);

const root = process.argv[2] || '.';
const rows = walk(root).map(f => {
  const s = scoreText(fs.readFileSync(f, 'utf8'));
  return { file: path.relative(root, f), ...s, waste: s.tokens * (1 - s.value / 100) };
});

const total = rows.reduce((a, r) => a + r.tokens, 0);
const repoVal = total ? Math.round(rows.reduce((a, r) => a + r.value * r.tokens, 0) / total) : 0;
const repoGrade = gradeOf(repoVal);

console.log(`\n📦 ${root}`);
console.log(`🪙 ${total.toLocaleString()} tokens · Grade ${repoGrade} (${repoVal}/100)\n`);
console.log('Worst offenders (tokens × low score):');
rows.sort((a, b) => b.waste - a.waste).slice(0, 10).forEach(r =>
  console.log(`  ${r.grade}  ${String(r.tokens).padStart(7)} tok  ${((r.tokens/total)*100).toFixed(0)}%  ${r.file}`));

const reasonFor = r =>
  isGenerated(r.file)        ? 'generated'
  : r.value < 45             ? 'low-signal (F)'
  : r.value < 60             ? 'low-signal (D)'
  : r.tokens / total > 0.10  ? `token-hog (${Math.round(r.tokens / total * 100)}%)`
  : null;

const flagged = rows.map(r => ({ ...r, reason: reasonFor(r) })).filter(r => r.reason);
const flaggedSet = new Set(flagged.map(r => r.file));
const kept = rows.filter(r => !flaggedSet.has(r.file));
const keptTotal = kept.reduce((a, r) => a + r.tokens, 0) || 1;
const keptVal = Math.round(kept.reduce((a, r) => a + r.value * r.tokens, 0) / keptTotal);
const saved = total - keptTotal;

if (flagged.length) {
  console.log(`\n💡 Exclude ${flagged.length} file(s) → grade ${gradeOf(repoVal)} → ${gradeOf(keptVal)}, save ${saved.toLocaleString()} tokens (${Math.round(saved / total * 100)}%)`);
  flagged.sort((a, b) => b.tokens - a.tokens).forEach(r =>
    console.log(`  - [${r.reason}] ${String(r.tokens).padStart(7)} tok  ${r.file}`));

  const patterns = [...new Set(flagged.map(r => {
    const dir = r.file.split(/[\\/]/).find(s => GEN_DIRS.has(s));
    return dir ? dir + '/' : r.file;
  }))];
  console.log(`\n📋 Add to .aiignore / .cursorignore:`);
  patterns.forEach(p => console.log(`  ${p}`));
}
