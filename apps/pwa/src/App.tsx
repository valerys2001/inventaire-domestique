import { useEffect, useState } from 'react';
import { InventoryList } from './screens/InventoryList/InventoryList';
import { ProductIn } from './screens/ProductIn/ProductIn';
import { ProductOut } from './screens/ProductOut/ProductOut';
import { Settings } from './screens/Settings/Settings';
import { TabBar } from './components/TabBar/TabBar';
import { useInventoryStore } from './store/inventoryStore';
import './styles/App.css';

export type Screen = 'inventaire' | 'entree' | 'sortie' | 'reglages';

export default function App() {
  const [screen, setScreen] = useState<Screen>('inventaire');
  const [sortieTarget, setSortieTarget] = useState<string | null>(null);
  const loadFromCache = useInventoryStore((s) => s.loadFromCache);

  useEffect(() => {
    loadFromCache();
  }, [loadFromCache]);

  const goToSortie = (cleFusion: string) => {
    setSortieTarget(cleFusion);
    setScreen('sortie');
  };

  return (
    <div className="app-shell">
      <main className="app-content">
        {screen === 'inventaire' && <InventoryList onSelectLine={goToSortie} />}
        {screen === 'entree' && <ProductIn />}
        {screen === 'sortie' && (
          <ProductOut initialCleFusion={sortieTarget} onConsumed={() => setSortieTarget(null)} />
        )}
        {screen === 'reglages' && <Settings />}
      </main>
      <TabBar active={screen} onChange={setScreen} />
    </div>
  );
}
