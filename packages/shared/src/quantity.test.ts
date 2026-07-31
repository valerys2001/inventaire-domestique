import { describe, expect, it } from 'vitest';
import {
  computeDeltaFromPack,
  formatContainerQuantity,
  formatQuantityDetailed,
  isLastContainerGauge,
  isLastContainerQuantity,
  resetNiveauDernierContenant,
  roundForDisplay,
} from './quantity';

describe('computeDeltaFromPack', () => {
  it('calcule 9 pour un pack de 6 bouteilles de 1.5 L', () => {
    expect(computeDeltaFromPack(6, 1.5)).toBe(9);
  });

  it('renvoie la contenance unitaire pour un achat unitaire simple (nombreContenants=1)', () => {
    expect(computeDeltaFromPack(1, 0.5)).toBe(0.5);
  });

  it('rejette une contenanceUnitaire nulle ou negative', () => {
    expect(() => computeDeltaFromPack(6, 0)).toThrow();
    expect(() => computeDeltaFromPack(6, -1)).toThrow();
  });

  it('rejette un nombreContenants nul ou negatif', () => {
    expect(() => computeDeltaFromPack(0, 1.5)).toThrow();
    expect(() => computeDeltaFromPack(-2, 1.5)).toThrow();
  });
});

describe('roundForDisplay', () => {
  it("corrige les erreurs d'arrondi flottant classiques (0.1 + 0.2)", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // rappel du probleme flottant sous-jacent
    expect(roundForDisplay(0.1 + 0.2)).toBe(0.3);
  });

  it('arrondit a 2 decimales', () => {
    expect(roundForDisplay(1.005)).toBeCloseTo(1, 2);
    expect(roundForDisplay(10.5)).toBe(10.5);
    expect(roundForDisplay(9.999)).toBe(10);
  });

  it('laisse les entiers inchanges', () => {
    expect(roundForDisplay(9)).toBe(9);
    expect(roundForDisplay(0)).toBe(0);
  });
});

describe('formatQuantityDetailed', () => {
  it('affiche le compte de contenants ET le total pour un liquide (2 bouteilles de 1.5 L = 3 L)', () => {
    expect(formatQuantityDetailed(3, 1.5, 'l')).toBe('2 contenants (3 litres)');
  });

  it("n'ajoute pas de détail quand l'unité est déjà le compte (unite/pourcent)", () => {
    expect(formatQuantityDetailed(4, 1, 'unite')).toBe('4 unité(s)');
    expect(formatQuantityDetailed(80, 100, 'pourcent')).toBe('80 % restant');
  });

  it("affiche 1 seul contenant (avec le total) quand il n'y en a qu'un", () => {
    expect(formatQuantityDetailed(1.5, 1.5, 'l')).toBe('1 contenant (1.5 litres)');
  });

  it('affiche le % du dernier contenant entamé, en plus du total, pour un liquide', () => {
    // 8.2 L restants sur des bouteilles de 1.5 L -> 5 pleins + dernier entamé à 47%
    expect(formatQuantityDetailed(8.2, 1.5, 'l')).toBe('6 contenants (8.2 litres, dernier à 47%)');
  });

  it("n'affiche rien de spécial pour une contenance non renseignée (0)", () => {
    expect(formatQuantityDetailed(3, 0, 'g')).toBe('3 grammes');
    expect(formatQuantityDetailed(3, 0, 'l')).toBe('3 litres');
  });

  it('affiche le compte de contenants ET le total pour un solide conditionné (3 plaques de 100 g = 300 g)', () => {
    expect(formatQuantityDetailed(300, 100, 'g')).toBe('3 contenants (300 grammes)');
  });

  it('affiche "1 contenant" (avec le total) même pour un seul gros contenant', () => {
    // Pot de fromage blanc 500 g : "1 contenant (500 grammes)", pas "500 grammes" tout seul.
    expect(formatQuantityDetailed(500, 500, 'g')).toBe('1 contenant (500 grammes)');
  });

  it('affiche le % du dernier contenant entamé, en plus du total, pour un solide conditionné', () => {
    expect(formatQuantityDetailed(200, 500, 'g')).toBe('1 contenant (200 grammes, dernier à 40%)');
  });
});

