import { getPrincipleHints } from "./evidence";
import type {
  ExplanationDraft,
  ExplanationEvidence,
  ExplanationLocale,
  ExplanationRequest,
} from "./types";

const MAX_TEXT_LENGTH = 260;
const MAX_EVIDENCE_ITEMS = 8;
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SAN_PATTERN = /^(?:O-O(?:-O)?[+#]?|[KQRBN]?[a-h1-8]{0,2}x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;
const SAN_IN_PROSE_PATTERN = /(?:^|\s)(?:O-O(?:-O)?|[KQRBN]?[a-h1-8]{0,2}x?[a-h][1-8](?:=[QRBN])?[+#]?)(?=$|[\s.,;:!?])/;

const ALLOWED_HEURISTIC_PATTERNS = [
  /^you left (?:a piece|your (?:pawn|knight|bishop|rook|queen|king)) hanging$/,
  /^you gave up control of the center$/,
  /^you spent a tempo on a heavy piece instead of development$/,
  /^your pieces became less active$/,
  /^your king is still stuck in the center$/,
  /^you opened lines toward your king$/,
  /^you allowed a forcing tactical reply$/,
  /^the move gives your opponent an easier position$/,
];

export function parseExplanationRequest(value: unknown): ExplanationRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const locale = value.locale;
  if (locale !== "en" && locale !== "zh") {
    return null;
  }

  const evidence = parseEvidence(value.evidence);
  return evidence ? { locale, evidence } : null;
}

export function buildModelInput(evidence: ExplanationEvidence): object {
  return {
    classification: evidence.classification,
    evidenceStrength: evidence.evidenceStrength,
    playedMoveSan: evidence.playedMove.san,
    openingBook: evidence.openingBook,
    engine: {
      evalDropCp: evidence.engine.evalDropCp,
      bestMoveSan: evidence.engine.bestMoveSan,
      principalVariationSan: evidence.engine.principalVariationSan,
      punishmentLineSan: evidence.engine.punishmentLineSan,
      materialLossCp: evidence.engine.materialLossCp,
      forcedMateIn: evidence.engine.forcedMateIn,
    },
    heuristicSignals: evidence.heuristicSignals,
    principleHints: getPrincipleHints(evidence.heuristicSignals),
  };
}

export function parseExplanationDraft(value: unknown): ExplanationDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const whyMoveFallsShort = parseDraftField(value.whyMoveFallsShort);
  const betterMoveIdea = parseDraftField(value.betterMoveIdea);
  const principle = parseDraftField(value.principle);

  if (!whyMoveFallsShort || !betterMoveIdea || !principle) {
    return null;
  }

  return { whyMoveFallsShort, betterMoveIdea, principle };
}

export function composeGroundedExplanation(
  evidence: ExplanationEvidence,
  draft: ExplanationDraft,
  locale: ExplanationLocale,
): string {
  const why = asSentence(draft.whyMoveFallsShort);
  const betterIdea = asSentence(draft.betterMoveIdea);
  const principle = asSentence(draft.principle);

  if (locale === "zh") {
    const response = evidence.evidenceStrength === "concrete"
      ? `具体应对：${evidence.engine.punishmentLineSan.join(" ")}。${describeConsequence(evidence, locale)}`
      : "在分析到的变化中，没有发现明确的战术惩罚。";
    return `原因：${why} ${response} 更好的选择：${evidence.engine.bestMoveSan}。${betterIdea} 记住：${principle}`;
  }

  const response = evidence.evidenceStrength === "concrete"
    ? `Concrete response: ${evidence.engine.punishmentLineSan.join(" ")}. ${describeConsequence(evidence, locale)}`
    : "No clear tactical punishment was found in the analyzed line.";
  return `Why: ${why} ${response} Better move: ${evidence.engine.bestMoveSan}. ${betterIdea} Remember: ${principle}`;
}

function describeConsequence(
  evidence: ExplanationEvidence,
  locale: ExplanationLocale,
): string {
  if (evidence.engine.forcedMateIn !== null) {
    return locale === "zh"
      ? `Stockfish 找到 ${evidence.engine.forcedMateIn} 步内的强制将杀。`
      : `Stockfish finds forced mate in ${evidence.engine.forcedMateIn}.`;
  }

  const pawns = Math.max(0.1, evidence.engine.materialLossCp / 100).toFixed(1);
  return locale === "zh"
    ? `这条确定性变化会损失约 ${pawns} 个兵的子力。`
    : `This deterministic line loses about ${pawns} pawns of material.`;
}

function parseEvidence(value: unknown): ExplanationEvidence | null {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }

  const classification = value.classification;
  const evidenceStrength = value.evidenceStrength;
  if (
    (classification !== "inaccuracy" && classification !== "punishable") ||
    (evidenceStrength !== "limited" && evidenceStrength !== "concrete")
  ) {
    return null;
  }

  const playedMove = parseMove(value.playedMove);
  const openingBook = parseOpeningBook(value.openingBook);
  const engine = parseEngine(value.engine);
  const heuristicSignals = parseStringArray(value.heuristicSignals, 3, isAllowedHeuristic);
  if (!playedMove || !openingBook || !engine || !heuristicSignals || heuristicSignals.length === 0) {
    return null;
  }

  const hasConcreteEvidence =
    evidenceStrength === "concrete" &&
    classification === "punishable" &&
    engine.punishmentLineSan.length > 0 &&
    (engine.forcedMateIn !== null || engine.materialLossCp > 0);
  if (evidenceStrength === "concrete" && !hasConcreteEvidence) {
    return null;
  }

  // Limited evidence can carry an engine PV for context, but it must never carry
  // a line labeled as punishment or a concrete material/mate claim.
  if (
    evidenceStrength === "limited" &&
    (classification !== "inaccuracy" ||
      engine.punishmentLineSan.length > 0 ||
      engine.materialLossCp !== 0 ||
      engine.forcedMateIn !== null)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    classification,
    evidenceStrength,
    playedMove,
    openingBook,
    engine,
    heuristicSignals,
  };
}

function parseMove(value: unknown): ExplanationEvidence["playedMove"] | null {
  if (!isRecord(value) || !isUci(value.uci) || !isSan(value.san)) {
    return null;
  }
  return { uci: value.uci, san: value.san };
}

function parseOpeningBook(value: unknown): ExplanationEvidence["openingBook"] | null {
  if (
    !isRecord(value) ||
    typeof value.positionWasInBook !== "boolean" ||
    typeof value.playedMoveWasInBook !== "boolean"
  ) {
    return null;
  }
  const alternativesSan = parseStringArray(value.alternativesSan, 3, isSan);
  if (!alternativesSan) {
    return null;
  }
  return {
    positionWasInBook: value.positionWasInBook,
    playedMoveWasInBook: value.playedMoveWasInBook,
    alternativesSan,
  };
}

function parseEngine(value: unknown): ExplanationEvidence["engine"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const principalVariationSan = parseStringArray(
    value.principalVariationSan,
    4,
    isSan,
  );
  const punishmentLineSan = parseStringArray(
    value.punishmentLineSan,
    MAX_EVIDENCE_ITEMS,
    isSan,
  );
  const forcedMateIn = value.forcedMateIn;
  const hasValidForcedMate =
    forcedMateIn === null ||
    (typeof forcedMateIn === "number" &&
      Number.isInteger(forcedMateIn) &&
      forcedMateIn > 0 &&
      forcedMateIn <= 1_000);
  if (
    !isBoundedNumber(value.evalBeforeCp) ||
    !isBoundedNumber(value.evalAfterCp) ||
    !isBoundedNumber(value.evalDropCp) ||
    !isUci(value.bestMoveUci) ||
    !isSan(value.bestMoveSan) ||
    !principalVariationSan ||
    !punishmentLineSan ||
    !isBoundedNumber(value.materialLossCp) ||
    value.materialLossCp < 0 ||
    !hasValidForcedMate
  ) {
    return null;
  }
  return {
    evalBeforeCp: value.evalBeforeCp,
    evalAfterCp: value.evalAfterCp,
    evalDropCp: value.evalDropCp,
    bestMoveUci: value.bestMoveUci,
    bestMoveSan: value.bestMoveSan,
    principalVariationSan,
    punishmentLineSan,
    materialLossCp: value.materialLossCp,
    forcedMateIn: forcedMateIn as number | null,
  };
}

function parseStringArray(
  value: unknown,
  maxItems: number,
  validator: (item: unknown) => item is string,
): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems || !value.every(validator)) {
    return null;
  }
  return [...value];
}

function parseDraftField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TEXT_LENGTH ||
    /\d/.test(normalized) ||
    SAN_IN_PROSE_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function asSentence(value: string): string {
  return /[.!?。！？]$/.test(value) ? value : `${value}.`;
}

function isAllowedHeuristic(value: unknown): value is string {
  return typeof value === "string" && ALLOWED_HEURISTIC_PATTERNS.some((pattern) => pattern.test(value));
}

function isUci(value: unknown): value is string {
  return typeof value === "string" && UCI_PATTERN.test(value);
}

function isSan(value: unknown): value is string {
  return typeof value === "string" && value.length <= 20 && SAN_PATTERN.test(value);
}

function isBoundedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
