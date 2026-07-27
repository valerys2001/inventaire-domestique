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
      callback: () => {},
    });
  });
}

// Filet de sécurité : sur certains navigateurs/scénarios, la popup GIS peut se fermer
// (consentement donné ou non) sans que ni `callback` ni `error_callback` ne soit jamais
// invoqué (cas limite non documenté du SDK). Sans timeout, la promesse resterait bloquée
// indéfiniment et gèlerait silencieusement tout appelant (ex: syncNow) avec elle.
const ACCESS_TOKEN_TIMEOUT_MS = 20_000;

export function requestAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return Promise.resolve(cachedToken);
  }

  if (!tokenClient) {
    return Promise.reject(new Error("initGoogleAuth() doit être appelé avant requestAccessToken()"));
  }

  const tokenPromise = new Promise<string>((resolve, reject) => {
    tokenClient!.requestAccessToken({
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        cachedToken = response.access_token;
        tokenExpiresAt = Date.now() + response.expires_in * 1000;
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type));
      },
    });
  });

  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(
      () => reject(new Error('Délai dépassé en attendant la réponse de Google (popup fermée sans réponse ?).')),
      ACCESS_TOKEN_TIMEOUT_MS,
    );
  });

  return Promise.race([tokenPromise, timeoutPromise]);
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
