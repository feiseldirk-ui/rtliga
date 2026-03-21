const STORAGE_KEY = "rtliga_verein";

export function readVereinSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.vereinsname) return null;
    return {
      id: parsed.id,
      vereinsname: parsed.vereinsname,
    };
  } catch {
    clearVereinSession();
    return null;
  }
}

export function writeVereinSession(verein) {
  if (!verein?.id || !verein?.vereinsname) return;
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      id: verein.id,
      vereinsname: verein.vereinsname,
    })
  );
}

export function clearVereinSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
