import { CATEGORIES, CATEGORY_LABELS, type Category } from '@inventaire/shared';
import '../../styles/CategoryFilter.css';

interface CategoryFilterProps {
  value: Category | 'toutes';
  onChange: (value: Category | 'toutes') => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div className="category-filter" role="tablist" aria-label="Filtrer par catégorie">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'toutes'}
        className={`category-filter__chip${value === 'toutes' ? ' category-filter__chip--active' : ''}`}
        onClick={() => onChange('toutes')}
      >
        Toutes
      </button>
      {CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          role="tab"
          aria-selected={value === category}
          className={`category-filter__chip${value === category ? ' category-filter__chip--active' : ''}`}
          onClick={() => onChange(category)}
        >
          {CATEGORY_LABELS[category]}
        </button>
      ))}
    </div>
  );
}
