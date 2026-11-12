// Disk-backed intelligence snapshot cache; never persists credentials.

import fs from 'node:fs';
import path from 'node:path';
import type {
  DatabaseIntelligenceSnapshot,
  IntelligenceCategoryStatus,
  IntelligenceFreshnessState,
} from '@idp/shared';

const intelligenceMap = new Map<string, DatabaseIntelligenceSnapshot>();
let activeStoragePath: string | null = null;

function resolveStoragePath(): string {
  if (activeStoragePath) return activeStoragePath;
  if (process.env.DBFLOW_INTELLIGENCE_CACHE_FILE) {
    return path.resolve(process.env.DBFLOW_INTELLIGENCE_CACHE_FILE);
  }
  return path.resolve(process.cwd(), 'data', 'intelligence-cache.json');
}

// Loads cached snapshots from disk into memory.
function loadFromDisk(): void {
  try {
    const filePath = resolveStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const items: DatabaseIntelligenceSnapshot[] = JSON.parse(raw);
      intelligenceMap.clear();
      for (const item of items) {
        if (item && item.connectionId) {
          intelligenceMap.set(item.connectionId, item);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load intelligence cache from disk, starting empty:', err);
  }
}

// Atomically writes cache to disk via temp file rename.
function flushToDisk(): void {
  try {
    const filePath = resolveStoragePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(Array.from(intelligenceMap.values()), null, 2);
    fs.writeFileSync(tempPath, payload, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.warn('Failed to flush intelligence cache to disk:', err);
  }
}

loadFromDisk();

// Reinitializes store with optional custom path for tests.
export function reinitIntelligenceStore(customFilePath?: string): void {
  if (customFilePath !== undefined) {
    activeStoragePath = customFilePath;
  }
  loadFromDisk();
}

// Clears cache in memory and removes disk file.
export function clearAllIntelligenceForTest(): void {
  intelligenceMap.clear();
  const filePath = resolveStoragePath();
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

// Gets the snapshot for a connection.
export function getIntelligence(connectionId: string): DatabaseIntelligenceSnapshot | null {
  return intelligenceMap.get(connectionId) || null;
}

// Persists or updates a snapshot in the cache.
export function saveIntelligence(
  snapshotOrConnId: DatabaseIntelligenceSnapshot | string,
  maybeSnapshot?: DatabaseIntelligenceSnapshot
): void {
  const snapshot = typeof snapshotOrConnId === 'string' ? maybeSnapshot! : snapshotOrConnId;
  const connId = typeof snapshotOrConnId === 'string' ? snapshotOrConnId : snapshot?.connectionId;
  if (!snapshot || !connId) return;
  snapshot.connectionId = connId;
  intelligenceMap.set(connId, snapshot);
  flushToDisk();
}

// Updates category statuses or freshness state.
export function updateCategoryStatus(
  connectionId: string,
  categoryUpdates: Partial<IntelligenceCategoryStatus>,
  freshnessState?: IntelligenceFreshnessState,
  errorMessage?: string
): DatabaseIntelligenceSnapshot | null {
  const current = intelligenceMap.get(connectionId);
  if (!current) return null;

  current.categoryStatus = {
    ...current.categoryStatus,
    ...categoryUpdates,
  };

  if (freshnessState) {
    current.freshnessState = freshnessState;
  }
  if (errorMessage !== undefined) {
    current.errorMessage = errorMessage;
  }

  saveIntelligence(current);
  return current;
}

// Removes intelligence for a closed connection.
export function deleteIntelligence(connectionId: string): boolean {
  const existed = intelligenceMap.delete(connectionId);
  if (existed) {
    flushToDisk();
  }
  return existed;
}

// Retrieves all active snapshots without sensitive credentials.
export function listAllIntelligence(): DatabaseIntelligenceSnapshot[] {
  return Array.from(intelligenceMap.values());
}
