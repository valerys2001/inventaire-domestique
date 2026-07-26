import { useEffect, useState } from 'react';
import { requestAccessToken, signOut } from '../../services/googleAuth';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/Settings.css';

const SPREADSHEET_ID_STORAGE_KEY = 'inventaire.spreadsheetId';

export function Settings() {
  const pendingCount = useInventoryStore((s) => s.pendingCount);
  const utilisateur = useInventoryStore((s) => s.utilisateur);
  const setUtilisateur = useInventoryStore((s) => s.setUtilisateur);

  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY);
    if (stored) setSpreadsheetId(stored);
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAccessToken();
      setConnected(true);
    } catch (err) {
      setError('Échec de la connexion à Google. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await signOut();
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSpreadsheetIdChange = (value: string) => {
    setSpreadsheetId(value);
    localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, value);
  };

  return (
    <div className="settings">
      <h1>Réglages</h1>

      <section className="settings__section">
        <h2>Compte Google</h2>
        {connected ? (
          <button type="button" className="settings__button" onClick={handleDisconnect} disabled={busy}>
            Se déconnecter
          </button>
        ) : (
          <button type="button" className="settings__button" onClick={handleConnect} disabled={busy}>
            Se connecter à Google
          </button>
        )}
        {error && <p className="settings__error">{error}</p>}
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
        <h2>Synchronisation</h2>
        <p className="settings__pending">
          {pendingCount > 0 ? `${pendingCount} opération(s) en attente de synchronisation` : 'Tout est synchronisé.'}
        </p>
      </section>
    </div>
  );
}
