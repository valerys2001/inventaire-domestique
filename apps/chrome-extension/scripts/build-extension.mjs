// Orchestrateur de build : voir le commentaire en tête de ../vite.config.ts pour
// la raison (IIFE/UMD + Rollup n'autorisent pas le code splitting multi-entrées,
// nécessaire ici puisque les 3 sorties de l'extension n'ont aucun contexte de
// chargement commun). Ce script appelle `vite build` une fois par entrée, puis
// copie les fichiers statiques (manifest.json, popup.html) dans dist/.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');

const entries = ['background', 'content-script', 'popup'];

for (const entry of entries) {
  const result = spawnSync('npx', ['vite', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, EXTENSION_ENTRY: entry },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

mkdirSync(resolve(root, 'dist/popup'), { recursive: true });
cpSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'));
cpSync(resolve(root, 'popup/popup.html'), resolve(root, 'dist/popup/popup.html'));

console.log('Build extension Chrome terminé -> dist/');
