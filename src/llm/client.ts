import type {
  ExplanationEvidence,
  ExplanationLocale,
  ExplanationResponse,
} from "./types";

export async function requestGroundedExplanation(
  evidence: ExplanationEvidence,
  locale: ExplanationLocale,
): Promise<string | null> {
  try {
    const response = await fetch("/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, evidence }),
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<ExplanationResponse>;
    return payload.model === "gpt-5.6-sol" && typeof payload.explanation === "string"
      ? payload.explanation
      : null;
  } catch {
    return null;
  }
}
