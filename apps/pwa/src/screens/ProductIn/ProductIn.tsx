import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  buildMergeKey,
  CATEGORIES,
  CATEGORY_LABELS,
  UNITS,
  UNIT_LABELS,
  computeDeltaFromPack,
  formatQuantityDetailed,
  getNombreContenantsForBarcode,
  isLastContainerGauge,
  matchesSearch,
  parseBarcodes,
  roundForDisplay,
  type Category,
  type InventoryLine,
  type Unit,
  type CandidateEntry,
} from '@inventaire/shared';
import { BarcodeScanner } from '../../components/BarcodeScanner/BarcodeScanner';
import { lookupProduct } from '../../services/productLookup';
import { MergeConfirmDialog } from '../../components/MergeConfirmDialog/MergeConfirmDialog';
import { SearchBox } from '../../components/SearchBox/SearchBox';
import { UnitSelector } from '../../components/UnitSelector/UnitSelector';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/ProductIn.css';

interface EntryForm {
  nom: string;
  marque: string;
  categorie: Category;
  contenance_unitaire: string;
  unite: Unit;
  nombre_contenants: string;
  /**
   * Pour `unite === 'pourcent'` (ex: amandes/cacahuètes en vrac) : le stock N'EST PAS incrémenté
   * par un delta, contrairement à tous les autres cas — l'utilisateur choisit directement le
   * NOUVEAU pourcentage restant après avoir rempli/complété le paquet (ex: "rempli à 95%"), et le
   * delta réellement appliqué (95% - pourcentage précédent) est calculé à la soumission.
   */
  pourcentage_restant: string;
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
  pourcentage_restant: '100',
  code_barre: '',
  isKnownProduct: false,
};

