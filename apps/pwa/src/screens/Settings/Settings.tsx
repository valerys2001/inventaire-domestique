import { useEffect, useState } from 'react';
import { buildMergeKey } from '@inventaire/shared';
import { getCachedToken, signOut } from '../../services/googleAuth';
import { useInventoryStore } from '../../store/inventoryStore';
import { PRODUCE_SEED } from '../../data/produceSeed';
import '../../styles/Settings.css';

const SPREADSHEET_ID_STORAGE_KEY = 'inventaire.spreadsheetId';

export function Settings() {
  const pendingCount = useInventoryStore((s) => s.pendingCount);
  const utilisateur = useInventoryStore((s) => s.utilisateur);
  const setUtilisateur = useInventoryStore((s) => s.setUtilisateur);
  const syncNow = useInventoryStore((s) => s.syncNow);
  const syncing = useInventoryStore((s) => s.syncing);
  const syncError = useInventoryStore((s) => s.syncError);
  const applyEntry = useInventoryStore((s) => s.applyEntry);
  const lines = useInventoryStore((s) => s.lines);

  const [connected, setConnected] = useState(() => Boolean(getCachedToken()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY);
    if (stored) setSpreadsheetId(stored);
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      // interactive: true -> requestAccessToken() peut ouvrir le popup de consentement,
      // légitime ici car déclenché par un clic direct de l'utilisateur.
      await syncNow({ interactive: true });
      setConnected(Boolean(getCachedToken()));
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

  // Les fruits/légumes n'ont généralement pas de code-barre unitaire exploitable (vente en
  // vrac/au poids) : les pré-créer à quantité 0 permet de les incrémenter depuis le sélecteur
  // de produits existants plutôt que de les recréer à la main à chaque fois. delta:0 sur une
  // ligne inexistante crée une ligne à quantite_totale=0 ; sur une ligne déjà présente, ne
  // change rien (no-op) - filtré en amont par clé de fusion pour éviter le bruit inutile.
  const handleSeedProduce = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const existingKeys = new Set(lines.map((l) => l.cle_fusion));
      const toCreate = PRODUCE_SEED.filter(
        (item) => !existingKeys.has(buildMergeKey(item.nom, '', 1, 'unite')),
      );
      for (const item of toCreate) {
        await applyEntry({
          nom: item.nom,
          marque: '',
          categorie: item.categorie,
          contenance_unitaire: 1,
          unite: 'unite',
          delta: 0,
          code_barre: null,
        });
      }
      await syncNow({ interactive: true });
      setSeedResult(
        toCreate.length > 0
          ? `${toCreate.length} produit(s) ajouté(s) à zéro.`
          : 'Tous les fruits/légumes courants sont déjà dans l\'inventaire.',
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
        <h2>Catalogue</h2>
        <p className="settings__hint">
          Ajoute les fruits et légumes courants à l'inventaire avec une quantité de 0 (utile car ils
          n'ont généralement pas de code-barre à scanner).
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