describe('formatContainerQuantity', () => {
  it('affiche toujours le compte de contenants ET le total, jamais l\'un sans l\'autre', () => {
    expect(formatContainerQuantity(9, 1.5, 'l')).toBe('6 contenants (9 litres)');
    expect(formatContainerQuantity(720, 60, 'g')).toBe('12 contenants (720 grammes)');
  });

  it('affiche "0 contenant (0 ...)" pour un stock vide', () => {
    expect(formatContainerQuantity(0, 1.5, 'l')).toBe('0 contenant (0 litres)');
  });

  it('compte le dernier contenant entamé même à un stock très bas', () => {
    expect(formatContainerQuantity(0.1, 1.5, 'l')).toBe('1 contenant (0.1 litres, dernier à 7%)');
  });

  it("le niveau cosmétique fourni prime sur le reste dérivé du stock réel (toujours un compte entier de contenants)", () => {
    // 1 contenant plein (compte réel, entier) mais niveau cosmétique mémorisé à 42% : le vrai
    // compte de contenants ne change jamais, seul le % affiché vient du niveau cosmétique.
    expect(formatContainerQuantity(1.5, 1.5, 'l', 42)).toBe('1 contenant (1.5 litres, dernier à 42%)');
  });

  it('niveau cosmétique null = non affiché, même sur le dernier contenant', () => {
    expect(formatContainerQuantity(1.5, 1.5, 'l', null)).toBe('1 contenant (1.5 litres)');
  });

  it('niveau cosmétique absent (undefined) : retombe sur le % dérivé du stock réel', () => {
    expect(formatContainerQuantity(0.1, 1.5, 'l')).toBe('1 contenant (0.1 litres, dernier à 7%)');
  });
});

describe('isLastContainerQuantity', () => {
  it("vrai quand il reste exactement un contenant (le cas d'usage du bug rapporté)", () => {
    expect(isLastContainerQuantity(1.5, 1.5)).toBe(true);
  });

  it('vrai pour un dernier contenant entamé (moins qu\'un contenant plein)', () => {
    expect(isLastContainerQuantity(0.5, 1.5)).toBe(true);
  });

  it("faux à 0 (plus aucun contenant) ou 2+ contenants (plus 'le dernier')", () => {
    expect(isLastContainerQuantity(0, 1.5)).toBe(false);
    expect(isLastContainerQuantity(3, 1.5)).toBe(false);
  });

  it('faux sans contenance renseignée', () => {
    expect(isLastContainerQuantity(1, 0)).toBe(false);
  });
});

describe('resetNiveauDernierContenant', () => {
  it('conserve le niveau tant qu\'il ne reste qu\'un seul contenant', () => {
    expect(resetNiveauDernierContenant(1.5, 1.5, 42)).toBe(42);
  });

  it("remet à null dès qu'un second contenant est acheté (plus plus 'le dernier')", () => {
    expect(resetNiveauDernierContenant(3, 1.5, 42)).toBeNull();
  });

  it('remet à null une fois le dernier contenant totalement épuisé (0 en stock)', () => {
    expect(resetNiveauDernierContenant(0, 1.5, 42)).toBeNull();
  });
});

describe('isLastContainerGauge', () => {
  const base = { categorie: 'boissons' as const, unite: 'l' as const, quantite_totale: 0.5, contenance_unitaire: 1.5 };

  it('vrai pour un dernier contenant entamé dans une catégorie éligible', () => {
    expect(isLastContainerGauge(base)).toBe(true);
  });

  it("faux pour une catégorie non éligible (ex: épicerie)", () => {
    expect(isLastContainerGauge({ ...base, categorie: 'epicerie_salee' })).toBe(false);
  });

  it("faux pour unite='unite' ou 'pourcent' (pas de notion de dernier contenant)", () => {
    expect(isLastContainerGauge({ ...base, unite: 'unite' })).toBe(false);
    expect(isLastContainerGauge({ ...base, unite: 'pourcent' })).toBe(false);
  });

  it("faux dès qu'il reste 2 contenants ou plus", () => {
    expect(isLastContainerGauge({ ...base, quantite_totale: 3 })).toBe(false);
  });

  it("vrai pour la catégorie 'thes' (ex: dernier paquet de thé vert menthe entamé)", () => {
    expect(isLastContainerGauge({ ...base, categorie: 'thes', unite: 'g', contenance_unitaire: 100, quantite_totale: 30 })).toBe(
      true,
    );
  });

  it("vrai pour la catégorie 'cafes' (ex: dernier paquet de café entamé)", () => {
    expect(
      isLastContainerGauge({ ...base, categorie: 'cafes', unite: 'g', contenance_unitaire: 250, quantite_totale: 80 }),
    ).toBe(true);
  });

  it("vrai pour la catégorie 'epices' (ex: dernier pot d'épices entamé)", () => {
    expect(
      isLastContainerGauge({ ...base, categorie: 'epices', unite: 'g', contenance_unitaire: 40, quantite_totale: 10 }),
    ).toBe(true);
  });
});
