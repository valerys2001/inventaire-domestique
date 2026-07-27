/// <reference types="vite/client" />

/**
 * Authentification via Google Identity Services (GIS), pas gapi.client (trop lourd
 * pour du simple OAuth2 implicite côté navigateur). Un seul scope est demandé :
 * l'accès complet à Sheets, requis pour lire ET écrire l'inventaire partagé.
 */

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface TokenClientErrorResponse {
  type: string;
  message?: string;
}

interface TokenClientOverrideConfig {
  prompt?: '' | 'none' | 'consent' | 'select_account';
  callback?: (response: TokenResponse) => void;
  error_callback?: (error: TokenClientErrorResponse) => void;
}

interface TokenClientConfig extends TokenClientOverrideConfig {
  client_id: string;
  scope: string;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: TokenClientOverrideConfig) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// Résolveurs de la demande de jeton en cours. Google Identity Services n'invoque pas de façon
// fiable les `callback`/`error_callback` passés en argument à `requestAccessToken()` — dans
// certains cas la réponse est livrée au callback fourni à `initTokenClient()` à l'initialisation
// à la place (comportement non garanti par la doc). D'où l'écoute sur LES DEUX à la fois, routées
// vers ce résolveur partagé : quel que soit celui que Google invoque réellement, on le capte.
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

function settlePendingToken(response: TokenResponse): void {
  if (!pendingResolve || !pendingReject) return; // aucune demande en cours (déjà réglée ou expirée)
  const resolve = pendingResolve;
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;

  if (response.error) {
    reject(new Error(response.error_description ?? response.error));
    return;
  }
  cachedToken = response.access_token;
  tokenExpiresAt = Date.now() + response.expires_in * 1000;
  resolve(response.access_token);
}

function rejectPendingToken(error: Error): void {
  if (!pendingReject) return;
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  reject(error);
}

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Échec du chargement de Google Identity Services')));
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Échec du chargement de Google Identity Services'));
    document.head.appendChild(script);
  });
}

export function initGoogleAuth(clientId: string): Promise<void> {
  return loadGsiScript().then(() => {
    if (!window.google?.accounts?.oauth2) {
      throw new Error('window.google.accounts.oauth2 indisponible après chargement du script GSI');
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SPREADSHEETS_SCOPE,
      callback: settlePendingToken,
      error_callback: (error) => rejectPendingToken(new Error(error.message ?? error.type)),
    });
  });
}

// Filet de sécurité additionnel : si même le callback d'initialisation ne se déclenche jamais
// (popup fermée manuellement sans action, écran d'erreur Google non reconnu comme tel, etc.),
// on ne reste pas bloqué indéfiniment et on ne gèle pas silencieusement l'appelant (ex: syncNow).
const ACCESS_TOKEN_TIMEOUT_MS = 20_000;
// Le mode silencieux (prompt:'none') n'affiche jamais d'UI : soit Google répond vite (session +
// consentement déjà valides), soit il échoue vite. Pas besoin d'attendre aussi longtemps qu'un
// flux interactif où l'utilisateur doit choisir un compte / lire un écran de consentement.
const SILENT_ACCESS_TOKEN_TIMEOUT_MS = 8_000;

/**
 * `interactive: true` (par défaut) autorise Google à afficher une popup (choix de compte,
 * consentement) si nécessaire. `interactive: false` force `prompt: 'none'` : aucune UI ne
 * s'affiche jamais, la demande échoue silencieusement si une réautorisation serait nécessaire.
 * Utilisé pour la synchronisation automatique (au chargement, après chaque saisie) sans jamais
 * interrompre l'utilisateur avec une popup inattendue.
 */
export function requestAccessToken(interactive = true): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return Promise.resolve(cachedToken);
  }

  if (!tokenClient) {
    return Promise.reject(new Error("initGoogleAuth() doit être appelé avant requestAccessToken()"));
  }

  const tokenPromise = new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    // Les callback/error_callback ci-dessous sont fournis en plus par sécurité (au cas où GIS les
    // honore réellement pour cet appel précis) mais settlePendingToken/rejectPendingToken sont
    // idempotents : peu importe lequel des deux jeux de callbacks Google invoque en pratique.
    tokenClient!.requestAccessToken({
      prompt: interactive ? '' : 'none',
      callback: settlePendingToken,
      error_callback: (error) => rejectPendingToken(new Error(error.message ?? error.type)),
    });
  });

  setTimeout(
    () => {
      rejectPendingToken(
        new Error(
          interactive
            ? 'Délai dépassé en attendant la réponse de Google (popup fermée sans réponse ?).'
            : 'Session Google silencieuse indisponible (reconnexion manuelle nécessaire).',
        ),
      );
    },
    interactive ? ACCESS_TOKEN_TIMEOUT_MS : SILENT_ACCESS_TOKEN_TIMEOUT_MS,
  );

  return tokenPromise;
}

export function getCachedToken(): string | null {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  return null;
}

/**
 * Invalide le cache local sans révoquer le grant côté Google. Utilisé par sheetsClient
 * quand un 401 prouve que le jeton en mémoire n'est plus valide côté serveur, pour forcer
 * requestAccessToken() à en émettre un nouveau plutôt que de renvoyer le jeton périmé.
 */
export function invalidateCachedToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export function signOut(): void {
  if (cachedToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cachedToken, () => {});
  }
  invalidateCachedToken();
}

export function getConfiguredClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID manquant dans la configuration du build');
  }
  return clientId;
}

const SPREADSHEET_ID_STORAGE_KEY = 'inventaire.spreadsheetId';

/**
 * L'écran Réglages permet de saisir/écraser l'ID du spreadsheet sans reconstruire
 * l'app (utile pour pointer une instance déjà déployée vers un autre Sheet). Cette
 * surcharge locale est donc prioritaire sur VITE_SPREADSHEET_ID, qui reste la valeur
 * par défaut au premier lancement.
 */
export function getConfiguredSpreadsheetId(): string {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY) : null;
  const spreadsheetId = override || import.meta.env.VITE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('Aucun ID de spreadsheet configuré (ni Réglages, ni VITE_SPREADSHEET_ID au build)');
  }
  return spreadsheetId;
}
