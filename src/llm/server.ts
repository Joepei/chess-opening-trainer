import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildModelInput,
  composeGroundedExplanation,
  parseExplanationDraft,
} from "./grounding";
import type {
  ExplanationEvidence,
  ExplanationLocale,
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6-sol" as const;
const REQUEST_TIMEOUT_MS = 20_000;

const SYSTEM_INSTRUCTIONS = `You are a writing layer for a deterministic chess trainer.
The supplied opening-book flags, Stockfish values, exact moves/lines, and heuristic signals are the complete and authoritative evidence.
Do not evaluate the position yourself. Do not infer or add any move, square, variation, tactic, threat, material claim, opening fact, or chess detail that is absent from the evidence.
Write only a concise pedagogical rephrasing of the supplied signals. Do not include chess notation, square names, numbers, evaluation values, labels, or headings in your fields; the application inserts all concrete facts itself.
If evidenceStrength is limited, do not imply that a tactical punishment exists. If it is concrete, explain only the consequence already stated by the evidence.
The better-move idea may only describe how the supplied best move avoids the listed weakness. The principle must be supported by one of the supplied principle hints.
Use plain language suitable for a developing club player.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    whyMoveFallsShort: { type: "string" },
    betterMoveIdea: { type: "string" },
    principle: { type: "string" },
  },
  required: ["whyMoveFallsShort", "betterMoveIdea", "principle"],
};

export async function generateExplanation(
  evidence: ExplanationEvidence,
  locale: ExplanationLocale,
): Promise<string> {
  const apiKey = await loadApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: "low" },
        store: false,
        max_output_tokens: 700,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify({
          outputLanguage: locale === "zh" ? "Simplified Chinese" : "English",
          evidence: buildModelInput(evidence),
        }),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "chess_explanation_draft",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw new Error("OpenAI returned no explanation text.");
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(outputText);
    } catch {
      throw new Error("OpenAI returned an invalid explanation payload.");
    }

    const draft = parseExplanationDraft(decoded);
    if (!draft) {
      throw new Error("OpenAI explanation failed grounding validation.");
    }

    return composeGroundedExplanation(evidence, draft, locale);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSecretContents(contents: string): string {
  const trimmed = contents.trim();
  if (!trimmed) {
    throw new Error("secret.txt is empty.");
  }

  const labeledValue = trimmed.match(
    /^(?:OPENAI_API_KEY\s*=|openai-key\s*:)\s*(.+)$/im,
  );
  const rawValue = labeledValue?.[1]?.trim() ?? trimmed;
  const unquoted = rawValue.replace(/^(['"])(.*)\1$/, "$2").trim();
  if (!unquoted || /\s/.test(unquoted)) {
    throw new Error(
      "secret.txt must contain a raw API key, OPENAI_API_KEY=<key>, or openai-key: <key>.",
    );
  }
  return unquoted;
}

async function loadApiKey(): Promise<string> {
  try {
    const contents = await readFile(path.join(process.cwd(), "secret.txt"), "utf8");
    return parseSecretContents(contents);
  } catch (error) {
    const environmentKey = process.env.OPENAI_API_KEY?.trim();
    if (environmentKey) {
      return environmentKey;
    }
    if (error instanceof Error && error.message !== "") {
      throw new Error(`Unable to load the OpenAI API key: ${error.message}`);
    }
    throw new Error("Unable to load the OpenAI API key.");
  }
}

function extractOutputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.output_text === "string") {
    return value.output_text;
  }
  if (!Array.isArray(value.output)) {
    return null;
  }

  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
