import { useState } from 'react';
import { useInventoryStore } from '../../store/inventoryStore';
import '../../styles/LoginGate.css';

interface LoginGateProps {
  checking: boolean;
}

/**
 * Porte d'entrée obligatoire : tant qu'aucun jeton Google valide n'a été obtenu, l'app n'affiche
 * ni l'inventaire ni aucune donnée du cache local — seulement cet écran. Empêche quiconque
 * ouvrant l'URL publique de la PWA (hébergement statique, sans authentification serveur) de voir
 * le contenu sans être un compte explicitement autorisé sur le Google Sheet.
 */
export function LoginGate({ checking }: LoginGateProps) {
  const syncNow = useInventoryStore((s) => s.syncNow);
  const syncError = useInventoryStore((s) => s.syncError);
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    setBusy(true);
    try {
      // interactive: true -> peut ouvrir la popup de consentement Google, légitime ici car
      // déclenché par un clic direct de l'utilisateur.
      await syncNow({ interactive: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-gate">
      <h1>Inventaire Domestique</h1>
      {checking ? (
        <p className="login-gate__hint">Vérification de la connexion…</p>
      ) : (
        <>
          <p className="login-gate__hint">Connexion à un compte Google autorisé requise pour accéder à l'inventaire.</p>
          <button type="button" className="login-gate__button" onClick={handleConnect} disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter à Google'}
          </button>
          {syncError && <p className="login-gate__error">{syncError}</p>}
        </>
      )}
    </div>
  );
}
