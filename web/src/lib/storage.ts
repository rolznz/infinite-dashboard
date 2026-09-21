/** localStorage that never throws (private mode, blocked storage, …). */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const visitorId: string = (() => {
  let id = load<string | null>("infinitedash:visitor", null);
  if (!id) {
    id = crypto.randomUUID();
    save("infinitedash:visitor", id);
  }
  return id;
})();

const MINE_KEY = "infinitedash:mine";
export const loadMine = () => new Set(load<string[]>(MINE_KEY, []));
export const saveMine = (ids: Set<string>) => save(MINE_KEY, [...ids].slice(-200));
