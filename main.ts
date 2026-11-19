/* Vice Cover Studio — entrypoint (program/v1).
 * Copies app/ and screenshots/ from this repository into the output
 * directory and writes /output/dossier.json with buildDossier from
 * vendor/makefun-app.ts. Node 22 standard library only, no network.
 * Deterministic: two runs write identical bytes.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000
};

/* Copy a directory tree, entries in sorted order, files byte for byte. */
function copyTree(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const entries = readdirSync(sourceDir).sort();
  for (const entry of entries) {
    const from = join(sourceDir, entry);
    const to = join(targetDir, entry);
    const info = statSync(from);
    if (info.isDirectory()) {
      copyTree(from, to);
    } else if (info.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function main(): void {
  for (const dir of ['app', 'screenshots']) {
    if (!statSync(join(REPO_ROOT, dir), { throwIfNoEntry: false })) {
      throw new Error('missing directory: ' + join(REPO_ROOT, dir));
    }
  }
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  copyTree(join(REPO_ROOT, 'app'), join(OUTPUT_DIR, 'app'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'));
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  verifyOutput();
  console.log('wrote ' + OUTPUT_DIR + '/dossier.json (' + dossier.length + ' bytes)');
}

/* Fail loudly if the output is missing its page or its dossier. */
function verifyOutput(): void {
  const page = join(OUTPUT_DIR, 'app', 'index.html');
  const dossierPath = join(OUTPUT_DIR, 'dossier.json');
  if (!statSync(page, { throwIfNoEntry: false })) {
    throw new Error('output is missing app/index.html');
  }
  const dossierInfo = statSync(dossierPath, { throwIfNoEntry: false });
  if (!dossierInfo || dossierInfo.size === 0 || dossierInfo.size > 1572864) {
    throw new Error('output dossier.json is missing or over the 1.5 MiB cap');
  }
}

main();
