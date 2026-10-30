export function schemaConnectionScope(engine: string, connection: { host: string; port: string; database: string; username: string }) {
  const identity = [connection.host.trim().toLocaleLowerCase(), String(connection.port).trim(), connection.database.trim(), connection.username.trim()];
  return `${engine}:${encodeURIComponent(JSON.stringify(identity))}`;
}

/** Read a persistent schema preference, migrating values from the old tab-only store. */
export function readSchemaPreference(key: string, fallback: string, legacyKey?: string): string {
  try {
    const persistent = localStorage.getItem(key);
    if (persistent !== null) return persistent;
  } catch { /* Use the tab-scoped fallback when persistent storage is unavailable. */ }

  for (const candidate of [key, ...(legacyKey ? [legacyKey] : [])]) {
    let legacy: string | null = null;
    try { legacy = sessionStorage.getItem(candidate); } catch { /* Continue with persistent legacy storage. */ }
    if (legacy === null) {
      try { legacy = localStorage.getItem(candidate); } catch { /* Continue to the next legacy key. */ }
    }
    if (legacy === null) continue;
    try {
      localStorage.setItem(key, legacy);
      if (candidate === key) sessionStorage.removeItem(key);
    } catch { /* Keep the migrated value usable even if migration cannot be persisted. */ }
    return legacy;
  }
  return fallback;
}

export function writeSchemaPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    try { sessionStorage.setItem(key, value); } catch { /* Preferences are optional when browser storage is restricted. */ }
  }
}
