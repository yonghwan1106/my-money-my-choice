// server-only — 인스턴스 메모리 캐시 (구현명세 §6-5): 최대 500개, 넘으면 오래된 것부터 지운다.
const MAX = 500;
const store = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}
export function cacheSet(key: string, value: unknown): void {
  if (store.has(key)) store.delete(key);
  store.set(key, value);
  while (store.size > MAX) {
    const oldest = store.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}
export function cacheSize(): number { return store.size; }
export function cacheClear(): void { store.clear(); }
