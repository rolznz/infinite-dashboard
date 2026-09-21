export interface TriageResult {
  accepted: boolean;
  reason?: string;
}

/** M1: everything is accepted. M1.5 replaces this body with Jev (TypeSafe) judgments. */
export async function triage(_prompt: string): Promise<TriageResult> {
  return { accepted: true };
}
