import type { Screen } from '../../App';
import '../../styles/TabBar.css';

interface TabBarProps {
  active: Screen;
  onChange: (screen: Screen) => void;
  besoinsCount?: number;
  listeCount?: number;
}

const TABS: { id: Screen; label: string }[] = [
  { id: 'inventaire', label: 'Inventaire' },
  { id: 'entree', label: 'Entrée' },
  { id: 'sortie', label: 'Sortie' },
  { id: 'besoins', label: 'Besoins' },
  { id: 'liste', label: 'Liste' },
  { id: 'reglages', label: 'Réglages' },
];

export function TabBar({ active, onChange, besoinsCount = 0, listeCount = 0 }: TabBarProps) {
  const badgeFor = (id: Screen) => {
    if (id === 'besoins') return besoinsCount;
    if (id === 'liste') return listeCount;
    return 0;
  };

  return (
    <nav className="tab-bar" aria-label="Navigation principale">
      {TABS.map((tab) => {
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab-bar__item${active === tab.id ? ' tab-bar__item--active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            <span className="tab-bar__label">
              {tab.label}
              {badge > 0 && <span className="tab-bar__badge">{badge}</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
