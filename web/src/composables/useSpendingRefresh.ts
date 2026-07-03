const listeners = new Set<() => void>();

export function onSpendingRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSpendingRefresh(): void {
  for (const listener of listeners) {
    listener();
  }
}
