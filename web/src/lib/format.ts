export function timeAgo(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** 950 → "950", 12345 → "12.3k", 1234567 → "1.23M". */
export function formatTokens(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export const EXAMPLES = [
  "A cookie clicker with a counter that remembers my clicks",
  "A button that plays a silly fart sound",
  "Live Bitcoin price that flashes green or red when it moves",
  "Roast any X user based on their latest tweets",
  "A spinning 3D donut made with Three.js that you can drag around",
  "A fortune cookie that cracks open with a random prophecy",
];

/** Jev's fun score is 0-4; people read x/10 more easily. */
export const funOutOf10 = (fun: number) => (fun * 2.5).toFixed(1);
