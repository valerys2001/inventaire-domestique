import { describe, expect, it } from 'vitest';
import { parseQuantity, suggestCategory, type OpenFactsProduct } from './productLookup';

describe('parseQuantity', () => {
  it('parse un pack "6 x 1.5 l" en 6 contenants de 1.5 L (delta_pack = 9)', () => {
    const parsed = parseQuantity('6 x 1.5 l');
    expect(parsed).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
  });

  it('parse un pack compact sans espaces "2x125g"', () => {
    const parsed = parseQuantity('2x125g');
    expect(parsed).toEqual({
      contenanceUnitaire: 125,
      unite: 'g',
      nombreContenants: 2,
      deltaPack: 250,
    });
  });

  it('parse une contenance simple "1.5 l" sans info de pack', () => {
    const parsed = parseQuantity('1.5 l');
    expect(parsed).toEqual({ contenanceUnitaire: 1.5, unite: 'l' });
  });

  it('convertit cl et ml en litres', () => {
    expect(parseQuantity('33 cl')).toEqual({ contenanceUnitaire: 0.33, unite: 'l' });
    expect(parseQuantity('500 ml')).toEqual({ contenanceUnitaire: 0.5, unite: 'l' });
  });

  it('convertit kg en grammes', () => {
    expect(parseQuantity('1.5 kg')).toEqual({ contenanceUnitaire: 1500, unite: 'g' });
  });

  it('accepte la virgule decimale francaise', () => {
    expect(parseQuantity('1,5 l')).toEqual({ contenanceUnitaire: 1.5, unite: 'l' });
  });

  it('un nombre sans poids/volume reconnu devient un lot de N unités, pas un contenant de taille N', () => {
    // Ex: papier toilette "12 rouleaux" -> 12 rouleaux qu'on peut retirer un par un, pas UN
    // article géant de "taille 12".
    expect(parseQuantity('4')).toEqual({
      contenanceUnitaire: 1,
      unite: 'unite',
      nombreContenants: 4,
      deltaPack: 4,
    });
    expect(parseQuantity('12 rouleaux')).toEqual({
      contenanceUnitaire: 1,
      unite: 'unite',
      nombreContenants: 12,
      deltaPack: 12,
    });
  });

  it('tolère "×" et "*" comme séparateur de pack, et le préfixe "Pack de"/"Lot de"', () => {
    expect(parseQuantity('6×1,5l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
    expect(parseQuantity('6*1,5l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
    expect(parseQuantity('Pack de 6 x 1,5 l')).toEqual({
      contenanceUnitaire: 1.5,
      unite: 'l',
      nombreContenants: 6,
      deltaPack: 9,
    });
  });

  it('renvoie null pour un format non reconnu', () => {
    expect(parseQuantity('lot de plusieurs')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });

  it('renvoie null pour une contenance nulle ou negative', () => {
    expect(parseQuantity('0 l')).toBeNull();
    expect(parseQuantity('-1 l')).toBeNull();
  });

  it('renvoie null pour un pack avec un nombre de contenants nul', () => {
    expect(parseQuantity('0 x 1.5 l')).toBeNull();
  });
});

function product(overrides: Partial<OpenFactsProduct> = {}): OpenFactsProduct {
  return { product_name: null, brands: null, quantity: null, ...overrides };
}

describe('suggestCategory', () => {
  it('classe une eau en boissons via le champ categories en français accentué (pas de tags structurés)', () => {
    // Cas réel : produit mal tagué sur Open Food Facts, seul le champ libre `categories` existe,
    // et il est en français ("Eaux de source" contient un accent sur "Épicerie" par ex ailleurs).
    expect(suggestCategory('open-food-facts', product({ categories: 'Boissons, Eaux, Eaux de source' }))).toBe(
      'boissons',
    );
  });

  it('classe un vin en boissons sans confondre avec du vinaigre', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Boissons alcoolisées, Vins, Vins rouges' }))).toBe(
      'boissons',
    );
    expect(suggestCategory('open-food-facts', product({ categories: 'Condiments, Vinaigres' }))).not.toBe('boissons');
  });

  it('ne confond pas une salade (frais/légume) avec de l\'épicerie salée', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Salades, Légumes' }))).not.toBe('epicerie_salee');
  });

  it('ne confond pas du veau (viande) avec de l\'eau', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Viandes, Veau' }))).not.toBe('boissons');
  });

  it('classe via les tags structurés categories_tags (anglais, langue-préfixée)', () => {
    expect(
      suggestCategory('open-food-facts', product({ categories_tags: ['en:beverages', 'en:waters', 'en:spring-waters'] })),
    ).toBe('boissons');
  });

  it('classe un thé en "Thés" plutôt qu\'en "Boissons", même tagué comme sous-catégorie de beverages', () => {
    expect(
      suggestCategory(
        'open-food-facts',
        product({ categories_tags: ['en:beverages', 'en:hot-beverages', 'en:teas'] }),
      ),
    ).toBe('thes');
    expect(suggestCategory('open-food-facts', product({ categories: 'Boissons chaudes, Thés, Thés verts' }))).toBe(
      'thes',
    );
  });

  it('classe une infusion/tisane en "Thés"', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Infusions, Tisanes, Camomille' }))).toBe('thes');
  });

  it('classe un café en "Cafés" plutôt qu\'en "Boissons", même tagué comme sous-catégorie de beverages', () => {
    expect(
      suggestCategory(
        'open-food-facts',
        product({ categories_tags: ['en:beverages', 'en:hot-beverages', 'en:coffees'] }),
      ),
    ).toBe('cafes');
    expect(suggestCategory('open-food-facts', product({ categories: 'Boissons chaudes, Cafés, Cafés moulus' }))).toBe(
      'cafes',
    );
  });

  it('classe un café en dosettes/capsules en "Cafés"', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Cafés, Capsules de café, Espresso' }))).toBe(
      'cafes',
    );
  });

  it('classe une épice en "Épices" plutôt qu\'en "Épicerie salée", même taguée comme condiment', () => {
    expect(
      suggestCategory('open-food-facts', product({ categories_tags: ['en:condiments', 'en:spices', 'en:pepper'] })),
    ).toBe('epices');
    expect(suggestCategory('open-food-facts', product({ categories: 'Condiments, Épices, Poivres' }))).toBe('epices');
  });

  it("ne confond pas Épicerie (fine/salée/sucrée) avec Épices via le préfixe partagé", () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Épicerie salée, Pâtes, Riz' }))).not.toBe(
      'epices',
    );
    expect(suggestCategory('open-food-facts', product({ categories: 'Épicerie fine, Foie gras' }))).not.toBe('epices');
  });

  it('classe un produit entretien via mots-clés français (lessive, nettoyant)', () => {
    expect(suggestCategory('open-products-facts', product({ categories: 'Entretien de la maison, Lessives' }))).toBe(
      'produits_entretien',
    );
  });

  it('classe un produit hygiène via mots-clés français (savon, shampooing)', () => {
    expect(suggestCategory('open-beauty-facts', product({ categories: 'Hygiène, Savons' }))).toBe(
      'cosmetiques_hygiene',
    );
  });

  it('renvoie null quand aucun indice ne matche', () => {
    expect(suggestCategory('open-food-facts', product({ categories: 'Un texte quelconque sans rapport' }))).toBeNull();
  });
});
