import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  DEFAULT_LOW_STOCK_THRESHOLD,
  formatQuantityDetailed,
  type InventoryLine,
} from '@inventaire/shared';
import { CategoryFilter } from '../../components/CategoryFilter/CategoryFilter';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/InventoryList.css';

interface InventoryListProps {
  onSelectLine: (cleFusion: string) => void;
}

function isLowStock(line: InventoryLine): boolean {
  const threshold = line.seuil_alerte ?? DEFAULT_LOW_STOCK_THRESHOLD[line.unite];
  return line.quantite_totale <= threshold;
}

export function InventoryList({ onSelectLine }: InventoryListProps) {
  const lines = useInventoryStore((s) => s.lines);
  const filterCategory = useInventoryStore((s) => s.filterCategory);
  const setFilterCategory = useInventoryStore((s) => s.setFilterCategory);
  const pendingCount = useInventoryStore((s) => s.pendingCount);
  const syncNow = useInventoryStore((s) => s.syncNow);
  const syncing = useInventoryStore((s) => s.syncing);
  // Un article à 0 (épuisé, ou fruit/légume pré-créé jamais encore acheté) noierait la liste s'il
  // restait affiché en permanence : masqué par défaut, avec une reprise possible en un clic.
  const [showZero, setShowZero] = useState(false);

  const categoryLines = useMemo(
    () => (filterCategory === 'toutes' ? lines : lines.filter((l) => l.categorie === filterCategory)),
    [lines, filterCategory],
  );

  const zeroCount = useMemo(() => categoryLines.filter((l) => l.quantite_totale === 0).length, [categoryLines]);

  const visibleLines = useMemo(() => {
    const filtered = showZero ? categoryLines : categoryLines.filter((l) => l.quantite_totale > 0);
    return [...filtered].sort((a, b) => {
      if (a.categorie !== b.categorie) return a.categorie.localeCompare(b.categorie);
      return a.nom.localeCompare(b.nom);
    });
  }, [categoryLines, showZero]);

  return (
    <div className="inventory-list">
      <header className="inventory-list__header">
        <h1>Inventaire</h1>
        {pendingCount > 0 && (
          <span className="inventory-list__pending" title="Opérations en attente de synchronisation">
            {pendingCount} en attente
          </span>
        )}
        <button
          type="button"
          className="inventory-list__refresh"
          onClick={() => syncNow({ interactive: true })}
          disabled={syncing}
          aria-label="Rafraîchir l'inventaire"
        >
          {syncing ? '…' : '⟳'}
        </button>
      </header>

      <CategoryFilter value={filterCategory} onChange={setFilterCategory} />

      {zeroCount > 0 && (
        <button type="button" className="inventory-list__toggle-zero" onClick={() => setShowZero((v) => !v)}>
          {showZero ? 'Masquer les articles épuisés' : `Afficher les articles épuisés (${zeroCount})`}
        </button>
      )}

      <ul className="inventory-list__items">
        {visibleLines.map((line) => {
          const low = isLowStock(line);
          return (
            <li key={line.id}>
              <button type="button" className="inventory-list__item" onClick={() => onSelectLine(line.cle_fusion)}>
                <div className="inventory-list__item-main">
                  <span className="inventory-list__item-name">{line.nom}</span>
                  <span className="inventory-list__item-brand">{line.marque}</span>
                </div>
                <div className="inventory-list__item-meta">
                  <span className="inventory-list__item-category">{CATEGORY_LABELS[line.categorie]}</span>
                  <span className={`inventory-list__item-qty${low ? ' inventory-list__item-qty--low' : ''}`}>
                    {formatQuantityDetailed(line.quantite_totale, line.contenance_unitaire, line.unite)}
                    {low && <span className="inventory-list__badge">Stock bas</span>}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {visibleLines.length === 0 && <li className="inventory-list__empty">Aucun produit dans cette catégorie.</li>}
      </ul>
    </div>
  );
}
