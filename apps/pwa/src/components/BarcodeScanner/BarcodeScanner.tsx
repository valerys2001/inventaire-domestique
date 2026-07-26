import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser';

export interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onError?: (error: Error) => void;
  /** Coupe la caméra quand l'écran n'est pas affiché (évite qu'elle reste allumée en arrière-plan sur mobile). */
  active: boolean;
}

const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
]);

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/** true si l'erreur provient d'un refus/absence de permission caméra plutôt que d'un simple échec de décodage de frame. */
function isPermissionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'NotAllowedError' ||
    err.name === 'PermissionDeniedError' ||
    err.name === 'NotFoundError' ||
    err.name === 'NotReadableError' ||
    err.name === 'SecurityError'
  );
}

export function BarcodeScanner({ onDetected, onError, active }: BarcodeScannerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Refs pour toujours appeler la dernière version des callbacks sans redémarrer la caméra
  // à chaque rendu du parent (les fonctions inline changent d'identité à chaque render).
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  onDetectedRef.current = onDetected;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!active) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      return;
    }

    let cancelled = false;
    setPermissionDenied(false);

    const codeReader = new BrowserMultiFormatReader(HINTS);

    codeReader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, err, controls) => {
        // Reçu à chaque tentative de décodage : on garde une référence à jour pour pouvoir stopper le flux.
        controlsRef.current = controls;

        if (cancelled) {
          controls.stop();
          return;
        }

        if (result) {
          controls.stop();
          controlsRef.current = null;
          onDetectedRef.current(result.getText());
          return;
        }

        // NotFoundException est levée à chaque frame sans code-barres détecté : ce n'est pas une vraie erreur.
        if (err && !(err instanceof NotFoundException)) {
          onErrorRef.current?.(toError(err));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isPermissionError(err)) {
          setPermissionDenied(true);
        }
        onErrorRef.current?.(toError(err));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active]);

  if (!active) {
    return <div className="barcode-scanner barcode-scanner--inactive" />;
  }

  if (permissionDenied) {
    return (
      <div className="barcode-scanner barcode-scanner--denied" role="alert">
        <p>
          Accès à la caméra refusé ou indisponible. Autorisez la caméra dans les réglages du navigateur, ou
          utilisez la saisie manuelle.
        </p>
      </div>
    );
  }

  return (
    <div className="barcode-scanner">
      {/* muted + playsInline sont nécessaires pour l'autoplay caméra sur iOS Safari. */}
      <video ref={videoRef} className="barcode-scanner__video" muted playsInline autoPlay />
    </div>
  );
}
