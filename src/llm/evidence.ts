import type { MoveAnalysis } from "@/game/types";

import type { ExplanationEvidence } from "./types";

const PRINCIPLE_BY_SIGNAL: Array<[RegExp, string]> = [
  [/hanging/, "Check that every piece remains adequately defended before committing to a move."],
  [/center/, "Do not surrender central control without a concrete reason."],
  [/heavy piece instead of development/, "Develop minor pieces before spending tempi on the queen or rooks."],
  [/less active/, "Prefer moves that improve piece activity and coordination."],
  [/king|opened lines/, "Secure the king before opening lines or starting operations elsewhere."],
  [/forcing tactical reply/, "Check the opponent's forcing checks, captures, and threats before moving."],
];

export function buildExplanationEvidence(params: {
  analysis: MoveAnalysis;
  positionWasInBook: boolean;
  playedMoveWasInBook: boolean;
  bookAlternativesSan: string[];
  materialLossThreshold: number;
}): ExplanationEvidence {
  const { analysis } = params;
  const hasConcreteLoss =
    analysis.isPunishable &&
    analysis.punishmentLineSan.length > 0 &&
    (analysis.mateIn !== null || analysis.materialChange >= params.materialLossThreshold);

  return {
    schemaVersion: 1,
    classification: hasConcreteLoss ? "punishable" : "inaccuracy",
    evidenceStrength: hasConcreteLoss ? "concrete" : "limited",
    playedMove: {
      uci: analysis.playedMoveUci,
      san: analysis.playedMoveSan,
    },
    openingBook: {
      positionWasInBook: params.positionWasInBook,
      playedMoveWasInBook: params.playedMoveWasInBook,
      alternativesSan: params.bookAlternativesSan.slice(0, 3),
    },
    engine: {
      evalBeforeCp: analysis.evalBefore,
      evalAfterCp: analysis.evalAfter,
      evalDropCp: analysis.evalDrop,
      bestMoveUci: analysis.bestMove,
      bestMoveSan: analysis.bestMoveSan,
      principalVariationSan: analysis.continuationLineSan.slice(0, 4),
      punishmentLineSan: hasConcreteLoss
        ? analysis.punishmentLineSan.slice(0, 8)
        : [],
      materialLossCp: hasConcreteLoss ? analysis.materialChange : 0,
      forcedMateIn: hasConcreteLoss ? analysis.mateIn : null,
    },
    heuristicSignals: analysis.reasonDetails.slice(0, 3),
  };
}

export function getPrincipleHints(signals: string[]): string[] {
  const hints = signals.flatMap((signal) => {
    const match = PRINCIPLE_BY_SIGNAL.find(([pattern]) => pattern.test(signal));
    return match ? [match[1]] : [];
  });

  const unique = Array.from(new Set(hints)).slice(0, 3);
  return unique.length > 0
    ? unique
    : ["Compare candidate moves and prefer the one that preserves the position's flexibility."];
}
