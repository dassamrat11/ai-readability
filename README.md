# ai-readability

[![npm](https://img.shields.io/npm/v/ai-readability)](https://www.npmjs.com/package/ai-readability)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org)

Instantly score how AI-readable your codebase is — token count, signal quality, and which files to exclude before sending to an LLM.

AI tools like Cursor, GitHub Copilot, and Claude have limited context windows and charge per token. Most codebases silently waste 80–98% of that budget on generated files, minified output, and lock files that AI tools can't reason about anyway. This tool tells you exactly what to cut.

## Requirements

Node.js 16 or later.

## Installation

**Run without installing (recommended for one-off checks):**

```bash
npx ai-readability .
```

**Install globally for repeated use:**

```bash
npm install -g ai-readability
ai-readability .
ai-readability /path/to/any/project
```

## Example

Running against a Playwright test project:

```
$ npx ai-readability ./my-playwright-project

📦 ./my-playwright-project
🪙 226,533 tokens · Grade F (38/100)

Worst offenders (tokens × low score):
  F   219925 tok  97%  playwright-report/index.html
  C     1165 tok  1%   package-lock.json
  A      584 tok  0%   playwright.config.js
  B      403 tok  0%   tests/Sorting.spec.js
  A      585 tok  0%   tests/Shopping.spec.js
  A      885 tok  0%   README.md
  B      183 tok  0%   .github/workflows/playwright.yml
  A      266 tok  0%   pages/CheckoutInfo.js

💡 Exclude 5 file(s) → grade F → A, save 221,862 tokens (98%)
  - [generated]  219925 tok  playwright-report/index.html
  - [generated]    1165 tok  package-lock.json
  - [generated]     364 tok  playwright-report/data/8d9e8c1a.md
  - [generated]     364 tok  test-results/Login-loginPage-chromium/error-context.md
  - [generated]      44 tok  test-results/.last-run.json

📋 Add to .aiignore / .cursorignore:
  playwright-report/
  package-lock.json
  test-results/
```

The tool correctly identifies that 98% of tokens are in a generated HTML report that provides zero signal to an AI model.

## What it measures

| Metric | What it detects |
|---|---|
| **Signal** | Minified lines, base64 blobs, and dense text with no whitespace |
| **Structure** | Blank-line density and function/class/heading boundaries — higher structure = easier for AI to chunk and cite |
| **Redundancy** | Duplicate lines that inflate token count without adding meaning |
| **Grade** | A (≥90) · B (≥75) · C (≥60) · D (≥45) · F (<45) |

Files are automatically flagged as:
- `generated` — lock files, build output, test reports, source maps
- `low-signal` — score F or D, mostly noise
- `token-hog` — consumes >10% of total tokens

The suggested `.aiignore` / `.cursorignore` patterns are ready to paste directly into your project.

## Privacy

**100% local. No network requests. No API keys.** The tool runs entirely on your machine using an offline tokenizer. Your source code never leaves your computer.

## Contributing

Found a bug or want to suggest a file pattern? Open an issue at [github.com/dassamrat11/ai-readability/issues](https://github.com/dassamrat11/ai-readability/issues).

## License

MIT © 2026 Samrat Das
