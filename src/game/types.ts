import type { ExplanationEvidence } from "@/llm/types";

export interface MoveAnalysis {
  isMistake: boolean;
  isPunishable: boolean;
  evalBefore: number;
  evalAfter: number;
  evalDrop: number;
  bestMove: string;
  bestMoveSan: string;
  punishmentLine: string[];
  punishmentLineSan: string[];
  continuationLineSan: string[];
  materialChange: number;
  mateIn: number | null;
  playedMoveUci: string;
  playedMoveSan: string;
  reasonDetails: string[];
  explanation?: string;
  explanationEvidence?: ExplanationEvidence;
}

export interface BotPreviewOption {
  uci: string;
  san: string;
  detail: string;
}

export interface BotPreview {
  reasoning: "book" | "punishment" | "engine";
  plannedMove: {
    uci: string;
    san: string;
  };
  options: BotPreviewOption[];
}

export interface GameState {
  fen: string;
  moveHistory: Array<{
    moveNumber: number;
    white: string | null;
    black: string | null;
    whiteUci: string | null;
    blackUci: string | null;
    analysis?: MoveAnalysis;
  }>;
  mode: "book" | "punishment" | "free_play";
  currentOpening: string | null;
  userColor: "white" | "black";
  isThinking: boolean;
  gameOver: boolean;
  result: string | null;
  coachMessage: string;
  stats: SessionStats;
}

export interface SessionStats {
  totalMoves: number;
  bookMoves: number;
  mistakes: number;
  punishments: number;
  accuracy: number;
}

export interface TrainerConfig {
  punishmentDepth: number;
  evalThreshold: number;
  materialLossThreshold: number;
  engineDepth: number;
}

export const DEFAULT_CONFIG: TrainerConfig = {
  punishmentDepth: 10,
  evalThreshold: 50,
  materialLossThreshold: 100,
  engineDepth: 16,
};
