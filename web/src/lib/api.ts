import type { Suggestion, SuggestionEvent, Widget } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const preview = new URLSearchParams(location.search).get("preview");

export const api = {
  widgets: () =>
    request<{ widgets: Widget[] }>(`/api/widgets${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`).then(
      (r) => r.widgets,
    ),
  like: (id: string) => request<{ likes: number; liked: boolean }>(`/api/widgets/${id}/like`, { method: "POST" }),
  addScore: (delta: number) =>
    request<{ value: number }>("/api/score", { method: "POST", body: JSON.stringify({ delta }) }).then((r) => r.value),
  submit: (body: { prompt: string; author: string; visitor: string }) =>
    request<Suggestion>("/api/suggestions", { method: "POST", body: JSON.stringify(body) }),
  /** The visitor's own builds (ids are kept in their browser). */
  mySuggestions: (ids: string[]) =>
    request<{ suggestions: Suggestion[] }>(`/api/suggestions?ids=${encodeURIComponent(ids.join(","))}`).then(
      (r) => r.suggestions,
    ),
  suggestion: (id: string) => request<{ suggestion: Suggestion; events: SuggestionEvent[] }>(`/api/suggestions/${id}`),
};
