import { useEffect, useMemo, useRef, useState } from 'react';
import { InventoryList } from './screens/InventoryList/InventoryList';
import { ProductIn } from './screens/ProductIn/ProductIn';
import { ProductOut } from './screens/ProductOut/ProductOut';
import { Besoins } from './screens/Besoins/Besoins';
import { Settings } from './screens/Settings/Settings';
import { LoginGate } from './screens/LoginGate/LoginGate';
import { TabBar } from './components/TabBar/TabBar';
import { useInventoryStore } from './store/inventoryStore';
import { initGoogleAuth, getConfiguredClientId } from './services/googleAuth';
import './styles/App.css';

export type Screen = 'inventaire' | 'entree' | 'sortie' | 'besoins' | 'reglages';

export default function App() {
  const [screen, setScreen] = useState<Screen>('inventaire');
  const [sortieTarget, setSortieTarget] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const loadFromCache = useInventoryStore((s) => s.loadFromCache);
  const syncNow = useInventoryStore((s) => s.syncNow);
  const connected = useInventoryStore((s) => s.connected);
  const seedProduce = useInventoryStore((s) => s.seedProduce);
  const lines = useInventoryStore((s) => s.lines);
  const seededRef = useRef(false);

  const besoinsCount = useMemo(
    () => lines.filter((line) => line.seuil_alerte !== null && line.quantite_totale <= line.seuil_alerte).length,
    [lines],
  );

  useEffect(() => {
    // Le cache local (IndexedDB) est chargé en mémoire mais jamais affiché avant connexion
    // (cf. LoginGate) : la porte d'entrée exige un jeton Google valide avant de révéler quoi que
    // ce soit. La tentative de connexion silencieuse (prompt:'none', pas de popup) permet de ne
    // pas re-demander le login à chaque ouverture si une session + un consentement valides
    // existent déjà côté navigateur.
    (async () => {
      await loadFromCache();
      try {
        await initGoogleAuth(getConfiguredClientId());
        await syncNow();
      } catch (err) {
        console.error('Connexion silencieuse impossible, connexion manuelle requise', err);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [loadFromCache, syncNow]);

  useEffect(() => {
    if (connected && !seededRef.current) {
      seededRef.current = true;
      void seedProduce();
    }
  }, [connected, seedProduce]);

  const goToSortie = (cleFusion: string) => {
    setSortieTarget(cleFusion);
    setScreen('sortie');
  };

  if (!connected) {
    return <LoginGate checking={checkingAuth} />;
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        {screen === 'inventaire' && <InventoryList onSelectLine={goToSortie} />}
        {screen === 'entree' && <ProductIn />}
        {screen === 'sortie' && (
          <ProductOut initialCleFusion={sortieTarget} onConsumed={() => setSortieTarget(null)} />
        )}
        {screen === 'besoins' && <Besoins />}
        {screen === 'reglages' && <Settings />}
      </main>
      <TabBar active={screen} onChange={setScreen} besoinsCount={besoinsCount} />
    </div>
  );
}
