import { useEffect, useMemo, useState } from 'react';
import {
  buildMergeKey,
  formatQuantityDetailed,
  groupLiquidLines,
  isLastContainerGauge,
  matchesSearch,
  parseBarcodes,
  type InventoryLine,
  UNIT_LABELS,
} from '@inventaire/shared';
import { BarcodeScanner } from '../../components/BarcodeScanner/BarcodeScanner';
import { LiquidFolders } from '../../components/LiquidFolders/LiquidFolders';
import { SearchBox } from '../../components/SearchBox/SearchBox';
import { lookupProduct } from '../../services/productLookup';
import { UnitSelector } from '../../components/UnitSelector/UnitSelector';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/ProductOut.css';

interface ProductOutProps {
  initialCleFusion: string | null;
  onConsumed?: () => void;
}

export function ProductOut({ initialCleFusion, onConsumed }: ProductOutProps) {
  const lines = useInventoryStore((s) => s.lines);
  const applyExit = useInventoryStore((s) => s.applyExit);
  const updateThreshold = useInventoryStore((s) => s.updateThreshold);
  const updateNiveauDernierContenant = useInventoryStore((s) => s.updateNiveauDernierContenant);
  const utilisateur = useInventoryStore((s) => s.utilisateur);

  const [method, setMethod] = useState<'liste' | 'scan'>('liste');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCleFusion, setSelectedCleFusion] = useState<string | null>(initialCleFusion);
  const [amount, setAmount] = useState(0);
  const [gaugePercent, setGaugePercent] = useState(100);
  const [gaugeSaved, setGaugeSaved] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [thresholdSaved, setThresholdSaved] = useState(false);

  useEffect(() => {
    if (initialCleFusion) {
      setSelectedCleFusion(initialCleFusion);
      setMethod('liste');
    }
  }, [initialCleFusion]);

  const selectedLine = useMemo(
    () => lines.find((line) => line.cle_fusion === selectedCleFusion) ?? null,
    [lines, selectedCleFusion],
  );
  const useGauge = selectedLine !== null && isLastContainerGauge(selectedLine);
  // On ne peut rien retirer d'un produit à 0 en stock : l'exclure évite de noyer la liste avec
  // des articles épuisés qui n'ont rien à faire dans un écran de SORTIE.
  const inStockLines = useMemo(
    () => lines.filter((line) => line.quantite_totale > 0 && matchesSearch(searchQuery, line.nom, line.marque)),
    [lines, searchQuery],
  );
  const otherLines = useMemo(() => inStockLines.filter((line) => line.unite !== 'l'), [inStockLines]);
  const liquidFolders = useMemo(() => groupLiquidLines(inStockLines), [inStockLines]);

  useEffect(() => {
    if (selectedLine) {
      // "% restant" (ex: amandes en vrac) : l'utilisateur choisit directement le NOUVEAU
      // pourcentage restant, jamais une quantité à retirer — le curseur part donc du niveau
      // actuellement en stock, pas d'un contenant plein comme pour les autres unités.
      setAmount(
        selectedLine.unite === 'unite'
          ? Math.min(1, selectedLine.quantite_totale)
          : selectedLine.unite === 'pourcent'
            ? selectedLine.quantite_totale
            : selectedLine.contenance_unitaire || 0,
      );
      // Niveau cosmétique du dernier contenant : repart de 100% (plein, non entamé) quand rien
      // n'est encore mémorisé pour cette ligne — jamais dérivé de quantite_totale (qui reste un
      // compte entier de contenants et ne dit rien sur le niveau de remplissage).
      setGaugePercent(selectedLine.niveau_dernier_contenant ?? 100);
      setGaugeSaved(false);
      setThresholdInput(selectedLine.seuil_alerte !== null ? String(selectedLine.seuil_alerte) : '');
      setThresholdSaved(false);
    }
  }, [selectedLine?.id]);

  const handleSaveThreshold = async () => {
    if (!selectedLine) return;
    const trimmed = thresholdInput.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && !(value >= 0)) return;
    await updateThreshold(selectedLine.cle_fusion, value);
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2000);
  };

  const handleSaveGauge = async () => {
    if (!selectedLine) return;
    await updateNiveauDernierContenant(selectedLine.cle_fusion, gaugePercent);
    setGaugeSaved(true);
    setTimeout(() => setGaugeSaved(false), 2000);
  };

  const clearSelection = () => {
    setSelectedCleFusion(null);
    setConfirmation(null);
    onConsumed?.();
  };

  // Toujours le même retrait "en contenants entiers", jauge ou pas : le niveau cosmétique du
  // dernier contenant (ci-dessus) ne touche jamais au stock réel, il s'enregistre indépendamment.
  // Exception : "% restant", où `amount` EST déjà le nouveau niveau absolu (pas un retrait).
  const handleRetirer = async () => {
    if (!selectedLine) return;

    if (selectedLine.unite === 'pourcent') {
      const delta = amount - selectedLine.quantite_totale;
      if (delta >= 0) return; // pas de baisse choisie (une hausse se fait dans Entrée)
      await applyExit({ cle_fusion: selectedLine.cle_fusion, delta, utilisateur });
      setConfirmation(`${selectedLine.nom} : ${amount}% restant`);
    } else {
      if (amount <= 0) return;
      await applyExit({ cle_fusion: selectedLine.cle_fusion, delta: -amount, utilisateur });
      setConfirmation(
        `${formatQuantityDetailed(amount, selectedLine.contenance_unitaire, selectedLine.unite)} retiré(s) de ${selectedLine.nom}`,
      );
    }

    setSelectedCleFusion(null);
    onConsumed?.();
  };

  const handleDetected = async (barcode: string) => {
    setScanBusy(true);
    setScanMessage(null);
    try {
      let line = lines.find((l) => parseBarcodes(l.code_barre).includes(barcode)) ?? null;

      if (!line) {
        const result = await lookupProduct(barcode);
        if (result.nom && result.marque && result.contenance_unitaire && result.unite) {
          const cle = buildMergeKey(result.nom, result.marque, result.contenance_unitaire, result.unite);
          line = lines.find((l) => l.cle_fusion === cle) ?? null;
        }
      }

      if (!line) {
        setScanMessage("Produit introuvable dans l'inventaire. Utilisez la liste pour le retirer.");
        return;
      }

      if (line.unite !== 'unite' && line.unite !== 'g') {
        setScanMessage(
          `Le retrait par scan est réservé aux produits comptés à l'unité ou au poids. Utilisez la liste pour retirer "${line.nom}".`,
        );
        return;
      }

      const delta = -line.contenance_unitaire;
      await applyExit({ cle_fusion: line.cle_fusion, delta, utilisateur });
      setConfirmation(`1 ${line.unite === 'unite' ? 'unité' : 'portion'} retirée de ${line.nom}`);
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <div className="product-out">
      <h1>Sortie de stock</h1>

      <div className="product-out__method-switch">
        <button
          type="button"
          className={`product-out__method-btn${method === 'liste' ? ' product-out__method-btn--active' : ''}`}
          onClick={() => {
            setMethod('liste');
            setScanMessage(null);
          }}
        >
          Depuis la liste
        </button>
        <button
          type="button"
          className={`product-out__method-btn${method === 'scan' ? ' product-out__method-btn--active' : ''}`}
          onClick={() => {
            setMethod('scan');
            clearSelection();
          }}
        >
          Scanner
        </button>
      </div>

      {confirmation && <div className="product-out__confirmation">{confirmation}</div>}

      {method === 'liste' && !selectedLine && (
        <>
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
          <LiquidFolders
            folders={liquidFolders}
            renderItem={(line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className="product-out__list-item"
                  onClick={() => setSelectedCleFusion(line.cle_fusion)}
                >
                  <span>
                    {line.nom} {line.marque}
                  </span>
                  <span>
                    {formatQuantityDetailed(
                      line.quantite_totale,
                      line.contenance_unitaire,
                      line.unite,
                      line.niveau_dernier_contenant,
                    )}
                  </span>
                </button>
              </li>
            )}
          />
          <ul className="product-out__list">
            {otherLines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className="product-out__list-item"
                  onClick={() => setSelectedCleFusion(line.cle_fusion)}
                >
                  <span>
                    {line.nom} {line.marque}
                  </span>
                  <span>
                    {formatQuantityDetailed(
                      line.quantite_totale,
                      line.contenance_unitaire,
                      line.unite,
                      line.niveau_dernier_contenant,
                    )}
                  </span>
                </button>
              </li>
            ))}
            {inStockLines.length === 0 && <li className="product-out__empty">Aucun produit en stock.</li>}
          </ul>
        </>
      )}

      {method === 'liste' && selectedLine && (
        <div className="product-out__form">
          <h2>
            {selectedLine.nom} {selectedLine.marque}
          </h2>
          <p>
            En stock :{' '}
            {formatQuantityDetailed(
              selectedLine.quantite_totale,
              selectedLine.contenance_unitaire,
              selectedLine.unite,
              selectedLine.niveau_dernier_contenant,
            )}
          </p>
          <UnitSelector
            unite={selectedLine.unite}
            value={amount}
            onChange={setAmount}
            contenanceUnitaire={selectedLine.contenance_unitaire}
            baseValue={0}
            maxCount={
              selectedLine.contenance_unitaire > 0
                ? Math.floor(selectedLine.quantite_totale / selectedLine.contenance_unitaire + 1e-6)
                : undefined
            }
          />
          <button type="button" className="product-out__submit" onClick={handleRetirer}>
            {selectedLine.unite === 'pourcent' ? 'Enregistrer le nouveau %' : 'Retirer'}
          </button>
          <button type="button" className="product-out__cancel" onClick={clearSelection}>
            Choisir un autre produit
          </button>

          {useGauge && (
            <div className="product-out__gauge">
              {/* Purement cosmétique : ne change jamais le stock réel (ci-dessus), juste le niveau
                  affiché du dernier contenant. Enregistrement indépendant du "Retirer". */}
              <p className="product-out__gauge-hint">Dernier contenant — niveau restant (cosmétique) :</p>
              <UnitSelector unite="pourcent" value={gaugePercent} onChange={setGaugePercent} />
              <button type="button" className="product-out__cancel" onClick={handleSaveGauge}>
                {gaugeSaved ? 'Enregistré ✓' : 'Enregistrer le niveau'}
              </button>
            </div>
          )}

          <div className="product-out__threshold">
            <label className="product-out__field">
              <span>
                Seuil "Besoins" ({selectedLine.unite === 'l' ? 'contenants' : UNIT_LABELS[selectedLine.unite]}) — vide
                = non suivi
              </span>
              <input
                type="number"
                min={0}
                step={selectedLine.unite === 'l' ? 1 : 0.01}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder={selectedLine.unite === 'l' ? 'ex: 1' : 'ex: 2'}
              />
            </label>
            <button type="button" className="product-out__cancel" onClick={handleSaveThreshold}>
              {thresholdSaved ? 'Enregistré ✓' : 'Enregistrer le seuil'}
            </button>
          </div>
        </div>
      )}

      {method === 'scan' && (
        <div className="product-out__scan">
          <BarcodeScanner onDetected={handleDetected} active={!scanBusy} />
          {scanBusy && <p>Recherche en cours…</p>}
          {scanMessage && <p className="product-out__scan-message">{scanMessage}</p>}
        </div>
      )}
    </div>
  );
}
