export type Status = "pending" | "triaging" | "accepted" | "denied" | "building" | "testing" | "merged" | "failed";

export interface Widget {
  id: string;
  title: string;
  emoji: string | null;
  author: string | null;
  prompt: string | null;
  createdAt: number;
  base: string;
  version: string;
  likes: number;
  liked: boolean;
  /** Jev's fun rating of the original idea, 0-4. */
  fun: number | null;
}

export interface Suggestion {
  id: string;
  prompt: string;
  author: string | null;
  source: string;
  status: Status;
  reason: string | null;
  widgetId: string | null;
  summary: string | null;
  /** Set when this build is an edit of a live widget. */
  editOf: string | null;
  /** Jev's fun rating, 0-4 (new widgets only, once triaged). */
  fun: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SuggestionEvent {
  id: number;
  status: Status;
  message: string | null;
  at: number;
}

export const IN_PROGRESS: Status[] = ["pending", "triaging", "accepted", "building", "testing"];
