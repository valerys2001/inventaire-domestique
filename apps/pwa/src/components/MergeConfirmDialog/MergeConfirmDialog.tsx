import { useEffect, useState } from 'react';
import '../../styles/MergeConfirmDialog.css';

interface MergeConfirmDialogProps {
  message: string;
  durationMs?: number;
  onUndo: () => void;
  onDismiss?: () => void;
}

/**
 * Décision UX : fusion automatique silencieuse, pas de modale bloquante.
 * Ce composant est un toast temporisé affiché après coup, avec un lien pour
 * annuler la fusion et séparer l'entrée en ligne distincte.
 */
export function MergeConfirmDialog({ message, durationMs = 6000, onUndo, onDismiss }: MergeConfirmDialogProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs]);

  if (!visible) return null;

  return (
    <div className="merge-toast" role="status" aria-live="polite">
      <span className="merge-toast__message">{message}</span>
      <button
        type="button"
        className="merge-toast__undo"
        onClick={() => {
          setVisible(false);
          onUndo();
        }}
      >
        Annuler / séparer en ligne distincte
      </button>
    </div>
  );
}
