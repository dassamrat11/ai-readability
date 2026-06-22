import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreText, isGenerated, gradeOf, scoreRepo, reasonFor, computePatterns, writeAiignore } from '../src/core.js';
import { MODELS } from '../src/pricing.js';

// ── grade determinism ─────────────────────────────────────────────────────────

test('scoreText is deterministic on a fixed string', () => {
  const src = 'function hello() {\n  return "world";\n}\n';
  const a = scoreText(src);
  const b = scoreText(src);
  assert.equal(a.value, b.value);
  assert.equal(a.grade, b.grade);
  assert.equal(a.tokens, b.tokens);
});

test('scoreText returns expected shape', () => {
  const r = scoreText('const x = 1;\n');
  assert.ok(typeof r.value    === 'number', 'value is number');
  assert.ok(typeof r.tokens   === 'number', 'tokens is number');
  assert.ok(typeof r.signal   === 'number', 'signal is number');
  assert.ok(typeof r.structure === 'number', 'structure is number');
  assert.ok(typeof r.redundancy === 'number', 'redundancy is number');
  assert.ok(['A','B','C','D','F'].includes(r.grade), 'grade is valid');
});

// ── gradeOf boundaries ────────────────────────────────────────────────────────

test('gradeOf A boundary: 90 → A, 89 → B', () => {
  assert.equal(gradeOf(90), 'A');
  assert.equal(gradeOf(89), 'B');
});

test('gradeOf B boundary: 75 → B, 74 → C', () => {
  assert.equal(gradeOf(75), 'B');
  assert.equal(gradeOf(74), 'C');
});

test('gradeOf C boundary: 60 → C, 59 → D', () => {
  assert.equal(gradeOf(60), 'C');
  assert.equal(gradeOf(59), 'D');
});

test('gradeOf D boundary: 45 → D, 44 → F', () => {
  assert.equal(gradeOf(45), 'D');
  assert.equal(gradeOf(44), 'F');
});

// ── isGenerated ───────────────────────────────────────────────────────────────

test('isGenerated: dist/ directory', () => {
  assert.equal(isGenerated('dist/bundle.js'), true);
  assert.equal(isGenerated('dist/subdir/file.js'), true);
});

test('isGenerated: build/ directory', () => {
  assert.equal(isGenerated('build/index.js'), true);
});

test('isGenerated: *.lock files', () => {
  assert.equal(isGenerated('package-lock.json'), true);
  assert.equal(isGenerated('yarn.lock'), true);
  assert.equal(isGenerated('pnpm-lock.yaml'), true);
});

test('isGenerated: *.min.js files', () => {
  assert.equal(isGenerated('app.min.js'), true);
  assert.equal(isGenerated('vendor/jquery.min.css'), true);
});

test('isGenerated: source map files', () => {
  assert.equal(isGenerated('app.js.map'), true);
});

test('isGenerated: .bundle.js files', () => {
  assert.equal(isGenerated('app.bundle.js'), true);
});

test('isGenerated: normal source files are NOT generated', () => {
  assert.equal(isGenerated('src/index.js'), false);
  assert.equal(isGenerated('README.md'), false);
  assert.equal(isGenerated('package.json'), false);
  assert.equal(isGenerated('src/utils/helper.ts'), false);
});

// ── cost calc math ────────────────────────────────────────────────────────────

test('cost calc: Claude Opus 4.8 at 1M tokens = $5.00', () => {
  const m = MODELS.find(m => m.name === 'Claude Opus 4.8');
  assert.ok(m, 'Claude Opus 4.8 not found in MODELS');
  assert.equal(1_000_000 / 1e6 * m.usdPerMTok, 5.0);
});

test('cost calc: GPT-4.1 at 1M tokens = $2.00', () => {
  const m = MODELS.find(m => m.name === 'GPT-4.1');
  assert.ok(m, 'GPT-4.1 not found in MODELS');
  assert.equal(1_000_000 / 1e6 * m.usdPerMTok, 2.0);
});

test('cost calc: linear scaling holds', () => {
  const m = MODELS.find(m => m.name === 'Gemini 2.0 Flash');
  assert.ok(m, 'Gemini 2.0 Flash not found in MODELS');
  const cost500k = 500_000 / 1e6 * m.usdPerMTok;
  const cost1m   = 1_000_000 / 1e6 * m.usdPerMTok;
  assert.equal(cost1m, cost500k * 2);
});

test('all MODELS have required fields with valid values', () => {
  for (const m of MODELS) {
    assert.ok(typeof m.name     === 'string' && m.name,     `model missing name`);
    assert.ok(typeof m.provider === 'string' && m.provider, `${m.name}: missing provider`);
    assert.ok(typeof m.ctx      === 'number' && m.ctx > 0,  `${m.name}: ctx must be positive`);
    assert.ok(typeof m.usdPerMTok === 'number' && m.usdPerMTok >= 0, `${m.name}: usdPerMTok must be >= 0`);
  }
});

