import { useMemo, useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  formatContainerQuantity,
  UNITS,
  UNIT_LABELS,
  type Category,
  type InventoryLine,
  type Unit,
} from '@inventaire/shared';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/ArticleManager.css';

interface ArticleFormValues {
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: string;
  unite: Unit;
  quantite_totale: string;
  nombre_contenants_defaut: string;
}

const EMPTY_FORM: ArticleFormValues = {
  nom: '',
  marque: '',
  categorie: CATEGORIES[0],
  contenance_unitaire: '1',
  unite: 'unite',
  quantite_totale: '0',
  nombre_contenants_defaut: '',
};

function lineToFormValues(line: InventoryLine): ArticleFormValues {
  return {
    nom: line.nom,
    marque: line.marque,
    categorie: line.categorie,
    contenance_unitaire: String(line.contenance_unitaire),
    unite: line.unite,
    quantite_totale: String(line.quantite_totale),
    nombre_contenants_defaut: line.nombre_contenants_defaut !== null ? String(line.nombre_contenants_defaut) : '',
  };
}

interface ParsedArticle {
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: number;
  unite: Unit;
  quantite_totale: number;
  nombre_contenants_defaut: number | null;
}

function parseForm(values: ArticleFormValues): { ok: true; value: ParsedArticle } | { ok: false; error: string } {
  if (!values.nom.trim()) return { ok: false, error: 'Le nom est obligatoire.' };
  const contenance_unitaire = Number(values.contenance_unitaire.replace(',', '.'));
  if (!(contenance_unitaire > 0)) return { ok: false, error: 'La contenance doit être un nombre positif.' };
  const quantite_totale = Number(values.quantite_totale.replace(',', '.'));
  if (!(quantite_totale >= 0)) return { ok: false, error: 'La quantité ne peut pas être négative.' };

  let nombre_contenants_defaut: number | null = null;
  const nombreContenantsRaw = values.nombre_contenants_defaut.trim();
  if (nombreContenantsRaw !== '') {
    nombre_contenants_defaut = Number(nombreContenantsRaw.replace(',', '.'));
    if (!(nombre_contenants_defaut > 0)) {
      return { ok: false, error: 'Le nombre de contenants mémorisé doit être un nombre positif (ou vide).' };
    }
  }

  return {
    ok: true,
    value: {
      nom: values.nom.trim(),
      marque: values.marque.trim(),
      categorie: values.categorie,
      contenance_unitaire,
      unite: values.unite,
      quantite_totale,
      nombre_contenants_defaut,
    },
  };
}

interface ArticleFieldsProps {
  values: ArticleFormValues;
  onChange: (values: ArticleFormValues) => void;
  quantiteLabel: string;
}

