import type { Category } from '@inventaire/shared';

/**
 * Fruits/légumes n'ont généralement pas de code-barre exploitable à l'unité (vente en vrac/au
 * poids), donc le scan ne fonctionne pas bien pour eux. Les pré-lister à quantité zéro permet de
 * les incrémenter directement depuis le sélecteur de produits existants plutôt que de devoir les
 * recréer à la main à chaque fois. Sélection pensée pour couvrir cuisine française ET italienne
 * (d'où des légumes comme l'aubergine, le fenouil, la roquette ou le basilic, très présents en
 * cuisine italienne mais parfois oubliés d'une liste franco-centrée).
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
  { nom: 'Framboise', categorie: 'fruits' },
  { nom: 'Myrtille', categorie: 'fruits' },
  { nom: 'Citron', categorie: 'fruits' },
  { nom: 'Citron vert', categorie: 'fruits' },
  { nom: 'Pamplemousse', categorie: 'fruits' },
  { nom: 'Clémentine', categorie: 'fruits' },
  { nom: 'Mandarine', categorie: 'fruits' },
  { nom: 'Kiwi', categorie: 'fruits' },
  { nom: 'Raisin', categorie: 'fruits' },
  { nom: 'Pêche', categorie: 'fruits' },
  { nom: 'Nectarine', categorie: 'fruits' },
  { nom: 'Abricot', categorie: 'fruits' },
  { nom: 'Prune', categorie: 'fruits' },
  { nom: 'Cerise', categorie: 'fruits' },
  { nom: 'Figue', categorie: 'fruits' },
  { nom: 'Grenade', categorie: 'fruits' },
  { nom: 'Ananas', categorie: 'fruits' },
  { nom: 'Mangue', categorie: 'fruits' },
  { nom: 'Pastèque', categorie: 'fruits' },
  { nom: 'Melon', categorie: 'fruits' },
  { nom: 'Carotte', categorie: 'legumes' },
  { nom: 'Pomme de terre', categorie: 'legumes' },
  { nom: 'Oignon', categorie: 'legumes' },
  { nom: 'Échalote', categorie: 'legumes' },
  { nom: 'Ail', categorie: 'legumes' },
  { nom: 'Tomate', categorie: 'legumes' },
  { nom: 'Courgette', categorie: 'legumes' },
  { nom: 'Aubergine', categorie: 'legumes' },
  { nom: 'Poivron', categorie: 'legumes' },
  { nom: 'Poireau', categorie: 'legumes' },
  { nom: 'Céleri', categorie: 'legumes' },
  { nom: 'Céleri-rave', categorie: 'legumes' },
  { nom: 'Fenouil', categorie: 'legumes' },
  { nom: 'Artichaut', categorie: 'legumes' },
  { nom: 'Épinard', categorie: 'legumes' },
  { nom: 'Salade', categorie: 'legumes' },
  { nom: 'Roquette', categorie: 'legumes' },
  { nom: 'Concombre', categorie: 'legumes' },
  { nom: 'Chou-fleur', categorie: 'legumes' },
  { nom: 'Brocoli', categorie: 'legumes' },
  { nom: 'Chou', categorie: 'legumes' },
  { nom: 'Chou de Bruxelles', categorie: 'legumes' },
  { nom: 'Champignon', categorie: 'legumes' },
  { nom: 'Haricot vert', categorie: 'legumes' },
  { nom: 'Petits pois', categorie: 'legumes' },
  { nom: 'Radis', categorie: 'legumes' },
  { nom: 'Betterave', categorie: 'legumes' },
  { nom: 'Navet', categorie: 'legumes' },
  { nom: 'Potiron', categorie: 'legumes' },
  { nom: 'Persil', categorie: 'legumes' },
  { nom: 'Basilic', categorie: 'legumes' },
  { nom: 'Ciboulette', categorie: 'legumes' },
];