test('MODELS covers all three expected providers', () => {
  const providers = new Set(MODELS.map(m => m.provider));
  assert.ok(providers.has('Anthropic'), 'missing Anthropic models');
  assert.ok(providers.has('OpenAI'),    'missing OpenAI models');
  assert.ok(providers.has('Google'),    'missing Google models');
});

// ── scoreRepo (library API) ───────────────────────────────────────────────────

test('scoreRepo on its own src/ returns a valid result object', () => {
  const result = scoreRepo(fileURLToPath(new URL('../src', import.meta.url)));
  assert.ok(typeof result.total   === 'number', 'total is number');
  assert.ok(typeof result.score   === 'number', 'score is number');
  assert.ok(typeof result.grade   === 'string', 'grade is string');
  assert.ok(Array.isArray(result.files),        'files is array');
  assert.ok(result.files.length > 0,            'found at least one file');
  assert.ok(result.scannedAt,                   'scannedAt is set');
});

// ── reasonFor grade guard ─────────────────────────────────────────────────────

test('reasonFor: A-grade file is never flagged as token-hog', () => {
  // value=95 → grade A; tokens=2000/10000 = 20% > threshold
  const file = { file: 'src/big.ts', value: 95, tokens: 2000 };
  assert.equal(reasonFor(file, 10000), null, 'A-grade must not be flagged');
});

test('reasonFor: B-grade file is never flagged as token-hog', () => {
  const file = { file: 'src/medium.ts', value: 80, tokens: 2000 };
  assert.equal(reasonFor(file, 10000), null, 'B-grade must not be flagged');
});

test('reasonFor: C-grade large file IS flagged as token-hog', () => {
  // value=65 → grade C; 20% of total
  const file = { file: 'src/noisy.ts', value: 65, tokens: 2000 };
  assert.ok(reasonFor(file, 10000) !== null, 'C-grade token-hog must be flagged');
});

test('reasonFor: low-signal F-grade file is flagged regardless of size', () => {
  const file = { file: 'src/minified.js', value: 30, tokens: 50 };
  assert.equal(reasonFor(file, 10000), 'low-signal (F)');
});

test('reasonFor: generated file is always flagged regardless of grade', () => {
  // A-grade score but lives in dist/ → generated
  const file = { file: 'dist/bundle.js', value: 95, tokens: 10 };
  assert.equal(reasonFor(file, 10000), 'generated');
});

// ── writeAiignore idempotency ─────────────────────────────────────────────────

test('writeAiignore: second run adds zero lines and file is byte-identical', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-readability-fix-'));
  try {
    // vendor/ is in GEN_DIRS but NOT in the walk SKIP set, so scoreRepo will
    // visit it and reasonFor will return 'generated' for those files.
    const vendorDir = path.join(tmpDir, 'vendor');
    fs.mkdirSync(vendorDir);
    fs.writeFileSync(
      path.join(vendorDir, 'jquery.js'),
      '(function(){var x=1;})();\n'.repeat(200),
    );
    // A clean source file that must NOT be flagged
    fs.writeFileSync(
      path.join(tmpDir, 'index.js'),
      'export function greet(name) {\n  return `Hello, ${name}!`;\n}\n',
    );

    const { total, files } = scoreRepo(tmpDir);
    const patterns = computePatterns(files, total);
    assert.ok(patterns.length > 0, 'fixture must produce at least one pattern');

    const dest = path.join(tmpDir, '.aiignore');

    const added1 = writeAiignore(dest, patterns);
    assert.ok(added1 > 0, 'first run must write patterns');
    const content1 = fs.readFileSync(dest, 'utf8');

    const added2 = writeAiignore(dest, patterns);
    assert.equal(added2, 0, 'second run must add nothing');
    const content2 = fs.readFileSync(dest, 'utf8');

    assert.equal(content1, content2, 'file must be byte-identical after second run');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('writeAiignore: deduplicates and never inserts blank lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-readability-dedup-'));
  try {
    const dest = path.join(tmpDir, '.aiignore');
    fs.writeFileSync(dest, 'dist/\n');

    const added = writeAiignore(dest, ['dist/', 'build/']);
    assert.equal(added, 1, 'only the new pattern should be added');

    const content = fs.readFileSync(dest, 'utf8');
    assert.equal(content, 'dist/\nbuild/\n', 'no blank line between existing and new pattern');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('computePatterns: excludes A/B-grade source files even when large', () => {
  // Synthetic file list: one A-grade large file, one generated file
  const total = 10000;
  const files = [
    { file: 'src/main.ts',    value: 92, tokens: 3000, grade: 'A' }, // 30% but A-grade
    { file: 'dist/bundle.js', value: 80, tokens: 5000, grade: 'B' }, // generated → must be included
  ];
  const patterns = computePatterns(files, total);
  assert.ok(!patterns.includes('src/main.ts'),  'A-grade source file must NOT appear in patterns');
  assert.ok(patterns.includes('dist/'),          'generated dist/ must appear in patterns');
});
