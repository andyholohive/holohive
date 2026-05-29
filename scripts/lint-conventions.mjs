#!/usr/bin/env node
/**
 * lint-conventions.mjs — enforce the CLAUDE.md style rules at build time.
 *
 * Runs a set of grep-based checks against the repo's UI source files.
 * Catches the most common drift patterns the May 2026 audit converted:
 *
 *   1. text-red-*, bg-red-*, border-red-*    → use rose-*
 *   2. hover:opacity-90                       → variant="brand" handles hover
 *   3. <Input type="date">                    → use DateField (Popover + Calendar)
 *   4. placeholder="X *"                      → use <RequiredAsterisk />
 *   5. <Button className="bg-brand text-white"> → variant="brand"
 *
 * Each rule defines:
 *   - id (short slug)
 *   - description (shown when violations are found)
 *   - pattern (regex to grep)
 *   - exclude (optional regex; lines matching this are NOT violations,
 *     used for legit exceptions like Calendar modifiersStyles)
 *
 * Exits with code 1 if any violations are found, 0 otherwise.
 *
 * Usage:
 *   node scripts/lint-conventions.mjs       # check entire repo
 *   node scripts/lint-conventions.mjs FILES # check specific files (pre-commit)
 *
 * Add to package.json:
 *   "lint:conventions": "node scripts/lint-conventions.mjs"
 *   "lint": "next lint && npm run lint:conventions"
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

/* ─── Rules ──────────────────────────────────────────────────────── */

