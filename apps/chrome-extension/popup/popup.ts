const statusEl = document.getElementById('status') as HTMLDivElement;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const spreadsheetInput = document.getElementById('spreadsheet-id') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const lastImportEl = document.getElementById('last-import') as HTMLDivElement;

function setStatus(connected: boolean, detail?: string): void {
  statusEl.textContent = connected ? 'Connecté à Google' : (detail ?? 'Non connecté à Google');
  statusEl.className = `status ${connected ? 'ok' : 'ko'}`;
}

async function refreshConnectionStatus(): Promise<void> {
  try {
    // interactive:false : on ne veut pas ouvrir de popin de consentement juste
    // pour rafraîchir un statut, seulement lire si un token est déjà en cache.
    const result = await chrome.identity.getAuthToken({ interactive: false });
    setStatus(Boolean(result?.token));
  } catch {
    setStatus(false);
  }
}

async function loadConfig(): Promise<void> {
  const { spreadsheetId } = await chrome.storage.sync.get('spreadsheetId');
  if (typeof spreadsheetId === 'string') {
    spreadsheetInput.value = spreadsheetId;
  }

  const { lastImportCount, lastImportDate } = await chrome.storage.local.get([
    'lastImportCount',
    'lastImportDate',
  ]);
  if (typeof lastImportCount === 'number' && typeof lastImportDate === 'string') {
    const date = new Date(lastImportDate);
    lastImportEl.textContent = `Dernier import : ${lastImportCount} article(s) le ${date.toLocaleString('fr-FR')}`;
  }
}

connectBtn.addEventListener('click', () => {
  chrome.identity.getAuthToken({ interactive: true }).then(
    (result) => setStatus(Boolean(result?.token)),
    (err: unknown) => setStatus(false, err instanceof Error ? err.message : 'Échec de connexion'),
  );
});

saveBtn.addEventListener('click', () => {
  const spreadsheetId = spreadsheetInput.value.trim();
  chrome.storage.sync.set({ spreadsheetId }).then(() => {
    saveBtn.textContent = 'Enregistré ✓';
    setTimeout(() => {
      saveBtn.textContent = 'Enregistrer';
    }, 1500);
  });
});

void refreshConnectionStatus();
void loadConfig();
