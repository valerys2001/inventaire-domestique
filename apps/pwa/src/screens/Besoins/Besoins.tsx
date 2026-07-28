import { useMemo } from 'react';
import {
  CATEGORY_LABELS,
  formatQuantityDetailed,
  groupLiquidLines,
  stockComparableQuantity,
  UNIT_LABELS,
  type InventoryLine,
} from '@inventaire/shared';
import { LiquidFolders } from '../../components/LiquidFolders/LiquidFolders';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/Besoins.css';

export function Besoins() {
  const lines = useInventoryStore((s) => s.lines);
  const updateThreshold = useInventoryStore((s) => s.updateThreshold);

  // Opt-in uniquement : un seuil_alerte explicite (réglé depuis l'écran Sortie) signale que
  // l'utilisateur veut suivre ce produit ici, contrairement à l'indicateur "stock bas" générique
  // de l'inventaire qui s'applique à tout le monde via un seuil par défaut. Pour les liquides,
  // seuil_alerte et la comparaison se font en nombre de contenants, pas en litres.
  const needed = useMemo(
    () =>
      lines
        .filter((line) => line.seuil_alerte !== null && stockComparableQuantity(line) <= line.seuil_alerte)
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [lines],
  );

  const otherNeeded = useMemo(() => needed.filter((line) => line.unite !== 'l'), [needed]);
  const liquidFolders = useMemo(() => groupLiquidLines(needed), [needed]);

  const renderItem = (line: InventoryLine) => (
    <li key={line.id} className="besoins__item">
      <div className="besoins__item-main">
        <span className="besoins__item-name">{line.nom}</span>
        <span className="besoins__item-brand">{line.marque}</span>
      </div>
      <div className="besoins__item-meta">
        <span className="besoins__item-category">{CATEGORY_LABELS[line.categorie]}</span>
        <span className="besoins__item-qty">
          {formatQuantityDetailed(line.quantite_totale, line.contenance_unitaire, line.unite)} — seuil :{' '}
          {line.seuil_alerte} {line.unite === 'l' ? `contenant${(line.seuil_alerte ?? 0) > 1 ? 's' : ''}` : UNIT_LABELS[line.unite]}
        </span>
      </div>
      <button type="button" className="besoins__untrack" onClick={() => updateThreshold(line.cle_fusion, null)}>
        Retirer du suivi
      </button>
    </li>
  );

  return (
    <div className="besoins">
      <h1>Besoins</h1>
      <p className="besoins__hint">
        Produits suivis (seuil réglé depuis l'écran Sortie) actuellement épuisés ou sous leur seuil.
      </p>

      <LiquidFolders folders={liquidFolders} renderItem={renderItem} />

      <ul className="besoins__items">
        {otherNeeded.map(renderItem)}
        {needed.length === 0 && (
          <li className="besoins__empty">
            Rien à signaler. Réglez un seuil sur un produit depuis l'écran Sortie pour le suivre ici.
          </li>
        )}
      </ul>
    </div>
  );
}
