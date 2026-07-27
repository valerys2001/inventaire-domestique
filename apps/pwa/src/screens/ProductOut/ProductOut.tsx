import { useEffect, useMemo, useState } from 'react';
import { buildMergeKey, UNIT_LABELS } from '@inventaire/shared';
import { BarcodeScanner } from '../../components/BarcodeScanner/BarcodeScanner';
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
  const utilisateur = useInventoryStore((s) => s.utilisateur);

  const [method, setMethod] = useState<'liste' | 'scan'>('liste');
  const [selectedCleFusion, setSelectedCleFusion] = useState<string | null>(initialCleFusion);
  const [amount, setAmount] = useState(0);
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

  useEffect(() => {
    if (selectedLine) {
      setAmount(selectedLine.unite === 'unite' ? Math.min(1, selectedLine.quantite_totale) : selectedLine.contenance_unitaire || 0);
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

  const clearSelection = () => {
    setSelectedCleFusion(null);
    setConfirmation(null);
    onConsumed?.();
  };

  const handleRetirer = async () => {
    if (!selectedLine || amount <= 0) return;
    await applyExit({ cle_fusion: selectedLine.cle_fusion, delta: -amount, utilisateur });
    setConfirmation(`${amount} ${UNIT_LABELS[selectedLine.unite]} retiré(s) de ${selectedLine.nom}`);
    setSelectedCleFusion(null);
    onConsumed?.();
  };

  const handleDetected = async (barcode: string) => {
    setScanBusy(true);
    setScanMessage(null);
    try {
      let line = lines.find((l) => l.code_barre === barcode) ?? null;

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
        <ul className="product-out__list">
          {lines.map((line) => (
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
                  {line.quantite_totale} {UNIT_LABELS[line.unite]}
                </span>
              </button>
            </li>
          ))}
          {lines.length === 0 && <li className="product-out__empty">Aucun produit en stock.</li>}
        </ul>
      )}

      {method === 'liste' && selectedLine && (
        <div className="product-out__form">
          <h2>
            {selectedLine.nom} {selectedLine.marque}
          </h2>
          <p>
            En stock : {selectedLine.quantite_totale} {UNIT_LABELS[selectedLine.unite]}
          </p>
          <UnitSelector unite={selectedLine.unite} value={amount} onChange={setAmount} />
          <button type="button" className="product-out__submit" onClick={handleRetirer}>
            Retirer
          </button>
          <button type="button" className="product-out__cancel" onClick={clearSelection}>
            Choisir un autre produit
          </button>

          <div className="product-out__threshold">
            <label className="product-out__field">
              <span>Seuil "Besoins" ({UNIT_LABELS[selectedLine.unite]}) — vide = non suivi</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder="ex: 2"
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
