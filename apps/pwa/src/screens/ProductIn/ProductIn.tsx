import { useState, type FormEvent } from 'react';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  UNITS,
  UNIT_LABELS,
  computeDeltaFromPack,
  roundForDisplay,
  type Category,
  type Unit,
  type CandidateEntry,
} from '@inventaire/shared';
import { BarcodeScanner } from '../../components/BarcodeScanner/BarcodeScanner';
import { lookupProduct } from '../../services/productLookup';
import { MergeConfirmDialog } from '../../components/MergeConfirmDialog/MergeConfirmDialog';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/ProductIn.css';

interface EntryForm {
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: string;
  unite: Unit;
  nombre_contenants: string;
  code_barre: string;
  isKnownProduct: boolean;
}

const EMPTY_FORM: EntryForm = {
  nom: '',
  marque: '',
  categorie: CATEGORIES[0],
  contenance_unitaire: '',
  unite: 'unite',
  nombre_contenants: '1',
  code_barre: '',
  isKnownProduct: false,
};

export function ProductIn() {
  const applyEntry = useInventoryStore((s) => s.applyEntry);
  const undoLastEntry = useInventoryStore((s) => s.undoLastEntry);

  const [method, setMethod] = useState<'scan' | 'manuel'>('scan');
  const [scanActive, setScanActive] = useState(true);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm | null>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);

  const startScan = () => {
    setMethod('scan');
    setForm(null);
    setScanActive(true);
    setLookupError(null);
  };

  const startManuel = () => {
    setMethod('manuel');
    setScanActive(false);
    setForm({ ...EMPTY_FORM });
  };

  const handleDetected = async (barcode: string) => {
    setScanActive(false);
    setLookupBusy(true);
    setLookupError(null);
    try {
      const result = await lookupProduct(barcode);
      setForm({
        nom: result.nom ?? '',
        marque: result.marque ?? '',
        categorie: result.categorie_suggeree ?? CATEGORIES[0],
        contenance_unitaire: result.contenance_unitaire ? String(result.contenance_unitaire) : '',
        unite: result.unite ?? 'unite',
        nombre_contenants: '1',
        code_barre: result.code_barre,
        isKnownProduct: result.source !== 'manuel',
      });
      setMethod('manuel');
    } catch (err) {
      setLookupError('Recherche produit impossible. Réessayez ou saisissez manuellement.');
      setScanActive(true);
    } finally {
      setLookupBusy(false);
    }
  };

  const updateForm = (patch: Partial<EntryForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const contenance = Number(form.contenance_unitaire);
    const nombreContenants = Number(form.nombre_contenants) || 1;
    if (!form.nom.trim() || !(contenance > 0)) return;

    const delta = computeDeltaFromPack(nombreContenants, contenance);
    const candidate: CandidateEntry = {
      nom: form.nom.trim(),
      marque: form.marque.trim(),
      categorie: form.categorie,
      contenance_unitaire: contenance,
      unite: form.unite,
      delta,
      code_barre: form.code_barre.trim() || null,
    };

    const decision = await applyEntry(candidate);
    if (decision.action === 'merge') {
      const label = [decision.target.nom, decision.target.marque].filter(Boolean).join(' ');
      setToast({ message: `+${roundForDisplay(delta)} ${UNIT_LABELS[form.unite]} ajoutés à ${label}` });
    }
    startScan();
  };

  return (
    <div className="product-in">
      <h1>Entrée de stock</h1>

      <div className="product-in__method-switch">
        <button
          type="button"
          className={`product-in__method-btn${method === 'scan' ? ' product-in__method-btn--active' : ''}`}
          onClick={startScan}
        >
          Scanner
        </button>
        <button
          type="button"
          className={`product-in__method-btn${method === 'manuel' ? ' product-in__method-btn--active' : ''}`}
          onClick={startManuel}
        >
          Saisie manuelle
        </button>
      </div>

      {method === 'scan' && !form && (
        <div className="product-in__scan">
          <BarcodeScanner
            onDetected={handleDetected}
            active={scanActive}
            onError={() => setLookupError('Caméra indisponible.')}
          />
          {lookupBusy && <p>Recherche du produit…</p>}
          {lookupError && <p className="product-in__error">{lookupError}</p>}
        </div>
      )}

      {form && (
        <form className="product-in__form" onSubmit={handleSubmit}>
          <h2>
            {form.isKnownProduct
              ? 'Confirmez le produit détecté'
              : form.code_barre
                ? 'Produit inconnu — complétez les informations'
                : 'Nouveau produit'}
          </h2>

          <label className="product-in__field">
            <span>Nom</span>
            <input type="text" value={form.nom} onChange={(e) => updateForm({ nom: e.target.value })} required />
          </label>

          <label className="product-in__field">
            <span>Marque</span>
            <input type="text" value={form.marque} onChange={(e) => updateForm({ marque: e.target.value })} />
          </label>

          <label className="product-in__field">
            <span>Catégorie</span>
            <select value={form.categorie} onChange={(e) => updateForm({ categorie: e.target.value as Category })}>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>

          <div className="product-in__row">
            <label className="product-in__field">
              <span>Contenance unitaire</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.contenance_unitaire}
                onChange={(e) => updateForm({ contenance_unitaire: e.target.value })}
                required
              />
            </label>
            <label className="product-in__field">
              <span>Unité</span>
              <select value={form.unite} onChange={(e) => updateForm({ unite: e.target.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="product-in__field">
            <span>Nombre de contenants (pack)</span>
            <input
              type="number"
              min={1}
              step="1"
              value={form.nombre_contenants}
              onChange={(e) => updateForm({ nombre_contenants: e.target.value })}
            />
          </label>

          <label className="product-in__field">
            <span>Code-barre</span>
            <input type="text" value={form.code_barre} onChange={(e) => updateForm({ code_barre: e.target.value })} />
          </label>

          <button type="submit" className="product-in__submit">
            Ajouter au stock
          </button>
          <button type="button" className="product-in__cancel" onClick={startScan}>
            Annuler
          </button>
        </form>
      )}

      {toast && (
        <MergeConfirmDialog
          message={toast.message}
          onUndo={() => {
            undoLastEntry();
            setToast(null);
          }}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
