/**
 * Scraper de la page "Détail du panier" Chronodrive.
 *
 * Sélecteurs vérifiés contre le DOM réel (inspection manuelle, juillet 2026) :
 *   <div class="product-group-wrapper">
 *     <div class="product-group ...">
 *       <div class="product-group-content">
 *         <article data-id="518523" class="product-card ..." aria-label="AUCHAN Pavés de saumon">
 *           <div class="card-inner">
 *             <a href="/auchan--paves-de-saumon-P518523" class="card-content-link">
 *               <div class="card-main">
 *                 <div class="infos">
 *                   <span class="info"><span class="label">Poids ou quantité :</span><b>4 x 125 g</b></span>
 *
 * Point non vérifié : ce "Poids ou quantité" décrit le conditionnement du PRODUIT
 * (ex. une boîte de 4x125g), pas forcément le nombre de boîtes commandées si le
 * client en a pris plusieurs — à confirmer si un champ de quantité commandée
 * distinct existe ailleurs sur la carte (ex. dans .card-extra, non inspecté).
 * Chronodrive peut aussi présenter le DOM différemment sur d'autres écrans
 * (panier en cours vs historique de commande passée) : à revérifier si besoin.
 */

interface ScrapedItem {
  nom: string;
  marque?: string;
  /** Texte brut du champ "Poids ou quantité" (ex. "4 x 125 g"), parsé côté background via @inventaire/shared. */
  quantityRaw?: string;
}

const PRODUCT_CARD_SELECTOR = '.product-group-wrapper article.product-card[data-id]';
// Repli si la page n'a pas (ou plus) le conteneur ".product-group-wrapper" attendu.
const FALLBACK_PRODUCT_CARD_SELECTOR = 'article.product-card[data-id]';

function findProductCards(): HTMLElement[] {
  const scoped = Array.from(document.querySelectorAll<HTMLElement>(PRODUCT_CARD_SELECTOR));
  if (scoped.length > 0) return scoped;
  return Array.from(document.querySelectorAll<HTMLElement>(FALLBACK_PRODUCT_CARD_SELECTOR));
}

/**
 * `aria-label` du <article> donne le nom complet affiché (ex. "AUCHAN Pavés de saumon").
 * Le href de la fiche produit (ex. "/auchan--paves-de-saumon-P518523") sépare marque et nom
 * par un double-tiret : on s'en sert pour couper aria-label au bon endroit avec la bonne casse,
 * plutôt que de deviner un séparateur dans le texte affiché (qui n'en a pas).
 */
function extractNameAndBrand(card: HTMLElement): { nom: string; marque?: string } {
  const fullLabel = card.getAttribute('aria-label')?.trim() ?? '';
  const href = card.querySelector<HTMLAnchorElement>('a.card-content-link')?.getAttribute('href') ?? '';
  const slug = href.split('/').filter(Boolean).pop() ?? '';
  const brandSlug = slug.split('--')[0] ?? '';
  const brandGuess = brandSlug.replace(/-/g, ' ').trim();

  if (brandGuess && fullLabel.toLowerCase().startsWith(brandGuess.toLowerCase())) {
    return {
      marque: fullLabel.slice(0, brandGuess.length).trim(),
      nom: fullLabel.slice(brandGuess.length).trim(),
    };
  }

  // Le slug ne correspond pas au début du libellé (structure de page différente) : on
  // renvoie tout comme nom plutôt que de risquer de couper le texte au mauvais endroit.
  return { nom: fullLabel };
}

/** Repère le bloc ".info" dont le label est "Poids ou quantité" (il peut y en avoir d'autres). */
function extractQuantityRaw(card: HTMLElement): string | undefined {
  const infoSpans = Array.from(card.querySelectorAll('.infos .info'));
  for (const span of infoSpans) {
    const label = span.querySelector('.label')?.textContent ?? '';
    if (/quantit|poids/i.test(label)) {
      const value = span.querySelector('b')?.textContent?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function scrapeItems(): ScrapedItem[] {
  const cards = findProductCards();
  const items: ScrapedItem[] = [];

  for (const card of cards) {
    const { nom, marque } = extractNameAndBrand(card);
    if (!nom) continue; // carte inattendue (structure différente) : on l'ignore plutôt que d'importer une ligne vide

    items.push({ nom, marque, quantityRaw: extractQuantityRaw(card) });
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
