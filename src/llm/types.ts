export type ExplanationLocale = "en" | "zh";

export type ExplanationClassification = "inaccuracy" | "punishable";

export type ExplanationEvidenceStrength = "limited" | "concrete";

export interface ExplanationEvidence {
  schemaVersion: 1;
  classification: ExplanationClassification;
  evidenceStrength: ExplanationEvidenceStrength;
  playedMove: {
    uci: string;
    san: string;
  };
  openingBook: {
    positionWasInBook: boolean;
    playedMoveWasInBook: boolean;
    alternativesSan: string[];
  };
  engine: {
    evalBeforeCp: number;
    evalAfterCp: number;
    evalDropCp: number;
    bestMoveUci: string;
    bestMoveSan: string;
    principalVariationSan: string[];
    punishmentLineSan: string[];
    materialLossCp: number;
    forcedMateIn: number | null;
  };
  heuristicSignals: string[];
}

export interface ExplanationRequest {
  locale: ExplanationLocale;
  evidence: ExplanationEvidence;
}

export interface ExplanationResponse {
  explanation: string;
  model: "gpt-5.6-sol";
}

export interface ExplanationDraft {
  whyMoveFallsShort: string;
  betterMoveIdea: string;
  principle: string;
}