function ArticleFields({ values, onChange, quantiteLabel }: ArticleFieldsProps) {
  const setField = <K extends keyof ArticleFormValues>(key: K, value: ArticleFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="article-manager__fields">
      <label className="article-manager__field">
        <span>Nom</span>
        <input type="text" value={values.nom} onChange={(e) => setField('nom', e.target.value)} />
      </label>
      <label className="article-manager__field">
        <span>Marque</span>
        <input type="text" value={values.marque} onChange={(e) => setField('marque', e.target.value)} />
      </label>
      <label className="article-manager__field">
        <span>Catégorie</span>
        <select value={values.categorie} onChange={(e) => setField('categorie', e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="article-manager__field-row">
        <label className="article-manager__field">
          <span>Contenance</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={values.contenance_unitaire}
            onChange={(e) => setField('contenance_unitaire', e.target.value)}
          />
        </label>
        <label className="article-manager__field">
          <span>Unité</span>
          <select value={values.unite} onChange={(e) => setField('unite', e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="article-manager__field">
        <span>{quantiteLabel}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={values.quantite_totale}
          onChange={(e) => setField('quantite_totale', e.target.value)}
        />
      </label>
      <label className="article-manager__field">
        <span>Nombre de contenants mémorisé pour ce code-barres (pack) — vide = non mémorisé</span>
        <input
          type="number"
          min={0}
          step="1"
          value={values.nombre_contenants_defaut}
          onChange={(e) => setField('nombre_contenants_defaut', e.target.value)}
          placeholder="ex: 6"
        />
      </label>
      {(values.unite === 'l' || values.unite === 'g') && Number(values.contenance_unitaire.replace(',', '.')) > 0 && (
        <p className="article-manager__hint">
          ≈{' '}
          {formatContainerQuantity(
            Number(values.quantite_totale.replace(',', '.')) || 0,
            Number(values.contenance_unitaire.replace(',', '.')),
            values.unite,
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Panneau "Modifier les articles" des réglages : corrige une erreur de première saisie (nom,
 * marque, catégorie, contenance, unité, stock) sur un produit déjà enregistré, en crée un
 * nouveau (réutilise applyEntry, donc fusionne silencieusement si un produit identique existe
 * déjà), ou en supprime un définitivement.
 */
export function ArticleManager() {
  const lines = useInventoryStore((s) => s.lines);
  const applyEntry = useInventoryStore((s) => s.applyEntry);
  const updateArticle = useInventoryStore((s) => s.updateArticle);
  const deleteArticle = useInventoryStore((s) => s.deleteArticle);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<ArticleFormValues>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ArticleFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? lines.filter((l) => `${l.nom} ${l.marque}`.toLowerCase().includes(q)) : lines;
    return [...filtered].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [lines, query]);

  const startEdit = (line: InventoryLine) => {
    setEditingId(line.id);
    setEditForm(lineToFormValues(line));
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleAdd = async () => {
    const parsed = parseForm(addForm);
    if (!parsed.ok) {
      setAddError(parsed.error);
      return;
    }
    setBusy(true);
    setAddError(null);
    try {
      await applyEntry({
        ...parsed.value,
        delta: parsed.value.quantite_totale,
        code_barre: null,
        nombre_contenants: parsed.value.nombre_contenants_defaut,
      });
      setAddForm(EMPTY_FORM);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const parsed = parseForm(editForm);
    if (!parsed.ok) {
      setEditError(parsed.error);
      return;
    }
    setBusy(true);
    setEditError(null);
    try {
      const result = await updateArticle(editingId, parsed.value);
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (line: InventoryLine) => {
    if (!confirm(`Supprimer définitivement "${line.nom} ${line.marque}" de l'inventaire ? Action irréversible.`)) {
      return;
    }
    setBusy(true);
    try {
      const result = await deleteArticle(line.id);
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      if (editingId === line.id) setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="article-manager">
      <button
        type="button"
        className="article-manager__add-toggle"
        onClick={() => {
          setAdding((v) => !v);
          setAddError(null);
        }}
      >
        {adding ? 'Annuler' : '+ Ajouter un article'}
      </button>

      {adding && (
        <div className="article-manager__add-form">
          <ArticleFields values={addForm} onChange={setAddForm} quantiteLabel="Quantité initiale" />
          {addError && <p className="article-manager__error">{addError}</p>}
          <button type="button" className="article-manager__save" onClick={handleAdd} disabled={busy}>
            Créer
          </button>
        </div>
      )}

      <input
        type="search"
        className="article-manager__search"
        placeholder="Rechercher un produit…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="article-manager__list">
        {filteredLines.map((line) => (
          <li key={line.id} className="article-manager__item">
            {editingId === line.id ? (
              <>
                <ArticleFields values={editForm} onChange={setEditForm} quantiteLabel="Quantité en stock" />
                {editError && <p className="article-manager__error">{editError}</p>}
                <div className="article-manager__item-actions">
                  <button type="button" className="article-manager__save" onClick={handleSaveEdit} disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" className="article-manager__cancel" onClick={cancelEdit} disabled={busy}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="article-manager__delete"
                    onClick={() => handleDelete(line)}
                    disabled={busy}
                  >
                    Supprimer
                  </button>
                </div>
              </>
            ) : (
              <div className="article-manager__item-summary">
                <div className="article-manager__item-main">
                  <span className="article-manager__item-name">{line.nom}</span>
                  <span className="article-manager__item-brand">{line.marque}</span>
                </div>
                <span className="article-manager__item-meta">
                  {CATEGORY_LABELS[line.categorie]} · {line.contenance_unitaire} {UNIT_LABELS[line.unite]}
                </span>
                <button type="button" className="article-manager__edit-toggle" onClick={() => startEdit(line)}>
                  Modifier
                </button>
              </div>
            )}
          </li>
        ))}
        {filteredLines.length === 0 && <li className="article-manager__empty">Aucun produit trouvé.</li>}
      </ul>
    </div>
  );
}
