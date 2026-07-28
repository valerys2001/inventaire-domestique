import { roundForDisplay, type Unit } from '@inventaire/shared';
import '../../styles/UnitSelector.css';

interface UnitSelectorProps {
  unite: Unit;
  value: number;
  onChange: (value: number) => void;
  /**
   * Contenance d'un contenant (bouteille, bidon…), fournie quand connue pour un liquide.
   * On n'achète jamais "0,3 L de vinaigre" : dès qu'elle est fournie, le pas de +/- devient
   * "1 contenant" au lieu d'un pas fixe en litres, pour ne générer que des quantités entières
   * de contenants.
   */
  contenanceUnitaire?: number;
}

const STEP_BY_UNIT: Record<Unit, number> = {
  unite: 1,
  g: 50,
  l: 0.1,
  m: 0.1,
  pourcent: 5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundStep(value: number): number {
  return Math.round(value * 100) / 100;
}

export function UnitSelector({ unite, value, onChange, contenanceUnitaire }: UnitSelectorProps) {
  const step = STEP_BY_UNIT[unite];

  if (unite === 'l' && contenanceUnitaire && contenanceUnitaire > 0) {
    const count = Math.round(value / contenanceUnitaire);
    const setCount = (next: number) => onChange(roundForDisplay(Math.max(0, next) * contenanceUnitaire));

    return (
      <div className="unit-selector unit-selector--stepper">
        <button
          type="button"
          className="unit-selector__button"
          onClick={() => setCount(count - 1)}
          disabled={count <= 0}
          aria-label="Diminuer"
        >
          −
        </button>
        <span className="unit-selector__value unit-selector__value--liquid">
          {count} contenant{count > 1 ? 's' : ''} ({roundForDisplay(count * contenanceUnitaire)} L)
        </span>
        <button
          type="button"
          className="unit-selector__button"
          onClick={() => setCount(count + 1)}
          aria-label="Augmenter"
        >
          +
        </button>
      </div>
    );
  }

  if (unite === 'unite') {
    return (
      <div className="unit-selector unit-selector--stepper">
        <button
          type="button"
          className="unit-selector__button"
          onClick={() => onChange(clamp(value - step, 0, Infinity))}
          aria-label="Diminuer"
        >
          −
        </button>
        <span className="unit-selector__value">{value}</span>
        <button
          type="button"
          className="unit-selector__button"
          onClick={() => onChange(value + step)}
          aria-label="Augmenter"
        >
          +
        </button>
      </div>
    );
  }

  if (unite === 'pourcent') {
    return (
      <div className="unit-selector unit-selector--slider">
        <input
          type="range"
          min={0}
          max={100}
          step={step}
          value={clamp(value, 0, 100)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="unit-selector__slider"
          aria-label="Pourcentage restant"
        />
        <span className="unit-selector__value">{value}%</span>
      </div>
    );
  }

  return (
    <div className="unit-selector unit-selector--numeric">
      <button
        type="button"
        className="unit-selector__button"
        onClick={() => onChange(clamp(roundStep(value - step), 0, Infinity))}
        aria-label="Diminuer"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="unit-selector__input"
        inputMode="decimal"
        aria-label="Quantité"
      />
      <button
        type="button"
        className="unit-selector__button"
        onClick={() => onChange(roundStep(value + step))}
        aria-label="Augmenter"
      >
        +
      </button>
    </div>
  );
}
