import { parseExplanationRequest } from "@/llm/grounding";
import { generateExplanation } from "@/llm/server";
import type { ExplanationResponse } from "@/llm/types";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16_384;

export async function GET(): Promise<Response> {
  return Response.json({
    service: "grounded chess explanation proxy",
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
  });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Unable to read request body." }, { status: 400 });
  }
  if (rawBody.length > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseExplanationRequest(body);
  if (!parsed) {
    return Response.json({ error: "Invalid deterministic evidence." }, { status: 400 });
  }

  try {
    const explanation = await generateExplanation(parsed.evidence, parsed.locale);
    const response: ExplanationResponse = {
      explanation,
      model: "gpt-5.6-sol",
    };
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The client deliberately keeps its deterministic explanation when this
    // optional writing layer is unavailable or fails grounding validation.
    return Response.json(
      { error: "Explanation service is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
