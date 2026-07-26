import type { Unit } from '@inventaire/shared';
import '../../styles/UnitSelector.css';

interface UnitSelectorProps {
  unite: Unit;
  value: number;
  onChange: (value: number) => void;
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

export function UnitSelector({ unite, value, onChange }: UnitSelectorProps) {
  const step = STEP_BY_UNIT[unite];

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
