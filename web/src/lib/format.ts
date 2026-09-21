export function timeAgo(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const EXAMPLES = [
  "A cookie clicker with a counter that remembers my clicks",
  "A button that plays a silly fart sound",
  "Live Bitcoin price that flashes green or red when it moves",
  "A tiny pixel pet that gets happier the more people click it",
  "A spinning 3D donut made with Three.js that you can drag around",
  "A fortune cookie that cracks open with a random prophecy",
];
