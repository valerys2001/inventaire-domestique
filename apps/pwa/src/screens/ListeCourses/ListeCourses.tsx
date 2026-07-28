import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, UNIT_LABELS } from '@inventaire/shared';
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

  // quantite à 0 = retiré de la liste (pas de suppression de ligne côté Sheet, plus simple).
  const visibleItems = useMemo(
    () => [...listeCourses].filter((item) => item.quantite > 0).sort((a, b) => a.nom.localeCompare(b.nom)),
    [listeCourses],
  );

  const handleDelete = () => {
    if (confirm('Supprimer toute la liste de courses ?')) {
      void deleteShoppingList();
      setEditing(false);
    }
  };

  return (
    <div className="liste-courses">
      <h1>Liste de courses</h1>

      {visibleItems.length > 0 && (
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

      <ul className="liste-courses__items">
        {visibleItems.map((item) => (
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
                onChange={(value) => updateShoppingListItem(item.id, value)}
              />
            ) : (
              <span className="liste-courses__item-qty">
                {item.quantite} {UNIT_LABELS[item.unite]}
              </span>
            )}
          </li>
        ))}
        {visibleItems.length === 0 && (
          <li className="liste-courses__empty">
            Aucune liste en cours. Va dans Inventaire → "Construction de liste" pour en créer une.
          </li>
        )}
      </ul>
    </div>
  );
}
