/**
 * Copy the pdf.js worker into /public so it is served same-origin.
 *
 * Why this exists [2026-07-26]: the Document Portal viewer used to point
 * `pdfjs.GlobalWorkerOptions.workerSrc` at unpkg. That can never work — browsers
 * refuse to construct a Web Worker from a cross-origin script:
 *
 *   SecurityError: Failed to construct 'Worker': Script at
 *   'https://unpkg.com/...' cannot be accessed from origin '...'
 *
 * No CORS header fixes it; the worker script has to be same-origin. So we copy
 * the exact worker that ships with the installed pdfjs-dist (guaranteeing it
 * matches `pdfjs.version` at runtime) into /public at predev + prebuild time.
 *
 * The copy is gitignored — it's a build artifact, regenerated from node_modules
 * on every install/build, so it can never drift from the installed version.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const WORKER_FILE = 'pdf.worker.min.mjs';

try {
  const pkgPath = require.resolve('pdfjs-dist/package.json');
  const src = join(dirname(pkgPath), 'build', WORKER_FILE);
  if (!existsSync(src)) {
    throw new Error(`worker not found at ${src}`);
  }

  const publicDir = join(process.cwd(), 'public');
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

  copyFileSync(src, join(publicDir, WORKER_FILE));
  const { version } = require('pdfjs-dist/package.json');
  console.log(`[copy-pdf-worker] public/${WORKER_FILE} <- pdfjs-dist@${version}`);
} catch (err) {
  // Fail loudly: without this file the PDF viewer silently never renders.
  console.error(`[copy-pdf-worker] FAILED: ${err.message}`);
  process.exit(1);
}
