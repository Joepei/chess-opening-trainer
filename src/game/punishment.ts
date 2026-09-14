import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

import { StockfishEngine } from "@/engine/stockfish-api";

import { DEFAULT_CONFIG, type MoveAnalysis, type TrainerConfig } from "./types";

type LineResult = {
  moves: string[];
  movesSan: string[];
  finalFen: string;
};

// A depth-16 search normally returns a principal variation long enough to cover
// the punishment horizon. Only when it does not do we spend extra searches, and
// then only a few — walking the whole line one search per ply is what made this
// analysis cost ~24 sequential searches.
const MAX_LINE_EXTENSION_SEARCHES = 4;

const MATERIAL_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export class PunishmentDetector {
  private engine: StockfishEngine;
  private config: TrainerConfig;

  constructor(engine: StockfishEngine, config: TrainerConfig = DEFAULT_CONFIG) {
    this.engine = engine;
    this.config = config;
  }

  async analyzeMove(
    fenBefore: string,
    userMoveUci: string,
    userMoveSan: string,
  ): Promise<MoveAnalysis> {
    const userColor = fenBefore.split(" ")[1] === "w" ? "w" : "b";

    const evalBeforeResult = await this.engine.evaluate(fenBefore, this.config.engineDepth);
    const evalBefore = scoreFromPerspective(fenBefore, evalBeforeResult.score, userColor);

    const boardAfterMove = new Chess(fenBefore);
    const applied = applyUciMove(boardAfterMove, userMoveUci);
    if (!applied) {
      throw new Error(`Invalid user move for position: ${userMoveUci}`);
    }
    const fenAfter = boardAfterMove.fen();

    const evalAfterResult = await this.engine.evaluate(fenAfter, this.config.engineDepth);
    const evalAfter = scoreFromPerspective(fenAfter, evalAfterResult.score, userColor);
    const mateAfter = mateFromPerspective(fenAfter, evalAfterResult.mate, userColor);
    const evalDrop = evalBefore - evalAfter;

    const bestMove = evalBeforeResult.bestMove;
    const bestMoveSan = toSanMove(fenBefore, bestMove) ?? bestMove;
    const continuationLineSan = pvToSan(fenAfter, evalAfterResult.pv, 4);
    const reasonDetails = explainPositionShift(
      new Chess(fenBefore),
      boardAfterMove,
      userColor,
      userMoveUci,
      evalDrop,
    );

    if (evalDrop < this.config.evalThreshold) {
      return {
        isMistake: false,
        isPunishable: false,
        evalBefore,
        evalAfter,
        evalDrop,
        bestMove,
        bestMoveSan,
        punishmentLine: [],
        punishmentLineSan: [],
        continuationLineSan,
        materialChange: 0,
        mateIn: null,
        playedMoveUci: userMoveUci,
        playedMoveSan: userMoveSan,
        reasonDetails,
        explanation: `${userMoveSan} is within the tolerated eval drop.`,
      };
    }

    // Both leaves land the same number of plies past fenBefore: the baseline
    // walks the full horizon, while the punishment line already spent one ply on
    // the move the user actually played. Comparing material at matched depth is
    // what makes "concrete material loss" mean what it says.
    const horizonPlies = Math.max(2, this.config.punishmentDepth);
    const punishmentLine = await this.buildLine(fenAfter, evalAfterResult.pv, horizonPlies - 1);
    const baselineLine = await this.buildLine(fenBefore, evalBeforeResult.pv, horizonPlies);

    const baselineMaterial = materialBalance(new Chess(baselineLine.finalFen), userColor);
    const punishmentMaterial = materialBalance(new Chess(punishmentLine.finalFen), userColor);
    const materialLoss = Math.max(0, baselineMaterial - punishmentMaterial);

    const facingForcedMate = mateAfter !== null && mateAfter < 0;
    const isPunishable = facingForcedMate || materialLoss >= this.config.materialLossThreshold;

    return {
      isMistake: true,
      isPunishable,
      evalBefore,
      evalAfter,
      evalDrop,
      bestMove,
      bestMoveSan,
      punishmentLine: punishmentLine.moves,
      punishmentLineSan: punishmentLine.movesSan,
      continuationLineSan,
      materialChange: materialLoss,
      mateIn: mateAfter !== null && mateAfter < 0 ? Math.abs(mateAfter) : null,
      playedMoveUci: userMoveUci,
      playedMoveSan: userMoveSan,
      reasonDetails,
      explanation: buildCoachExplanation({
        userMoveSan,
        continuationLineSan,
        bestMoveSan,
        reasonDetails,
        scoreLoss: isPunishable ? materialLoss : evalDrop,
        mateIn: mateAfter !== null && mateAfter < 0 ? Math.abs(mateAfter) : null,
        isPunishable,
      }),
    };
  }

  async getPunishmentLine(
    fen: string,
    depth: number,
  ): Promise<{
    moves: string[];
    movesSan: string[];
    finalEval: number;
  }> {
    const rootColor = fen.split(" ")[1] === "w" ? "w" : "b";
    const rootEval = await this.engine.evaluate(fen, this.config.engineDepth);
    const line = await this.buildLine(fen, rootEval.pv, depth);
    return {
      moves: line.moves,
      movesSan: line.movesSan,
      finalEval: await this.evaluateFromPerspective(line.finalFen, rootColor),
    };
  }

  updateConfig(config: Partial<TrainerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async shouldContinuePunishment(
    fen: string,
    punishedColor: "w" | "b",
  ): Promise<{
    shouldContinue: boolean;
    bestMove: string | null;
    bestMoveSan: string | null;
    evalFromPunishedSide: number;
  }> {
    // One search supplies both the score and the move to play with it.
    const evalResult = await this.engine.evaluate(fen, this.config.engineDepth);
    const sideToMove = fen.split(" ")[1] === "w" ? "w" : "b";
    const evalFromPunishedSide =
      sideToMove === punishedColor ? evalResult.score : -evalResult.score;
    const shouldContinue = evalFromPunishedSide <= -this.config.materialLossThreshold;

    if (!shouldContinue) {
      return {
        shouldContinue: false,
        bestMove: null,
        bestMoveSan: null,
        evalFromPunishedSide,
      };
    }

    const bestMove = evalResult.bestMove;
    const hasMove = Boolean(bestMove && bestMove !== "(none)");
    return {
      shouldContinue: hasMove,
      bestMove: hasMove ? bestMove : null,
      bestMoveSan: hasMove ? toSanMove(fen, bestMove) : null,
      evalFromPunishedSide,
    };
  }

  private async buildLine(fen: string, pv: string[], plies: number): Promise<LineResult> {
    const board = new Chess(fen);
    const moves: string[] = [];
    const movesSan: string[] = [];

    for (const uci of pv) {
      if (moves.length >= plies || board.isGameOver()) {
        break;
      }
      const applied = applyUciMove(board, uci);
      if (!applied) {
        break;
      }
      moves.push(uci);
      movesSan.push(applied.san);
    }

    let extensions = 0;
    while (
      moves.length < plies &&
      extensions < MAX_LINE_EXTENSION_SEARCHES &&
      !board.isGameOver()
    ) {
      const bestMove = await this.engine.getBestMove(board.fen(), this.config.engineDepth);
      if (!bestMove || bestMove === "(none)") {
        break;
      }

      const applied = applyUciMove(board, bestMove);
      if (!applied) {
        break;
      }

      moves.push(bestMove);
      movesSan.push(applied.san);
      extensions += 1;
    }

    return { moves, movesSan, finalFen: board.fen() };
  }

  private async evaluateFromPerspective(
    fen: string,
    perspectiveColor: "w" | "b",
  ): Promise<number> {
    const evalResult = await this.engine.evaluate(fen, this.config.engineDepth);
    const sideToMove = fen.split(" ")[1] === "w" ? "w" : "b";
    return sideToMove === perspectiveColor ? evalResult.score : -evalResult.score;
  }
}

function buildCoachExplanation(params: {
  userMoveSan: string;
  continuationLineSan: string[];
  bestMoveSan: string;
  reasonDetails: string[];
  scoreLoss: number;
  mateIn: number | null;
  isPunishable: boolean;
}): string {
  const lineText = params.continuationLineSan.length > 0
    ? `${params.userMoveSan}; the likely continuation is ${params.continuationLineSan.join(" ")}`
    : params.userMoveSan;
  const reasonText = params.reasonDetails.join(" and ");
  if (params.mateIn !== null) {
    if (params.isPunishable) {
      return `That is punishable. After ${lineText}, you are facing mate in ${params.mateIn} because ${reasonText}. Best was ${params.bestMoveSan}.`;
    }

    return `Slight inaccuracy. After ${lineText}, you are facing mate in ${params.mateIn} because ${reasonText}. Best was ${params.bestMoveSan}.`;
  }

  const scoreText = describeScoreSwing(params.scoreLoss);
  if (scoreText.kind === "mate") {
    if (params.isPunishable) {
      return `That is punishable. After ${lineText}, you are facing a forced mate because ${reasonText}. Best was ${params.bestMoveSan}.`;
    }

    return `Slight inaccuracy. After ${lineText}, you are facing a forced mate because ${reasonText}. Best was ${params.bestMoveSan}.`;
  }

  if (params.isPunishable) {
    return `That is punishable. After ${lineText}, you end up about ${scoreText.text} of material down because ${reasonText}. Best was ${params.bestMoveSan}.`;
  }

  return `Slight inaccuracy. After ${lineText}, you are about ${scoreText.text} worse because ${reasonText}. Best was ${params.bestMoveSan}.`;
}

function materialBalance(board: Chess, color: Color): number {
  let balance = 0;

  for (const row of board.board()) {
    for (const square of row) {
      if (!square) {
        continue;
      }
      const value = MATERIAL_VALUES[square.type];
      balance += square.color === color ? value : -value;
    }
  }

  return balance;
}

function mateFromPerspective(
  fen: string,
  rawMate: number | null,
  perspectiveColor: "w" | "b",
): number | null {
  if (rawMate === null) {
    return null;
  }

  const sideToMove = fen.split(" ")[1] === "w" ? "w" : "b";
  return sideToMove === perspectiveColor ? rawMate : -rawMate;
}

function explainPositionShift(
  before: Chess,
  after: Chess,
  userColor: Color,
  userMoveUci: string,
  evalDrop: number,
): string[] {
  const reasons: string[] = [];
  const enemyColor: Color = userColor === "w" ? "b" : "w";
  const movedPiece = before.get(userMoveUci.slice(0, 2) as Square);
  const maxHangingBefore = getMaxHangingPieceValue(before, userColor);
  const maxHangingAfter = getMaxHangingPieceValue(after, userColor);

  if (maxHangingAfter > maxHangingBefore) {
    reasons.push(describeHangingPiece(after, userColor));
  }

  const centerBefore = countCenterPressure(before, userColor);
  const centerAfter = countCenterPressure(after, userColor);
  if (centerAfter <= centerBefore - 2) {
    reasons.push("you gave up control of the center");
  }

  const developedBefore = countDevelopedMinorPieces(before, userColor);
  const developedAfter = countDevelopedMinorPieces(after, userColor);
  if (
    movedPiece &&
    (movedPiece.type === "q" || movedPiece.type === "r") &&
    developedBefore < 2 &&
    developedAfter === developedBefore
  ) {
    reasons.push("you spent a tempo on a heavy piece instead of development");
  }

  if (developedAfter < developedBefore) {
    reasons.push("your pieces became less active");
  }

  if (lostCastlingFlexibility(before, after, userColor)) {
    reasons.push("your king is still stuck in the center");
  }

  if (openedLinesTowardKing(before, after, userColor, enemyColor)) {
    reasons.push("you opened lines toward your king");
  }

  if (evalDrop >= 150) {
    reasons.push("you allowed a forcing tactical reply");
  }

  if (reasons.length === 0) {
    reasons.push("the move gives your opponent an easier position");
  }

  return dedupeReasons(reasons).slice(0, 3);
}

function dedupeReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function describeScoreSwing(scoreLoss: number): { kind: "pawns" | "mate"; text: string } {
  if (scoreLoss >= 100000) {
    return { kind: "mate", text: "forced mate" };
  }

  const pawns = Math.max(0.1, scoreLoss / 100);
  if (pawns < 1.05) {
    return { kind: "pawns", text: `${pawns.toFixed(1)} pawn` };
  }
  return { kind: "pawns", text: `${pawns.toFixed(1)} pawns` };
}

function describeHangingPiece(board: Chess, color: Color): string {
  const squares = allSquares();
  let worst: { value: number; piece: PieceSymbol } | null = null;

  for (const square of squares) {
    const piece = board.get(square);
    if (!piece || piece.color !== color) {
      continue;
    }

    const attackers = board.attackers(square, color === "w" ? "b" : "w");
    const defenders = board.attackers(square, color);
    if (attackers.length > 0 && defenders.length === 0) {
      const value = pieceValue(piece.type);
      if (!worst || value > worst.value) {
        worst = { value, piece: piece.type };
      }
    }
  }

  if (!worst) {
    return "you left a piece hanging";
  }

  return `you left your ${pieceName(worst.piece)} hanging`;
}

function getMaxHangingPieceValue(board: Chess, color: Color): number {
  let maxValue = 0;
  for (const square of allSquares()) {
    const piece = board.get(square);
    if (!piece || piece.color !== color) {
      continue;
    }
    const attackers = board.attackers(square, color === "w" ? "b" : "w");
    const defenders = board.attackers(square, color);
    if (attackers.length > 0 && defenders.length === 0) {
      maxValue = Math.max(maxValue, pieceValue(piece.type));
    }
  }
  return maxValue;
}

function countCenterPressure(board: Chess, color: Color): number {
  const centers: Square[] = ["d4", "e4", "d5", "e5"];
  return centers.reduce((sum, square) => sum + board.attackers(square, color).length, 0);
}

function countDevelopedMinorPieces(board: Chess, color: Color): number {
  const homeSquares: Record<Color, Record<PieceSymbol, Square[]>> = {
    w: {
      n: ["b1", "g1"],
      b: ["c1", "f1"],
      p: [],
      r: [],
      q: [],
      k: [],
    },
    b: {
      n: ["b8", "g8"],
      b: ["c8", "f8"],
      p: [],
      r: [],
      q: [],
      k: [],
    },
  };

  let developed = 0;
  for (const square of allSquares()) {
    const piece = board.get(square);
    if (!piece || piece.color !== color) {
      continue;
    }
    if ((piece.type === "n" || piece.type === "b") && !homeSquares[color][piece.type].includes(square)) {
      developed += 1;
    }
  }
  return developed;
}

function lostCastlingFlexibility(before: Chess, after: Chess, color: Color): boolean {
  const beforeFen = before.fen().split(" ");
  const afterFen = after.fen().split(" ");
  const beforeRights = beforeFen[2] ?? "-";
  const afterRights = afterFen[2] ?? "-";
  const kingSquare = findKingSquare(after, color);
  const colorRights = color === "w" ? ["K", "Q"] : ["k", "q"];

  return (
    colorRights.some((right) => beforeRights.includes(right)) &&
    colorRights.every((right) => !afterRights.includes(right)) &&
    kingSquare !== (color === "w" ? "g1" : "g8") &&
    kingSquare !== (color === "w" ? "c1" : "c8")
  );
}

function openedLinesTowardKing(before: Chess, after: Chess, color: Color, enemyColor: Color): boolean {
  const kingSquare = findKingSquare(after, color);
  if (!kingSquare) {
    return false;
  }

  const beforeAttackers = before.attackers(kingSquare, enemyColor).length;
  const afterAttackers = after.attackers(kingSquare, enemyColor).length;
  return afterAttackers >= beforeAttackers + 1;
}

function findKingSquare(board: Chess, color: Color): Square | null {
  for (const square of allSquares()) {
    const piece = board.get(square);
    if (piece?.type === "k" && piece.color === color) {
      return square;
    }
  }
  return null;
}

function pieceValue(piece: PieceSymbol): number {
  switch (piece) {
    case "p":
      return 1;
    case "n":
    case "b":
      return 3;
    case "r":
      return 5;
    case "q":
      return 9;
    case "k":
      return 100;
  }
}

function pieceName(piece: PieceSymbol): string {
  switch (piece) {
    case "p":
      return "pawn";
    case "n":
      return "knight";
    case "b":
      return "bishop";
    case "r":
      return "rook";
    case "q":
      return "queen";
    case "k":
      return "king";
  }
}

function allSquares(): Square[] {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
  const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
  const squares: Square[] = [];

  for (const rank of ranks) {
    for (const file of files) {
      squares.push(`${file}${rank}` as Square);
    }
  }

  return squares;
}

function pvToSan(fen: string, pv: string[], limit: number): string[] {
  const board = new Chess(fen);
  const movesSan: string[] = [];

  for (const move of pv.slice(0, limit)) {
    const applied = applyUciMove(board, move);
    if (!applied) {
      break;
    }
    movesSan.push(applied.san);
  }

  return movesSan;
}

function scoreFromPerspective(fen: string, rawScore: number, perspectiveColor: "w" | "b"): number {
  const sideToMove = fen.split(" ")[1] === "w" ? "w" : "b";
  return sideToMove === perspectiveColor ? rawScore : -rawScore;
}

function applyUciMove(board: Chess, uci: string) {
  if (uci.length < 4) {
    return null;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? uci[4] : undefined;

  try {
    return board.move({ from, to, promotion });
  } catch {
    return null;
  }
}

function toSanMove(fen: string, uci: string): string | null {
  const board = new Chess(fen);
  const applied = applyUciMove(board, uci);
  return applied ? applied.san : null;
}
