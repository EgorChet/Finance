import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";

const listeners = new Set<() => void>();

export function onSpendingRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSpendingRefresh(): void {
  invalidateSpendingDataCaches();
  for (const listener of listeners) {
    listener();
  }
}