const RULES = [
  {
    id: 'rose-not-red',
    description:
      'Destructive intent uses rose-*, not red-*. The StatusBadge "danger" tone is rose; ' +
      'mixing them looks subtly off. (CLAUDE.md → Destructive intent)',
    // Matches text-red-500, bg-red-50, border-red-300, hover:bg-red-50, hover:text-red-600
    pattern: /(text|bg|border|hover:bg|hover:text)-red-(50|100|200|300|400|500|600|700|800|900)\b/,
  },
  {
    id: 'no-hover-opacity-90',
    description:
      '`hover:opacity-90` is forbidden. variant="brand" already handles hover via ' +
      'hover:bg-brand/90 — the opacity hack washes out. (CLAUDE.md → Buttons)',
    pattern: /\bhover:opacity-90\b/,
  },
  {
    id: 'no-input-type-date',
    description:
      '<Input type="date"> is forbidden. Native pickers are unstyled and inconsistent ' +
      'across browsers. Use Popover + Calendar (see DateField in CLAUDE.md → Date pickers).',
    pattern: /<Input[^>]*\btype=["']date["']/,
  },
  {
    id: 'no-placeholder-asterisk',
    description:
      'Required-field placeholders with `*` are forbidden. Drop the asterisk from the ' +
      'placeholder and add a conditional <RequiredAsterisk /> sibling. ' +
      '(CLAUDE.md → Required-field labels)',
    pattern: /placeholder=["'][^"']*\*["']/,
  },
  {
    id: 'no-bg-brand-text-white-button',
    description:
      '<Button className="bg-brand text-white"> is forbidden. Use variant="brand" — the ' +
      'variant handles brand color + hover correctly. (CLAUDE.md → Buttons)',
    // Catches both single-line and the most common multi-line: <Button ... className="...bg-brand text-white..."
    // Caveat: only catches when "bg-brand text-white" appears on the same line as a Button tag.
    pattern: /<Button[^>]*\bclassName=["'][^"']*bg-brand[^"']*text-white/,
  },
  {
    id: 'no-card-shell',
    description:
      'The card-shell page wrapper `min-h-[calc(100vh-64px)] bg-gray-50` + white-Card ' +
      'outer was migrated away from in the May 2026 audit. Use `<div className="space-y-6">` ' +
      'directly. (CLAUDE.md → Standard page shell)',
    pattern: /min-h-\[calc\(100vh-64px\)\][^"']*bg-gray-50/,
    // Legitimate exceptions: auth-guard centered splash screens use
    // `flex items-center justify-center` to center messaging. Those
    // are NOT the page-shell pattern this rule targets.
    excludeLineRegex: /flex\s+items-center\s+justify-center/,
    // Allow only the layout file itself if it needs it
    excludePathRegex: /\/(layout|app)\.tsx$/,
  },
];

/* ─── Disable directives ─────────────────────────────────────────── */

/**
 * Match `lint-conventions: disable-line RULE_ID` on the same line.
 * Allow space- or comma-separated rule IDs; '*' disables all rules.
 *
 * Rule IDs are word-chars + hyphens only, so the regex stops at any
 * trailing JSX/JS comment terminator (block-end, line-comment, etc.).
 */
function hasDisableDirective(line, ruleId) {
  return matchDisable(line, /lint-conventions:\s*disable-line\s+([\w\-, ]+?)(?=\s*(\*\/|\/\/|$))/, ruleId);
}

/**
 * Match `lint-conventions: disable-next-line RULE_ID` on the previous line.
 */
function hasDisableNextDirective(prevLine, ruleId) {
  return matchDisable(prevLine, /lint-conventions:\s*disable-next-line\s+([\w\-, ]+?)(?=\s*(\*\/|\/\/|$))/, ruleId);
}

function matchDisable(line, pattern, ruleId) {
  const m = line.match(pattern);
  if (!m) return false;
  const rules = m[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  return rules.includes(ruleId) || rules.includes('*');
}

/* ─── File enumeration ───────────────────────────────────────────── */

/**
 * Get the list of files to check.
 *
 * - If files are passed as argv, check those (pre-commit hook use case).
 * - Otherwise, find all *.tsx files under app/ and components/.
 *
 * Skips node_modules, .next, dist, build.
 */
function listFiles() {
  const argvFiles = process.argv.slice(2);
  if (argvFiles.length > 0) {
    return argvFiles
      .filter(f => existsSync(f))
      .filter(f => statSync(f).isFile())
      .filter(f => /\.(tsx|ts|jsx|js)$/.test(f));
  }
  // find via git ls-files, fall back to find
  try {
    const out = execSync(
      `git ls-files 'app/*.tsx' 'app/**/*.tsx' 'components/*.tsx' 'components/**/*.tsx'`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map(f => resolve(REPO_ROOT, f));
  } catch {
    // Fallback for non-git environments
    return [];
  }
}

/* ─── Main ───────────────────────────────────────────────────────── */

function main() {
  const files = listFiles();
  if (files.length === 0) {
    console.log('lint-conventions: no files to check.');
    return 0;
  }

  // violations: array of { rule, file, line, lineNumber, snippet }
  const violations = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue; // skip unreadable files
    }
    const lines = content.split('\n');

    for (const rule of RULES) {
      if (rule.excludePathRegex && rule.excludePathRegex.test(file)) continue;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (rule.pattern.test(line)) {
          // Allow the rule itself to define line-level exceptions
          if (rule.excludeLineRegex && rule.excludeLineRegex.test(line)) continue;
          // Inline disable directive — same line OR previous line.
          // Examples:
          //   <Input type="date" /> {/* lint-conventions: disable-line no-input-type-date */}
          //   {/* lint-conventions: disable-next-line no-card-shell */}
          //   <div className="min-h-[calc(100vh-64px)] ...">
          if (hasDisableDirective(line, rule.id)) continue;
          const prevLine = i > 0 ? lines[i - 1] : '';
          if (hasDisableNextDirective(prevLine, rule.id)) continue;
          violations.push({
            rule: rule.id,
            file: relative(REPO_ROOT, file),
            lineNumber: i + 1,
            snippet: line.trim().slice(0, 200),
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(`lint-conventions: ✓ no violations (${files.length} files checked)`);
    return 0;
  }

  // Group violations by rule for readable output
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule).push(v);
  }

  console.error(`lint-conventions: ✗ ${violations.length} violation${violations.length === 1 ? '' : 's'} found\n`);

  for (const [ruleId, ruleViolations] of byRule.entries()) {
    const rule = RULES.find(r => r.id === ruleId);
    console.error(`─── ${ruleId} (${ruleViolations.length}) ───`);
    console.error(rule.description);
    console.error();
    for (const v of ruleViolations.slice(0, 20)) {
      console.error(`  ${v.file}:${v.lineNumber}`);
      console.error(`    ${v.snippet}`);
    }
    if (ruleViolations.length > 20) {
      console.error(`  ... and ${ruleViolations.length - 20} more`);
    }
    console.error();
  }

  console.error(
    `Fix the violations above, or document a deliberate exception in CLAUDE.md ` +
    `before disabling/excluding the rule.\n`
  );

  return 1;
}

process.exit(main());
