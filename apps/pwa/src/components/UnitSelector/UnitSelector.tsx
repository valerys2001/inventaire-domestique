import { roundForDisplay, UNIT_LABELS, type Unit } from '@inventaire/shared';
import '../../styles/UnitSelector.css';

interface UnitSelectorProps {
  unite: Unit;
  value: number;
  onChange: (value: number) => void;
  /**
   * Contenance d'un contenant (bouteille, pot…), fournie quand connue pour un produit
   * conditionné (l, g). On n'achète/ne retire jamais "0,3 L de vinaigre" : dès qu'elle est
   * fournie, le pas de +/- devient "1 contenant" au lieu d'un pas fixe en litres/grammes, pour
   * ne générer que des quantités entières de contenants.
   */
  contenanceUnitaire?: number;
  /**
   * Point de départ du décompte : stock réel actuel (quantite_totale) pour "Construction de
   * liste" (on compte les contenants À ACHETER en plus de ce qu'on a déjà, jamais en redivisant
   * une valeur cible par la contenance — le dernier contenant entamé peut être fractionnaire,
   * cf. jauge %, et ça ne doit jamais se répercuter ici) ; 0 pour une sortie de stock (on compte
   * les contenants À RETIRER depuis zéro).
   */
  baseValue?: number;
  /** Borne supérieure du nombre de contenants sélectionnable (ex: on ne peut pas retirer plus de contenants qu'on en a). */
  maxCount?: number;
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

export function UnitSelector({ unite, value, onChange, contenanceUnitaire, baseValue, maxCount }: UnitSelectorProps) {
  const step = STEP_BY_UNIT[unite];

  if ((unite === 'l' || unite === 'g') && contenanceUnitaire && contenanceUnitaire > 0 && baseValue !== undefined) {
    // Contenants déjà possédés (le dernier peut être entamé/fractionnaire) : purement indicatif
    // pour l'affichage, jamais utilisé pour calculer ce qu'il faut acheter/retirer.
    const ownedCount = Math.round(baseValue / contenanceUnitaire);
    // Contenants au-delà de baseValue (à acheter si baseValue = stock actuel, à retirer si
    // baseValue = 0), comptés à partir de ce point de départ : garantit un écart toujours
    // multiple entier de la contenance, quel que soit le % du dernier contenant.
    const beyondBase = Math.max(0, Math.round((value - baseValue) / contenanceUnitaire));
    const totalCount = ownedCount + beyondBase;

    const setBeyondBase = (next: number) => {
      const clamped = maxCount !== undefined ? clamp(next, 0, maxCount) : Math.max(0, next);
      onChange(roundForDisplay(baseValue + clamped * contenanceUnitaire));
    };

    // Le stepper par contenant reste l'action principale, mais un ajustement fin en litres/
    // grammes reste utile (ex: retirer 1,7 L précisément) — les deux visibles en permanence,
    // jamais l'un sans l'autre, et toujours synchronisés sur la même valeur.
    const preciseMax = maxCount !== undefined ? baseValue + maxCount * contenanceUnitaire : Infinity;
    const preciseStep = STEP_BY_UNIT[unite];

    return (
      <div className="unit-selector unit-selector--dual">
        <div className="unit-selector__row">
          <button
            type="button"
            className="unit-selector__button"
            onClick={() => setBeyondBase(beyondBase - 1)}
            disabled={beyondBase <= 0}
            aria-label="Diminuer"
          >
            −
          </button>
          <span className="unit-selector__value unit-selector__value--liquid">
            {unite === 'g'
              ? `${totalCount} × ${roundForDisplay(contenanceUnitaire)} ${UNIT_LABELS.g}`
              : `${totalCount} contenant${totalCount > 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            className="unit-selector__button"
            onClick={() => setBeyondBase(beyondBase + 1)}
            disabled={maxCount !== undefined && beyondBase >= maxCount}
            aria-label="Augmenter"
          >
            +
          </button>
        </div>
        <div className="unit-selector__row unit-selector__row--precise">
          <span className="unit-selector__precise-label">Précis</span>
          <button
            type="button"
            className="unit-selector__button unit-selector__button--small"
            onClick={() => onChange(clamp(roundStep(value - preciseStep), baseValue, preciseMax))}
            aria-label="Diminuer (précis)"
          >
            −
          </button>
          <input
            type="number"
            min={baseValue}
            max={maxCount !== undefined ? preciseMax : undefined}
            step={preciseStep}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value), baseValue, preciseMax))}
            className="unit-selector__input unit-selector__input--precise"
            inputMode="decimal"
            aria-label={`Quantité précise (${UNIT_LABELS[unite]})`}
          />
          <span className="unit-selector__precise-unit">{UNIT_LABELS[unite]}</span>
          <button
            type="button"
            className="unit-selector__button unit-selector__button--small"
            onClick={() => onChange(clamp(roundStep(value + preciseStep), baseValue, preciseMax))}
            aria-label="Augmenter (précis)"
          >
            +
          </button>
        </div>
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
