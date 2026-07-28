import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  DEFAULT_LOW_STOCK_THRESHOLD,
  formatQuantityDetailed,
  type InventoryLine,
} from '@inventaire/shared';
import { CategoryFilter } from '../../components/CategoryFilter/CategoryFilter';
import { UnitSelector } from '../../components/UnitSelector/UnitSelector';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/InventoryList.css';

interface InventoryListProps {
  onSelectLine: (cleFusion: string) => void;
  onListeGenerated?: () => void;
}

function isLowStock(line: InventoryLine): boolean {
  const threshold = line.seuil_alerte ?? DEFAULT_LOW_STOCK_THRESHOLD[line.unite];
  return line.quantite_totale <= threshold;
}

export function InventoryList({ onSelectLine, onListeGenerated }: InventoryListProps) {
  const lines = useInventoryStore((s) => s.lines);
  const filterCategory = useInventoryStore((s) => s.filterCategory);
  const setFilterCategory = useInventoryStore((s) => s.setFilterCategory);
  const pendingCount = useInventoryStore((s) => s.pendingCount);
  const syncNow = useInventoryStore((s) => s.syncNow);
  const syncing = useInventoryStore((s) => s.syncing);
  const updateTargetQuantity = useInventoryStore((s) => s.updateTargetQuantity);
  const generateShoppingList = useInventoryStore((s) => s.generateShoppingList);
  const listeCoursesLoading = useInventoryStore((s) => s.listeCoursesLoading);
  const listeCoursesError = useInventoryStore((s) => s.listeCoursesError);
  // Un article à 0 (épuisé, ou fruit/légume pré-créé jamais encore acheté) noierait la liste s'il
  // restait affiché en permanence : masqué par défaut, avec une reprise possible en un clic.
  const [showZero, setShowZero] = useState(false);
  // Mode "Construction de liste" : quiconque peut l'activer, ajuster des quantités cibles
  // (partagées, cf. quantite_cible) tout en naviguant par catégorie comme d'habitude, puis
  // générer l'écart en liste de courses. Montre tous les produits, y compris ceux à 0.
  const [buildMode, setBuildMode] = useState(false);

  const categoryLines = useMemo(
    () => (filterCategory === 'toutes' ? lines : lines.filter((l) => l.categorie === filterCategory)),
    [lines, filterCategory],
  );

  const zeroCount = useMemo(() => categoryLines.filter((l) => l.quantite_totale === 0).length, [categoryLines]);

  const visibleLines = useMemo(() => {
    const filtered = buildMode || showZero ? categoryLines : categoryLines.filter((l) => l.quantite_totale > 0);
    return [...filtered].sort((a, b) => {
      if (a.categorie !== b.categorie) return a.categorie.localeCompare(b.categorie);
      return a.nom.localeCompare(b.nom);
    });
  }, [categoryLines, showZero, buildMode]);

  const pendingTargetsCount = useMemo(
    () => lines.filter((l) => l.quantite_cible !== null && l.quantite_cible > l.quantite_totale).length,
    [lines],
  );

  const handleGenerate = async () => {
    await generateShoppingList();
    setBuildMode(false);
    onListeGenerated?.();
  };

  return (
    <div className="inventory-list">
      <header className="inventory-list__header">
        <h1>{buildMode ? 'Construction de liste' : 'Inventaire'}</h1>
        {!buildMode && pendingCount > 0 && (
          <span className="inventory-list__pending" title="Opérations en attente de synchronisation">
            {pendingCount} en attente
          </span>
        )}
        {!buildMode && (
          <button
            type="button"
            className="inventory-list__refresh"
            onClick={() => syncNow({ interactive: true })}
            disabled={syncing}
            aria-label="Rafraîchir l'inventaire"
          >
            {syncing ? '…' : '⟳'}
          </button>
        )}
        <button
          type="button"
          className={`inventory-list__build-toggle${buildMode ? ' inventory-list__build-toggle--active' : ''}`}
          onClick={() => setBuildMode((v) => !v)}
        >
          {buildMode ? 'Quitter' : 'Construction de liste'}
        </button>
      </header>

      {buildMode && (
        <p className="inventory-list__build-hint">
          Ajustez les quantités souhaitées ; "Générer la liste" créera les articles manquants dans la liste de
          courses (écart entre la cible et le stock actuel).
        </p>
      )}

      <CategoryFilter value={filterCategory} onChange={setFilterCategory} />

      {!buildMode && zeroCount > 0 && (
        <button type="button" className="inventory-list__toggle-zero" onClick={() => setShowZero((v) => !v)}>
          {showZero ? 'Masquer les articles épuisés' : `Afficher les articles épuisés (${zeroCount})`}
        </button>
      )}

      <ul className="inventory-list__items">
        {visibleLines.map((line) => {
          const low = isLowStock(line);

          if (buildMode) {
            const target = line.quantite_cible ?? line.quantite_totale;
            return (
              <li key={line.id} className="inventory-list__build-item">
                <div className="inventory-list__item-main">
                  <span className="inventory-list__item-name">{line.nom}</span>
                  <span className="inventory-list__item-brand">{line.marque}</span>
                </div>
                <p className="inventory-list__build-current">
                  Actuel : {formatQuantityDetailed(line.quantite_totale, line.contenance_unitaire, line.unite)}
                </p>
                <UnitSelector
                  unite={line.unite}
                  value={target}
                  contenanceUnitaire={line.contenance_unitaire}
                  baseValue={line.quantite_totale}
                  onChange={(value) => updateTargetQuantity(line.cle_fusion, value === line.quantite_totale ? null : value)}
                />
                {target > line.quantite_totale && (
                  <p className="inventory-list__build-diff">
                    + {formatQuantityDetailed(target - line.quantite_totale, line.contenance_unitaire, line.unite)} à
                    acheter
                  </p>
                )}
              </li>
            );
          }

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

      {buildMode && (
        <div className="inventory-list__build-footer">
          <button
            type="button"
            className="inventory-list__generate"
            onClick={handleGenerate}
            disabled={pendingTargetsCount === 0 || listeCoursesLoading}
          >
            {listeCoursesLoading
              ? 'Génération…'
              : pendingTargetsCount > 0
                ? `Générer la liste (${pendingTargetsCount})`
                : 'Générer la liste'}
          </button>
          {listeCoursesError && <p className="inventory-list__build-error">{listeCoursesError}</p>}
        </div>
      )}
    </div>
  );
}
