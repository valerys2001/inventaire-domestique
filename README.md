# Inventaire Domestique

PWA de suivi d'inventaire domestique (épicerie, produits frais, cosmétiques/hygiène, entretien) — installable sur iOS et Android, offline-first, sans backend applicatif : les données vivent dans un **Google Sheet partagé**, lu/écrit directement depuis le navigateur via OAuth 2.0.

Le projet inclut aussi une **extension Chrome** qui importe automatiquement les articles d'une commande Chronodrive dans le même Sheet.

## Sommaire

- [Architecture du monorepo](#architecture-du-monorepo)
- [1. Créer le Google Sheet](#1-créer-le-google-sheet)
- [2. Configurer Google Cloud (API + OAuth)](#2-configurer-google-cloud-api--oauth)
- [3. Lancer la PWA en local](#3-lancer-la-pwa-en-local)
- [4. Déployer la PWA](#4-déployer-la-pwa)
- [5. Installer l'extension Chrome](#5-installer-lextension-chrome)
- [Tests](#tests)
- [Recette / QA](#recette--qa)
- [Limitations connues](#limitations-connues)

## Architecture du monorepo

```
packages/shared/       Contrat commun (types, catégories/unités figées, règle de fusion,
                        mapping des colonnes du Sheet) — importé par la PWA ET l'extension.
apps/pwa/               PWA React + Vite (écrans, scan caméra, sync offline).
apps/chrome-extension/  Extension Manifest V3 (scraper Chronodrive).
docs/qa-checklist.md    Checklist de recette manuelle.
```

## 1. Créer le Google Sheet

1. Créez un nouveau Google Sheet, partagé en modification avec tous les comptes Google des utilisateurs du foyer.
2. Créez deux onglets avec **exactement** ces noms et cet ordre de colonnes (ligne d'en-tête ligne 1) :

**Onglet `Inventaire`**

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| id | nom | marque | categorie | contenance_unitaire | unite | quantite_totale | code_barre | date_maj | utilisateur | cle_fusion | seuil_alerte |

- `categorie` : une des 8 valeurs figées — `epicerie_fine`, `epicerie_salee`, `epicerie_sucree`, `fruits`, `legumes`, `produits_frais`, `cosmetiques_hygiene`, `produits_entretien`.
- `unite` : `unite`, `g`, `l`, `m`, ou `pourcent`.
- `cle_fusion` : renseignée automatiquement par l'app à chaque écriture — ne pas éditer à la main.
- `seuil_alerte` : optionnel (laisser vide pour utiliser le seuil par défaut de l'unité).

**Onglet `Mouvements`** (journal, append-only — sert d'audit pour les cas de synchronisation concurrente)

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| date | cle_fusion | delta | type | utilisateur | commentaire |

- `type` : `entree_scan`, `entree_manuelle`, `entree_extension`, ou `sortie`.

3. Notez l'ID du spreadsheet dans son URL : `https://docs.google.com/spreadsheets/d/<ID_ICI>/edit`.

## 2. Configurer Google Cloud (API + OAuth)

1. Sur [console.cloud.google.com](https://console.cloud.google.com), créez (ou réutilisez) un projet.
2. **APIs & Services → Bibliothèque** : activez **Google Sheets API**.
3. **APIs & Services → Écran de consentement OAuth** : configurez-le en type "Externe" (ou "Interne" si vous avez un Google Workspace), ajoutez le scope `https://www.googleapis.com/auth/spreadsheets`, et ajoutez les comptes Google du foyer comme utilisateurs de test tant que l'app n'est pas validée par Google.
4. **APIs & Services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type **Application Web**, avec comme "Origines JavaScript autorisées" l'URL où la PWA sera déployée (ex. `https://votre-compte.github.io` ou `https://votre-site.netlify.app`) **et** `http://localhost:5173` pour le développement local. Ce client ID va dans `VITE_GOOGLE_CLIENT_ID` (PWA).
   - Un second identifiant sera nécessaire pour l'extension Chrome — voir [section 5](#5-installer-lextension-chrome), car son ID dépend de l'ID d'extension généré au chargement.

## 3. Lancer la PWA en local

```bash
npm install
cp apps/pwa/.env.example apps/pwa/.env.local
```

Complétez `apps/pwa/.env.local` avec `VITE_GOOGLE_CLIENT_ID` et `VITE_SPREADSHEET_ID` (voir sections précédentes), puis :

```bash
npm run dev:pwa
```

Ouvrez `http://localhost:5173`. Dans l'écran **Réglages**, cliquez sur "Se connecter à Google" pour autoriser l'accès au Sheet (le champ "Identifiant du spreadsheet" y permet aussi de surcharger `VITE_SPREADSHEET_ID` sans reconstruire l'app, par exemple pour pointer une instance déjà déployée vers un autre Sheet).

> Le scan de code-barre nécessite une caméra et un contexte sécurisé (HTTPS, ou `localhost`) : `getUserMedia` est bloqué sur HTTP en dehors de localhost.

## 4. Déployer la PWA

Hébergement statique gratuit (GitHub Pages, Netlify, Vercel...) :

```bash
npm run build:pwa
```

Le résultat est dans `apps/pwa/dist/`. Avant le premier déploiement :

- **Icônes manquantes** : ajoutez `apps/pwa/public/icons/icon-192.png` et `icon-512.png` (192×192 et 512×512, fond opaque) — non fournis dans ce dépôt (assets graphiques), requis pour que l'installation PWA (icône d'accueil) fonctionne correctement sur iOS/Android.
- Configurez les variables d'environnement `VITE_GOOGLE_CLIENT_ID` / `VITE_SPREADSHEET_ID` dans les paramètres de build de votre hébergeur (GitHub Actions secrets, variables d'environnement Netlify, etc.) plutôt que de committer `.env.local`.
- Ajoutez l'URL finale aux "Origines JavaScript autorisées" du client OAuth (étape 2).

**Exemple GitHub Pages** : servez `apps/pwa/dist/` via une action de déploiement standard (`actions/deploy-pages`), avec un job de build qui exporte les deux variables `VITE_*` avant `npm run build:pwa`.

## 5. Installer l'extension Chrome

1. Ouvrez `apps/chrome-extension/manifest.json` et remplacez `"__GOOGLE_OAUTH_CLIENT_ID__"` — mais l'ID client OAuth d'une extension dépend de son ID Chrome, généré seulement après un premier chargement. Procédure :
   1. Buildez une première fois pour obtenir un ID d'extension provisoire :
      ```bash
      npm run build --workspace=apps/chrome-extension
      ```
   2. Dans Chrome : `chrome://extensions` → activez le **Mode développeur** → **Charger l'extension non empaquetée** → sélectionnez `apps/chrome-extension/dist/`.
   3. Notez l'**ID de l'extension** affiché par Chrome.
   4. Dans Google Cloud Console, créez un identifiant OAuth de type **ID client pour application Chrome**, en renseignant cet ID d'extension. Remplacez ensuite le placeholder dans `manifest.json` par ce nouveau client ID.
   5. Rebuild (`npm run build --workspace=apps/chrome-extension`) puis rechargez l'extension dans `chrome://extensions` (bouton ↻).
2. **Sélecteurs DOM à ajuster** : `apps/chrome-extension/content-scripts/chronodrive-scraper.ts` contient des sélecteurs CSS génériques (conventions e-commerce courantes), pas vérifiés contre le DOM réel de Chronodrive. Ouvrez une page de commande Chronodrive, inspectez le DOM, et ajustez `ARTICLE_CONTAINER_SELECTORS` / `FIELD_SELECTORS` en conséquence.
3. **Host permissions** : `manifest.json` cible `*://www.chronodrive.com/*` — ajustez si l'URL réelle des pages de commande diffère.
4. Sur la page de commande Chronodrive, un bouton flottant "Importer vers l'inventaire" est injecté ; il déclenche l'extraction et l'envoi vers le Sheet (connexion Google à faire une première fois depuis le popup de l'extension).
5. **Catégorisation** : Chronodrive ne fournissant pas de catégorie exploitable, les articles importés sont classés par défaut en `epicerie_salee`, avec un commentaire explicite dans l'onglet `Mouvements` ("catégorie par défaut à vérifier") — à corriger manuellement dans la PWA après import.

## Tests

```bash
npm run test:shared          # 23 tests Vitest sur la logique de fusion/quantité/mapping
npx vitest run --root apps/pwa   # tests du parsing de contenance (scan)

# Vérification des types sur l'ensemble du monorepo
npx tsc -b packages/shared
npx tsc -p apps/pwa/tsconfig.json --noEmit
npx tsc -p apps/chrome-extension --noEmit
```

## Recette / QA

Voir [`docs/qa-checklist.md`](docs/qa-checklist.md) pour la checklist de recette manuelle (installation iOS/Android, mode offline, scan multi-source, unités non standards, édition concurrente, extension Chrome, stock bas).

## Limitations connues

- **Aucune transaction atomique côté Sheets API** : la synchronisation applique des deltas (jamais d'écrasement de quantité) pour éviter la perte d'écriture en cas d'édition concurrente entre appareils, mais deux écritures strictement simultanées restent possibles à départager manuellement via l'onglet `Mouvements` (journal d'audit).
- **Extension Chrome** : si le token OAuth expire au milieu d'une boucle d'import (rare, tokens valables ~1h), le retry rejoue l'import depuis le début, ce qui peut dupliquer les lignes déjà créées lors du premier passage (pas les mises à jour de quantité, qui restent idempotentes). Acceptable pour une v1 domestique, à durcir si l'usage s'intensifie.
- **Catégorisation automatique** (scan produit et import Chronodrive) n'est qu'une suggestion best-effort — toujours confirmée/corrigée par l'utilisateur, jamais imposée.
