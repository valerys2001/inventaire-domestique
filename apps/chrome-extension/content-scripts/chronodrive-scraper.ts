/**
 * Scraper de la page de commande / panier Chronodrive.
 *
 * A AJUSTER APRES INSPECTION REELLE DU DOM CHRONODRIVE : les sélecteurs ci-dessous
 * (ARTICLE_CONTAINER_SELECTORS / FIELD_SELECTORS) sont des suppositions raisonnables
 * basées sur des conventions courantes de sites e-commerce, pas le résultat d'une
 * inspection du DOM réel de chronodrive.com. Avant mise en production : ouvrir une
 * vraie page de panier/commande Chronodrive, inspecter le DOM avec les devtools, et
 * mettre à jour ces listes en conséquence (chaque liste est testée dans l'ordre,
 * le premier sélecteur qui matche est utilisé).
 */

interface ScrapedItem {
  nom: string;
  quantite: number;
  marque?: string;
}

const ARTICLE_CONTAINER_SELECTORS = [
  '[data-testid="cart-line-item"]',
  '[data-testid="order-line-item"]',
  '.cart-item',
  '.basket-item',
  '.order-line',
  'li.product-line',
];

const FIELD_SELECTORS = {
  nom: ['[data-testid="product-name"]', '.product-name', '.product-title', 'h3', 'h2'],
  quantite: ['[data-testid="product-quantity"]', '.quantity', '.qty', 'input[type="number"]'],
  marque: ['[data-testid="product-brand"]', '.product-brand', '.brand'],
};

function queryFirst(root: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function parseQuantity(raw: string): number {
  // Cherche le premier nombre (entier ou décimal) dans le texte, ex "x 2", "Qté : 3".
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return 1;
  return Number(match[1].replace(',', '.')) || 1;
}

function findArticleContainers(): Element[] {
  for (const selector of ARTICLE_CONTAINER_SELECTORS) {
    const found = Array.from(document.querySelectorAll(selector));
    if (found.length > 0) return found;
  }
  return [];
}

function scrapeItems(): ScrapedItem[] {
  const containers = findArticleContainers();
  const items: ScrapedItem[] = [];

  for (const container of containers) {
    const nomEl = queryFirst(container, FIELD_SELECTORS.nom);
    const nom = textOf(nomEl);
    if (!nom) continue; // conteneur probablement non pertinent (bandeau, pub, etc.)

    const quantiteEl = queryFirst(container, FIELD_SELECTORS.quantite);
    let quantite = 1;
    if (quantiteEl) {
      const rawValue = 'value' in quantiteEl ? (quantiteEl as HTMLInputElement).value : '';
      quantite = parseQuantity(rawValue || textOf(quantiteEl));
    }

    const marqueEl = queryFirst(container, FIELD_SELECTORS.marque);
    const marque = textOf(marqueEl) || undefined;

    items.push({ nom, quantite, marque });
  }

  return items;
}

function injectImportButton(): void {
  if (document.getElementById('inventaire-import-button')) return;

  const button = document.createElement('button');
  button.id = 'inventaire-import-button';
  button.textContent = "Importer vers l'inventaire";
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647',
    padding: '12px 20px',
    background: '#1b5e20',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
  });

  button.addEventListener('click', () => {
    const items = scrapeItems();
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = items.length > 0 ? `Import de ${items.length} article(s)...` : 'Aucun article détecté';

    chrome.runtime.sendMessage({ type: 'CHRONODRIVE_ITEMS_SCRAPED', items }, (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError) {
        button.textContent = 'Erreur import (voir popup)';
        console.error('[Inventaire] sendMessage failed', chrome.runtime.lastError);
      } else {
        button.textContent = response?.ok
          ? `${response.count ?? items.length} article(s) importé(s)`
          : "Échec de l'import (voir popup)";
      }
      setTimeout(() => {
        button.textContent = previousLabel;
      }, 4000);
    });
  });

  document.body.appendChild(button);
}

// L'extraction est déclenchée à la demande (clic sur le bouton flottant) plutôt
// qu'automatiquement au chargement de la page : moins fragile face aux variations
// de DOM, et ça évite de pousser des données par accident sur une page qui n'est
// pas (ou pas encore) la page de panier/confirmation de commande.
injectImportButton();
