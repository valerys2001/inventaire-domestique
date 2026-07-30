import '../../styles/SearchBox.css';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Barre de recherche générique (nom/marque), réutilisée à l'identique sur tous les écrans qui
 * listent des produits (Inventaire, Entrée, Sortie, Besoins, Liste de courses). */
export function SearchBox({ value, onChange, placeholder, autoFocus }: SearchBoxProps) {
  return (
    <div className="search-box">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Rechercher un produit ou une marque…'}
        className="search-box__input"
        aria-label="Rechercher un produit"
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="search-box__clear"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
        >
          ×
        </button>
      )}
    </div>
  );
}
