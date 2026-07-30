import { useMemo, useState } from 'react';
import {
  CATEGORY_LABELS,
  formatQuantityDetailed,
  groupLiquidLines,
  matchesSearch,
  UNIT_LABELS,
  type ListeCoursesItem,
} from '@inventaire/shared';
import { LiquidFolders } from '../../components/LiquidFolders/LiquidFolders';
import { SearchBox } from '../../components/SearchBox/SearchBox';
import { UnitSelector } from '../../components/UnitSelector/UnitSelector';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/ListeCourses.css';

export function ListeCourses() {
  const listeCourses = useInventoryStore((s) => s.listeCourses);
  const listeCoursesLoading = useInventoryStore((s) => s.listeCoursesLoading);
  const listeCoursesError = useInventoryStore((s) => s.listeCoursesError);
  const updateShoppingListItem = useInventoryStore((s) => s.updateShoppingListItem);
  const deleteShoppingList = useInventoryStore((s) => s.deleteShoppingList);
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // quantite à 0 = retiré de la liste (pas de suppression de ligne côté Sheet, plus simple).
  const activeItems = useMemo(() => listeCourses.filter((item) => item.quantite > 0), [listeCourses]);
  // Filtré par recherche, pour l'affichage uniquement : les actions "Éditer"/"Supprimer" ci-dessous
  // portent sur toute la liste, pas seulement ce qui matche la recherche du moment.
  const visibleItems = useMemo(
    () =>
      [...activeItems]
        .filter((item) => matchesSearch(searchQuery, item.nom, item.marque))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [activeItems, searchQuery],
  );

  // Le regroupement par dossier (groupLiquidLines) reste volontairement réservé aux liquides
  // (décision produit distincte, pas encore étendue aux solides conditionnés) ; le mode
  // "contenants + précis" de l'éditeur de quantité, lui, s'applique aussi au 'g' ci-dessous.
  const otherItems = useMemo(() => visibleItems.filter((item) => item.unite !== 'l'), [visibleItems]);
  const liquidFolders = useMemo(
    () => groupLiquidLines(visibleItems.filter((item) => item.unite === 'l')),
    [visibleItems],
  );

  const handleDelete = () => {
    if (confirm('Supprimer toute la liste de courses ?')) {
      void deleteShoppingList();
      setEditing(false);
    }
  };

  const renderItem = (item: ListeCoursesItem) => (
    <li key={item.id} className="liste-courses__item">
      <div className="liste-courses__item-main">
        <span className="liste-courses__item-name">{item.nom}</span>
        {item.marque && <span className="liste-courses__item-brand">{item.marque}</span>}
      </div>
      <span className="liste-courses__item-category">{CATEGORY_LABELS[item.categorie]}</span>
      {editing ? (
        <UnitSelector
          unite={item.unite}
          value={item.quantite}
          contenanceUnitaire={item.contenance_unitaire ?? undefined}
          baseValue={item.unite === 'l' || item.unite === 'g' ? 0 : undefined}
          onChange={(value) => updateShoppingListItem(item.id, value)}
        />
      ) : (
        <span className="liste-courses__item-qty">
          {item.unite === 'l' || item.unite === 'g'
            ? formatQuantityDetailed(item.quantite, item.contenance_unitaire ?? 0, item.unite)
            : `${item.quantite} ${UNIT_LABELS[item.unite]}`}
        </span>
      )}
    </li>
  );

  return (
    <div className="liste-courses">
      <h1>Liste de courses</h1>

      {activeItems.length > 0 && (
        <div className="liste-courses__actions">
          <button type="button" className="liste-courses__action" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Terminer l\'édition' : 'Éditer la liste'}
          </button>
          <button type="button" className="liste-courses__action liste-courses__action--danger" onClick={handleDelete}>
            Supprimer la liste
          </button>
        </div>
      )}

      {listeCoursesError && <p className="liste-courses__error">{listeCoursesError}</p>}
      {listeCoursesLoading && <p className="liste-courses__hint">Mise à jour…</p>}

      {activeItems.length > 0 && <SearchBox value={searchQuery} onChange={setSearchQuery} />}

      <LiquidFolders folders={liquidFolders} renderItem={renderItem} />

      <ul className="liste-courses__items">
        {otherItems.map(renderItem)}
        {visibleItems.length === 0 && (
          <li className="liste-courses__empty">
            {activeItems.length === 0
              ? 'Aucune liste en cours. Va dans Inventaire → "Construction de liste" pour en créer une.'
              : 'Aucun article ne correspond à la recherche.'}
          </li>
        )}
      </ul>
    </div>
  );
}
