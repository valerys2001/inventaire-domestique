import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';

const root = resolve(__dirname);

/**
 * Petit plugin maison (pas de dépendance supplémentaire nécessaire) qui copie
 * les fichiers statiques de l'extension (manifest.json, popup.html) dans dist/
 * après le build JS. Alternative à vite-plugin-static-copy, plus simple ici vu
 * le petit nombre de fichiers à copier.
 */
function copyStaticFiles(): Plugin {
  return {
    name: 'copy-extension-static-files',
    closeBundle() {
      mkdirSync(resolve(root, 'dist/popup'), { recursive: true });
      cpSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'));
      cpSync(resolve(root, 'popup/popup.html'), resolve(root, 'dist/popup/popup.html'));
    },
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/service-worker': resolve(root, 'background/service-worker.ts'),
        'content-scripts/chronodrive-scraper': resolve(root, 'content-scripts/chronodrive-scraper.ts'),
        'popup/popup': resolve(root, 'popup/popup.ts'),
      },
      output: {
        // format IIFE : chaque entrée doit être un bundle autonome (pas de chunk
        // partagé chargé séparément), adapté à un service worker, un content
        // script et une page popup qui n'ont pas de contexte de chargement commun.
        format: 'iife',
        entryFileNames: '[name].js',
        inlineDynamicImports: false,
      },
    },
  },
});
