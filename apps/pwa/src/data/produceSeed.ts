import type { Category } from '@inventaire/shared';

/**
 * Fruits/légumes n'ont généralement pas de code-barre exploitable à l'unité (vente en vrac/au
 * poids), donc le scan ne fonctionne pas bien pour eux. Les pré-lister à quantité zéro permet de
 * les incrémenter directement depuis le sélecteur de produits existants plutôt que de devoir les
 * recréer à la main à chaque fois.
 */
export interface ProduceSeedItem {
  nom: string;
  categorie: Category;
}

export const PRODUCE_SEED: ProduceSeedItem[] = [
  { nom: 'Pomme', categorie: 'fruits' },
  { nom: 'Banane', categorie: 'fruits' },
  { nom: 'Orange', categorie: 'fruits' },
  { nom: 'Poire', categorie: 'fruits' },
  { nom: 'Fraise', categorie: 'fruits' },
  { nom: 'Citron', categorie: 'fruits' },
  { nom: 'Kiwi', categorie: 'fruits' },
  { nom: 'Raisin', categorie: 'fruits' },
  { nom: 'Pêche', categorie: 'fruits' },
  { nom: 'Abricot', categorie: 'fruits' },
  { nom: 'Ananas', categorie: 'fruits' },
  { nom: 'Mangue', categorie: 'fruits' },
  { nom: 'Pastèque', categorie: 'fruits' },
  { nom: 'Melon', categorie: 'fruits' },
  { nom: 'Cerise', categorie: 'fruits' },
  { nom: 'Carotte', categorie: 'legumes' },
  { nom: 'Pomme de terre', categorie: 'legumes' },
  { nom: 'Oignon', categorie: 'legumes' },
  { nom: 'Tomate', categorie: 'legumes' },
  { nom: 'Courgette', categorie: 'legumes' },
  { nom: 'Poireau', categorie: 'legumes' },
  { nom: 'Salade', categorie: 'legumes' },
  { nom: 'Concombre', categorie: 'legumes' },
  { nom: 'Poivron', categorie: 'legumes' },
  { nom: 'Ail', categorie: 'legumes' },
  { nom: 'Chou-fleur', categorie: 'legumes' },
  { nom: 'Brocoli', categorie: 'legumes' },
  { nom: 'Champignon', categorie: 'legumes' },
  { nom: 'Aubergine', categorie: 'legumes' },
  { nom: 'Haricot vert', categorie: 'legumes' },
];
