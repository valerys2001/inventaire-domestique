import { useEffect, useState } from 'react';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/Settings.css';

const SPREADSHEET_ID_STORAGE_KEY = 'inventaire.spreadsheetId';

export function Settings() {
  const pendingCount = useInventoryStore((s) => s.pendingCount);
  const utilisateur = useInventoryStore((s) => s.utilisateur);
  const setUtilisateur = useInventoryStore((s) => s.setUtilisateur);
  const syncNow = useInventoryStore((s) => s.syncNow);
  const syncing = useInventoryStore((s) => s.syncing);
  const syncError = useInventoryStore((s) => s.syncError);
  const signOutGoogle = useInventoryStore((s) => s.signOutGoogle);
  const seedProduce = useInventoryStore((s) => s.seedProduce);

  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY);
    if (stored) setSpreadsheetId(stored);
  }, []);

  const handleSpreadsheetIdChange = (value: string) => {
    setSpreadsheetId(value);
    localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, value);
  };

  const handleSeedProduce = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const count = await seedProduce();
      setSeedResult(
        count > 0 ? `${count} produit(s) ajouté(s) à zéro.` : "Tous les fruits/légumes courants sont déjà dans l'inventaire.",
      );
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="settings">
      <h1>Réglages</h1>

      <section className="settings__section">
        <h2>Compte Google</h2>
        <p className="settings__pending">Connecté.</p>
        <button type="button" className="settings__button" onClick={signOutGoogle}>
          Se déconnecter
        </button>
      </section>

      <section className="settings__section">
        <h2>Google Sheet</h2>
        <label className="settings__field">
          <span>Identifiant du spreadsheet</span>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => handleSpreadsheetIdChange(e.target.value)}
            placeholder="Collez l'ID du Google Sheet"
          />
        </label>
      </section>

      <section className="settings__section">
        <h2>Utilisateur</h2>
        <label className="settings__field">
          <span>Nom affiché dans le journal des mouvements</span>
          <input
            type="text"
            value={utilisateur}
            onChange={(e) => setUtilisateur(e.target.value)}
            placeholder="ex: Alex"
          />
        </label>
      </section>

      <section className="settings__section">
        <h2>Catalogue</h2>
        <p className="settings__hint">
          Ajoute les fruits et légumes courants à l'inventaire avec une quantité de 0 (utile car ils
          n'ont généralement pas de code-barre à scanner). Fait automatiquement au premier lancement,
          ce bouton sert à relancer l'ajout si besoin.
        </p>
        <button type="button" className="settings__button" onClick={handleSeedProduce} disabled={seeding}>
          {seeding ? 'Ajout en cours…' : 'Pré-remplir fruits & légumes'}
        </button>
        {seedResult && <p className="settings__pending">{seedResult}</p>}
      </section>

      <section className="settings__section">
        <h2>Synchronisation</h2>
        <p className="settings__pending">
          {pendingCount > 0 ? `${pendingCount} opération(s) en attente de synchronisation` : 'Tout est synchronisé.'}
        </p>
        <button
          type="button"
          className="settings__button"
          onClick={() => syncNow({ interactive: true })}
          disabled={syncing}
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        {syncError && <p className="settings__error">{syncError}</p>}
      </section>
    </div>
  );
}
