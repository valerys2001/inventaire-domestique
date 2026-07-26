import type { Screen } from '../../App';
import '../../styles/TabBar.css';

interface TabBarProps {
  active: Screen;
  onChange: (screen: Screen) => void;
}

const TABS: { id: Screen; label: string }[] = [
  { id: 'inventaire', label: 'Inventaire' },
  { id: 'entree', label: 'Entrée' },
  { id: 'sortie', label: 'Sortie' },
  { id: 'reglages', label: 'Réglages' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Navigation principale">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-bar__item${active === tab.id ? ' tab-bar__item--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="tab-bar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
