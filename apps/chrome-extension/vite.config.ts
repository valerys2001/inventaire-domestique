import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(__dirname);

/**
 * Une extension Chrome a 3 contextes d'exécution totalement disjoints (service
 * worker, content script, page popup) : aucun chunk JS ne peut être partagé/chargé
 * entre eux au runtime. Or Rollup interdit le "code splitting" multi-entrées dès
 * que le format de sortie est IIFE/UMD (nécessaire ici : ni le service worker, ni
 * le content script Chronodrive n'ont besoin/veulent être des modules ES).
 * Solution la plus simple retenue : chaque entrée est buildée séparément, en mode
 * "lib" Vite (bundle autonome, pas de chunk partagé), pilotée par
 * scripts/build-extension.mjs qui invoque `vite build` 3 fois via la variable
 * d'environnement EXTENSION_ENTRY. Pas de dépendance supplémentaire nécessaire.
 */
const ENTRIES: Record<string, string> = {
  background: 'background/service-worker.ts',
  'content-script': 'content-scripts/chronodrive-scraper.ts',
  popup: 'popup/popup.ts',
};

const entryKey = process.env.EXTENSION_ENTRY ?? 'background';
const entryPath = ENTRIES[entryKey];
if (!entryPath) {
  throw new Error(`EXTENSION_ENTRY invalide: "${entryKey}". Valeurs possibles: ${Object.keys(ENTRIES).join(', ')}`);
}
const outFileName = entryPath.replace(/\.ts$/, '.js');

export default defineConfig({
  build: {
    outDir: 'dist',
    // Seul le premier appel (background) vide dist/, les suivants s'y ajoutent.
    emptyOutDir: entryKey === 'background',
    lib: {
      entry: resolve(root, entryPath),
      formats: ['iife'],
      name: 'InventaireExtension',
      fileName: () => outFileName,
    },
  },
});