export function ProductIn() {
  const applyEntry = useInventoryStore((s) => s.applyEntry);
  const undoLastEntry = useInventoryStore((s) => s.undoLastEntry);
  const updateNiveauDernierContenant = useInventoryStore((s) => s.updateNiveauDernierContenant);
  const lines = useInventoryStore((s) => s.lines);

  const [method, setMethod] = useState<'scan' | 'manuel'>('scan');
  // La saisie manuelle démarre toujours par le choix "produit existant vs nouveau" : retaper un
  // nom/marque à la main est source de doublons (faute de frappe -> nouvelle ligne au lieu d'une
  // fusion), donc choisir dans la liste existante est le chemin par défaut, pas une option cachée.
  const [manuelStep, setManuelStep] = useState<'choose' | 'form'>('choose');
  const [chooserQuery, setChooserQuery] = useState('');
  const [scanActive, setScanActive] = useState(true);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm | null>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);
  // Change de clé à chaque tentative -> démontage/remontage complet de <BarcodeScanner>, pour
  // repartir d'un flux caméra garanti neuf si un précédent flux est resté bloqué côté navigateur
  // (observé sur Android : la caméra reste "active" sans qu'aucune image ne s'affiche).
  const [scannerKey, setScannerKey] = useState(0);

  const startScan = () => {
    setMethod('scan');
    setForm(null);
    setScanActive(true);
    setLookupError(null);
    setScannerKey((k) => k + 1);
  };

  const startManuel = () => {
    setMethod('manuel');
    setScanActive(false);
    setForm(null);
    setManuelStep('choose');
    setChooserQuery('');
  };

  const startBlankForm = () => {
    setForm({ ...EMPTY_FORM });
    setManuelStep('form');
  };

  const chooserResults = useMemo(() => {
    const sorted = [...lines].sort((a, b) => a.nom.localeCompare(b.nom));
    return sorted.filter((line) => matchesSearch(chooserQuery, line.nom, line.marque)).slice(0, 30);
  }, [chooserQuery, lines]);

  // "Un pack" seul ne veut rien dire : on affiche toujours le total qui sera réellement ajouté
  // pendant la saisie, avant validation, pas seulement après coup dans la liste.
  const previewDelta = useMemo(() => {
    if (!form || form.unite === 'pourcent') return null;
    const contenance = Number(form.contenance_unitaire);
    const nombreContenants = Number(form.nombre_contenants) || 1;
    if (!(contenance > 0) || !(nombreContenants > 0)) return null;
    return computeDeltaFromPack(nombreContenants, contenance);
  }, [form?.contenance_unitaire, form?.nombre_contenants]);

  // Ligne existante correspondant au formulaire (même clé de fusion), pour retrouver son niveau de
  // dernier contenant éventuel — indépendamment de la quantité en cours de saisie ci-dessus.
  const existingLine = useMemo(() => {
    if (!form) return null;
    const contenance = form.unite === 'pourcent' ? 100 : Number(form.contenance_unitaire);
    if (!form.nom.trim() || !(contenance > 0)) return null;
    const cle = buildMergeKey(form.nom.trim(), form.marque.trim(), contenance, form.unite);
    return lines.find((l) => l.cle_fusion === cle) ?? null;
  }, [form?.nom, form?.marque, form?.contenance_unitaire, form?.unite, lines]);

  const gaugeEligible = existingLine !== null && isLastContainerGauge(existingLine);

  // Réglable des deux côtés (Entrée ET Sortie), exactement comme le % d'un produit `pourcent` :
  // purement cosmétique, indépendant de la quantité ajoutée par ce formulaire.
  const [gaugePercent, setGaugePercent] = useState(100);
  const [gaugeSaved, setGaugeSaved] = useState(false);

  useEffect(() => {
    if (existingLine) {
      setGaugePercent(existingLine.niveau_dernier_contenant ?? 100);
      setGaugeSaved(false);
    }
  }, [existingLine?.id]);

  const handleSaveGauge = async () => {
    if (!existingLine) return;
    await updateNiveauDernierContenant(existingLine.cle_fusion, gaugePercent);
    setGaugeSaved(true);
    setTimeout(() => setGaugeSaved(false), 2000);
  };

  const handleDetected = async (barcode: string) => {
    setScanActive(false);
    setLookupBusy(true);
    setLookupError(null);
    try {
      const result = await lookupProduct(barcode);

      // La suggestion de catégorie d'Open*Facts est une heuristique parfois fausse (ex: eau
      // classée épicerie sucrée, cosmétique classé épicerie fine). Si ce produit a déjà une ligne
      // dans l'inventaire (même code-barre, ou même nom+marque+contenance), on reprend SA
      // catégorie déjà établie/corrigée par l'utilisateur plutôt que de reproposer la suggestion
      // brute à chaque nouveau scan du même article.
      const cle =
        result.nom && result.marque && result.contenance_unitaire && result.unite
          ? buildMergeKey(result.nom, result.marque, result.contenance_unitaire, result.unite)
          : null;
      const existingByBarcode = lines.find((l) => parseBarcodes(l.code_barre).includes(barcode));
      const existing = existingByBarcode ?? (cle ? lines.find((l) => l.cle_fusion === cle) : undefined);

      // Le conditionnement mémorisé (nombre de contenants) est propre à CET EAN, jamais à la
      // ligne entière : après une fusion pack <-> bouteille seule, les deux EAN partagent la même
      // ligne (même stock) mais doivent garder chacun leur conditionnement propre au rescan (cf.
      // barcodes.ts). Si cet EAN précis a déjà un conditionnement mémorisé, on le reprend ; sinon
      // (EAN jamais vu pour ce produit) on retombe sur le défaut au niveau de la ligne, comme
      // avant, faute de mieux.
      const nombreContenantsMemorise = existingByBarcode
        ? getNombreContenantsForBarcode(existingByBarcode.code_barre, barcode)
        : (existing?.nombre_contenants_defaut ?? null);

      setForm({
        nom: existing?.nom ?? result.nom ?? '',
        marque: existing?.marque ?? result.marque ?? '',
        categorie: existing?.categorie ?? result.categorie_suggeree ?? CATEGORIES[0],
        contenance_unitaire: String(existing?.contenance_unitaire ?? result.contenance_unitaire ?? ''),
        unite: existing?.unite ?? result.unite ?? 'unite',
        // Priorité à ce qui a déjà été corrigé pour CE code-barres précis sur la détection brute
        // Open*Facts, souvent absente/fausse pour les packs (ex. papier toilette, canettes) :
        // sinon l'utilisateur devrait retaper "6" à chaque scan.
        nombre_contenants: nombreContenantsMemorise
          ? String(nombreContenantsMemorise)
          : result.nombre_contenants
            ? String(result.nombre_contenants)
            : '1',
        // Point de départ du curseur "% restant" : le niveau actuellement en stock pour ce
        // produit (l'utilisateur le fera glisser vers le nouveau niveau après remplissage), ou
        // 100% par défaut pour un tout nouveau produit en % jamais vu.
        pourcentage_restant: String(existing?.unite === 'pourcent' ? existing.quantite_totale : 100),
        code_barre: result.code_barre,
        isKnownProduct: Boolean(existing) || result.source !== 'manuel',
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

  // Retaper à la main le nom/marque exacts d'un produit déjà en stock est source d'erreurs
  // (fautes de frappe -> doublon au lieu d'une fusion). On propose donc les produits existants
  // qui correspondent à ce qui est tapé, pour préremplir le formulaire en un clic plutôt que
  // tout retaper.
  const nameSuggestions = useMemo(() => {
    const query = form?.nom.trim().toLowerCase() ?? '';
    if (!query) return [];
    return lines
      .filter((line) => line.nom.toLowerCase().includes(query) || line.marque.toLowerCase().includes(query))
      .slice(0, 6);
  }, [form?.nom, lines]);

  const pickSuggestion = (line: InventoryLine) => {
    updateForm({
      nom: line.nom,
      marque: line.marque,
      categorie: line.categorie,
      contenance_unitaire: String(line.contenance_unitaire),
      unite: line.unite,
      pourcentage_restant: String(line.unite === 'pourcent' ? line.quantite_totale : 100),
    });
    setNameSuggestionsOpen(false);
  };

  const chooseExisting = (line: InventoryLine) => {
    setForm({
      nom: line.nom,
      marque: line.marque,
      categorie: line.categorie,
      contenance_unitaire: String(line.contenance_unitaire),
      unite: line.unite,
      nombre_contenants: line.nombre_contenants_defaut ? String(line.nombre_contenants_defaut) : '1',
      pourcentage_restant: String(line.unite === 'pourcent' ? line.quantite_totale : 100),
      code_barre: line.code_barre ?? '',
      isKnownProduct: true,
    });
    setManuelStep('form');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const isPourcent = form.unite === 'pourcent';
    // Contenance fixée à 100 pour un produit en % : le "contenant" est le paquet plein (100%),
    // jamais une valeur saisie librement (cf. select Unité, qui la force déjà à la sélection).
    const contenance = isPourcent ? 100 : Number(form.contenance_unitaire);
    const nombreContenants = Number(form.nombre_contenants) || 1;
    if (!form.nom.trim() || !(contenance > 0)) return;

    let delta: number;
    if (isPourcent) {
      // Le stock réel N'EST PAS incrémenté ici : quantite_totale doit devenir EXACTEMENT le
      // pourcentage choisi, pas ce pourcentage en plus de l'existant. On retrouve la ligne
      // existante (même clé de fusion) pour en déduire le delta réel à appliquer.
      const cle = buildMergeKey(form.nom.trim(), form.marque.trim(), contenance, form.unite);
      const existingTarget = lines.find((l) => l.cle_fusion === cle);
      const nouveauPourcentage = Number(form.pourcentage_restant) || 0;
      delta = nouveauPourcentage - (existingTarget?.quantite_totale ?? 0);
    } else {
      delta = computeDeltaFromPack(nombreContenants, contenance);
    }

    const candidate: CandidateEntry = {
      nom: form.nom.trim(),
      marque: form.marque.trim(),
      categorie: form.categorie,
      contenance_unitaire: contenance,
      unite: form.unite,
      delta,
      code_barre: form.code_barre.trim() || null,
      nombre_contenants: isPourcent ? null : nombreContenants,
    };

    const decision = await applyEntry(candidate);
    if (decision.action === 'merge') {
      const label = [decision.target.nom, decision.target.marque].filter(Boolean).join(' ');
      const message = isPourcent
        ? `${label} : ${Number(form.pourcentage_restant) || 0}% restant`
        : `+${roundForDisplay(delta)} ${UNIT_LABELS[form.unite]} ajoutés à ${label}`;
      setToast({ message });
    }
    // Retourne à la méthode d'origine : liste de choix pour la saisie manuelle, scanner sinon.
    if (method === 'manuel') {
      startManuel();
    } else {
      startScan();
    }
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
            key={scannerKey}
            onDetected={handleDetected}
            active={scanActive}
            onError={(err) => setLookupError(`Caméra indisponible : ${err.name} — ${err.message}`)}
          />
          {lookupBusy && <p>Recherche du produit…</p>}
          {lookupError && <p className="product-in__error">{lookupError}</p>}
          <button type="button" className="product-in__retry" onClick={() => setScannerKey((k) => k + 1)}>
            Réessayer la caméra
          </button>
        </div>
      )}

      {method === 'manuel' && manuelStep === 'choose' && !form && (
        <div className="product-in__chooser">
          <SearchBox value={chooserQuery} onChange={setChooserQuery} placeholder="Nom ou marque…" autoFocus />

          <button type="button" className="product-in__submit" onClick={startBlankForm}>
            + Nouveau produit
          </button>

          <ul className="product-in__chooser-list">
            {chooserResults.map((line) => (
              <li key={line.id}>
                <button type="button" className="product-in__chooser-item" onClick={() => chooseExisting(line)}>
                  <span className="product-in__chooser-item-main">
                    <strong>{line.nom}</strong>
                    {line.marque && <span> — {line.marque}</span>}
                  </span>
                  <span className="product-in__suggestion-meta">
                    {CATEGORY_LABELS[line.categorie]} · {line.contenance_unitaire} {UNIT_LABELS[line.unite]}
                  </span>
                </button>
              </li>
            ))}
            {chooserResults.length === 0 && (
              <li className="product-in__chooser-empty">Aucun produit existant ne correspond.</li>
            )}
          </ul>
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

          <label className="product-in__field product-in__field--suggest">
            <span>Nom</span>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => {
                updateForm({ nom: e.target.value });
                setNameSuggestionsOpen(true);
              }}
              onFocus={() => setNameSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setNameSuggestionsOpen(false), 150)}
              autoComplete="off"
              required
            />
            {nameSuggestionsOpen && nameSuggestions.length > 0 && (
              <ul className="product-in__suggestions">
                {nameSuggestions.map((line) => (
                  <li key={line.id}>
                    <button type="button" onMouseDown={() => pickSuggestion(line)}>
                      <strong>{line.nom}</strong>
                      {line.marque && <span> — {line.marque}</span>}
                      <span className="product-in__suggestion-meta">
                        {' '}
                        ({line.contenance_unitaire} {UNIT_LABELS[line.unite]})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            {form.unite !== 'pourcent' && (
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
            )}
            <label className="product-in__field">
              <span>Unité</span>
              <select
                value={form.unite}
                onChange={(e) => {
                  const nextUnite = e.target.value as Unit;
                  // "% restant" fixe la contenance à 100 (le paquet plein) : pas de valeur libre à
                  // saisir pour ce type de produit (cf. champ "Contenance unitaire" masqué ci-dessus).
                  updateForm({
                    unite: nextUnite,
                    contenance_unitaire: nextUnite === 'pourcent' ? '100' : form.contenance_unitaire,
                  });
                }}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {form.unite === 'pourcent' ? (
            <label className="product-in__field">
              <span>Pourcentage restant après cette entrée</span>
              <UnitSelector
                unite="pourcent"
                value={Number(form.pourcentage_restant) || 0}
                onChange={(value) => updateForm({ pourcentage_restant: String(value) })}
              />
            </label>
          ) : (
            <label className="product-in__field">
              <span>Nombre de contenants (pack)</span>
              <UnitSelector
                unite="unite"
                value={Number(form.nombre_contenants) || 1}
                onChange={(value) => updateForm({ nombre_contenants: String(Math.max(1, value)) })}
              />
            </label>
          )}

          {previewDelta !== null && (
            <p className="product-in__preview">
              = {formatQuantityDetailed(previewDelta, Number(form.contenance_unitaire), form.unite)} ajouté(s)
            </p>
          )}

          <label className="product-in__field">
            <span>Code-barre</span>
            <input type="text" value={form.code_barre} onChange={(e) => updateForm({ code_barre: e.target.value })} />
          </label>

          {gaugeEligible && (
            <div className="product-in__gauge">
              {/* Purement cosmétique : n'affecte jamais le stock réel ajouté ci-dessus par ce
                  formulaire. Réglable ici comme dans Sortie — même mécanique des deux côtés. */}
              <p className="product-in__gauge-hint">Dernier contenant — niveau restant (cosmétique) :</p>
              <UnitSelector unite="pourcent" value={gaugePercent} onChange={setGaugePercent} />
              <button type="button" className="product-in__cancel" onClick={handleSaveGauge}>
                {gaugeSaved ? 'Enregistré ✓' : 'Enregistrer le niveau'}
              </button>
            </div>
          )}

          <button type="submit" className="product-in__submit">
            Ajouter au stock
          </button>
          <button
            type="button"
            className="product-in__cancel"
            onClick={() => (method === 'manuel' ? startManuel() : startScan())}
          >
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
