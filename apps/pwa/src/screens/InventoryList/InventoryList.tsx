import { useMemo } from 'react';
import { CATEGORY_LABELS, DEFAULT_LOW_STOCK_THRESHOLD, UNIT_LABELS, type InventoryLine } from '@inventaire/shared';
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

  const visibleLines = useMemo(() => {
    const filtered = filterCategory === 'toutes' ? lines : lines.filter((l) => l.categorie === filterCategory);
    return [...filtered].sort((a, b) => {
      if (a.categorie !== b.categorie) return a.categorie.localeCompare(b.categorie);
      return a.nom.localeCompare(b.nom);
    });
  }, [lines, filterCategory]);

  return (
    <div className="inventory-list">
      <header className="inventory-list__header">
        <h1>Inventaire</h1>
        {pendingCount > 0 && (
          <span className="inventory-list__pending" title="Opérations en attente de synchronisation">
            {pendingCount} en attente
          </span>
        )}
      </header>

      <CategoryFilter value={filterCategory} onChange={setFilterCategory} />

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
                    {line.quantite_totale} {UNIT_LABELS[line.unite]}
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
