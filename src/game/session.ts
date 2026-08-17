import { Chess, type Move } from "chess.js";

import { StockfishEngine } from "@/engine/stockfish-api";
import { OpeningBook } from "@/openings/book-manager";
import { NoopTrainingMemoryStore, type TrainingMemoryStore } from "@/training-memory/memory-store";

import { PunishmentDetector } from "./punishment";
import {
  type BotPreview,
  DEFAULT_CONFIG,
  type GameState,
  type MoveAnalysis,
  type SessionStats,
  type TrainerConfig,
} from "./types";

type BotReasoning = "book" | "punishment" | "engine";

export class GameSession {
  private chess: Chess;
  private engine: StockfishEngine;
  private book: OpeningBook;
  private fullBook: OpeningBook;
  private detector: PunishmentDetector;
  private trainingOpeningName: string | null;
  private userColor: "w" | "b";
  private mode: "book" | "punishment" | "free_play";
  private moveLog: GameState["moveHistory"];
  private stats: SessionStats;
  private config: TrainerConfig;
  private isThinking: boolean;
  private coachMessage: string;
  private pendingBotPreview: BotPreview | null;
  private memoryStore: TrainingMemoryStore;
  private accuracySamples: number[];

  constructor(params: {
    engine: StockfishEngine;
    book: OpeningBook;
    fullBook?: OpeningBook;
    config?: TrainerConfig;
    trainingOpeningName?: string | null;
    userColor?: "white" | "black";
    memoryStore?: TrainingMemoryStore;
  }) {
    this.chess = new Chess();
    this.engine = params.engine;
    this.book = params.book;
    this.fullBook = params.fullBook ?? params.book;
    this.config = params.config || DEFAULT_CONFIG;
    this.detector = new PunishmentDetector(this.engine, this.config);
    this.trainingOpeningName = params.trainingOpeningName ?? null;
    this.userColor = params.userColor === "black" ? "b" : "w";
    this.mode = "book";
    this.moveLog = [];
    this.stats = {
      totalMoves: 0,
      bookMoves: 0,
      mistakes: 0,
      punishments: 0,
      accuracy: 100,
    };
    this.isThinking = false;
    this.coachMessage = "New training game started.";
    this.pendingBotPreview = null;
    this.memoryStore = params.memoryStore ?? new NoopTrainingMemoryStore();
    this.accuracySamples = [];
  }

  async initialize(startMoves?: string[]): Promise<GameState> {
    this.chess = new Chess();
    this.mode = "book";
    this.moveLog = [];
    this.stats = {
      totalMoves: 0,
      bookMoves: 0,
      mistakes: 0,
      punishments: 0,
      accuracy: 100,
    };
    this.coachMessage = "Opening trainer ready.";
    this.pendingBotPreview = null;
    this.accuracySamples = [];

    if (startMoves && startMoves.length > 0) {
      for (const uci of startMoves) {
        const applied = this.applyUciMove(uci);
        if (!applied) {
          throw new Error(`Invalid setup move: ${uci}`);
        }
      }
    }

    if (!this.chess.isGameOver() && this.turnColor() !== this.userColor) {
      this.isThinking = true;
      const initialFen = this.chess.fen();
      const reply = await this.chooseNormalBotMove();
      if (reply) {
        const applied = this.applyUciMove(reply.uci);
        if (applied) {
          await this.recordTrainerBookMoveIfNeeded(initialFen, reply.reasoning, reply.uci, applied.san);
          const openingName = this.book.getOpeningName(this.chess.fen());
          this.coachMessage = reply.reasoning === "book"
            ? openingName
              ? `Following opening theory: ${openingName}.`
              : "Following opening theory."
            : "Out of book. Engine takes over.";
        }
      }
      this.isThinking = false;
    }

    this.rebuildMoveLogFromPosition();

    return this.getState();
  }

  async makeUserMove(moveUci: string): Promise<{
    gameState: GameState;
    analysis: MoveAnalysis | null;
    botMove: { uci: string; san: string } | null;
    botReasoning: BotReasoning;
    coachMessage: string;
  }> {
    const userStep = await this.submitUserMove(moveUci);
    await this.previewBotTurn();
    const botStep = await this.applyPendingBotMove();

    return {
      gameState: botStep.gameState,
      analysis: userStep.analysis,
      botMove: botStep.botMove,
      botReasoning: botStep.botReasoning,
      coachMessage: botStep.coachMessage,
    };
  }

  async submitUserMove(moveUci: string): Promise<{
    gameState: GameState;
    analysis: MoveAnalysis | null;
    coachMessage: string;
  }> {
    if (this.turnColor() !== this.userColor) {
      throw new Error("It is not the user's turn.");
    }

    this.pendingBotPreview = null;
    const fenBefore = this.chess.fen();
    const wasInBookBefore = this.book.isInBook(fenBefore);
    const bookMovesBefore = this.book.getBookMoves(fenBefore);
    const chosenBookMoveBefore = bookMovesBefore.find((move) => move.uci === moveUci) ?? null;
    let outOfBookRecommendation: string | null = null;
    const userMove = this.applyUciMove(moveUci);
    if (!userMove) {
      throw new Error(`Illegal move: ${moveUci}`);
    }

    this.stats.totalMoves += 1;
    const userMoveAppliedUci = toUci(userMove);

    if (this.chess.isGameOver()) {
      this.recordAccuracySample(null);
      this.updateAccuracy();
      this.coachMessage = "Game over.";
      this.rebuildMoveLogFromPosition();
      return {
        gameState: this.getState(),
        analysis: null,
        coachMessage: this.coachMessage,
      };
    }

    let analysis: MoveAnalysis | null = null;

    if (this.mode === "punishment") {
      // The bot response is previewed and applied in the next step.
    } else {
      this.mode = this.book.isInBook(this.chess.fen()) ? "book" : "free_play";
      const isSelectedBookMove = chosenBookMoveBefore !== null;

      // Only moves in the line being drilled are exempt from analysis. Being
      // named somewhere in the ECO data is not evidence a move is good — plenty
      // of dubious lines carry names — so those still get checked.
      if (!isSelectedBookMove) {
        analysis = await this.detector.analyzeMove(fenBefore, moveUci, userMove.san);
      }

      if (analysis?.isMistake && analysis.isPunishable && analysis.punishmentLine.length > 0) {
        this.stats.mistakes += 1;
        this.stats.punishments += 1;
        this.mode = "punishment";
        this.coachMessage =
          analysis.explanation ?? "That was a punishable mistake.";
        const firstPunishmentUci = analysis.punishmentLine[0] ?? null;
        const firstPunishmentSan = analysis.punishmentLineSan[0] ?? firstPunishmentUci;
        if (firstPunishmentUci && firstPunishmentSan) {
          this.pendingBotPreview = {
            reasoning: "punishment",
            plannedMove: {
              uci: firstPunishmentUci,
              san: firstPunishmentSan,
            },
            options: [
              {
                uci: firstPunishmentUci,
                san: firstPunishmentSan,
                detail: "punishing move",
              },
            ],
          };
        }
      } else {
        if (analysis?.isMistake) {
          this.stats.mistakes += 1;
          this.coachMessage =
            analysis.explanation ?? `Slight inaccuracy. Best was ${analysis.bestMoveSan}.`;
        }

        if (!analysis?.isPunishable) {
          outOfBookRecommendation = await this.buildOutOfBookRecommendation(
            fenBefore,
            this.chess.fen(),
            moveUci,
            wasInBookBefore,
            bookMovesBefore,
          );
          if (outOfBookRecommendation) {
            this.coachMessage = analysis?.isMistake && this.coachMessage
              ? `${this.coachMessage} ${outOfBookRecommendation}`
              : outOfBookRecommendation;
          }
        }

        if (!analysis?.isMistake && !outOfBookRecommendation && isSelectedBookMove) {
          const openingName = preferredOpeningFromMove(chosenBookMoveBefore);
          if (this.book.isInBook(this.chess.fen())) {
            this.coachMessage = openingName
              ? `Good move. Still in book: ${openingName}.`
              : "Good move. Still in book.";
          } else {
            this.coachMessage = openingName
              ? `Good move. In book: ${openingName}. Book line ends here, so the engine will continue from this position.`
              : "Good move. That is still a book move, but the stored line ends here, so the engine will continue from this position.";
          }
        } else if (!analysis?.isMistake && !outOfBookRecommendation && this.book.isInBook(this.chess.fen())) {
          const openingName = this.book.getOpeningName(this.chess.fen());
          this.coachMessage = openingName
            ? `Good move. Still in book: ${openingName}.`
            : "Good move. Still in book.";
        } else if (!analysis?.isMistake && !outOfBookRecommendation) {
          this.coachMessage = "Out of book now. Playing best engine moves.";
        }
      }
    }

    this.rebuildMoveLogFromPosition();
    if (analysis) {
      this.attachAnalysisToUserMove(userMoveAppliedUci, analysis);
    }

    if (this.chess.isGameOver()) {
      this.coachMessage = "Game over.";
    }

    this.recordAccuracySample(analysis);
    this.updateAccuracy();

    return {
      gameState: this.getState(),
      analysis,
      coachMessage: this.coachMessage,
    };
  }

  async previewBotTurn(): Promise<BotPreview | null> {
    if (this.chess.isGameOver() || this.turnColor() === this.userColor) {
      this.pendingBotPreview = null;
      return null;
    }

    if (this.pendingBotPreview) {
      return this.pendingBotPreview;
    }

    const fen = this.chess.fen();

    if (this.mode === "punishment") {
      const livePunishment = await this.detector.shouldContinuePunishment(
        fen,
        this.userColor,
      );

      if (livePunishment.shouldContinue && livePunishment.bestMove && livePunishment.bestMoveSan) {
        this.pendingBotPreview = {
          reasoning: "punishment",
          plannedMove: {
            uci: livePunishment.bestMove,
            san: livePunishment.bestMoveSan,
          },
          options: [
            {
              uci: livePunishment.bestMove,
              san: livePunishment.bestMoveSan,
              detail: "forced conversion",
            },
          ],
        };
        return this.pendingBotPreview;
      }

      this.mode = this.book.isInBook(fen) ? "book" : "free_play";
      this.coachMessage = "Concrete punishment is over. Switching back to normal play.";
    }

    if (this.book.isInBook(fen)) {
      const bookMoves = this.book.getBookMoves(fen);
      const plannedMove = await this.chooseAdaptiveBookMove(fen);
      if (plannedMove) {
        this.pendingBotPreview = {
          reasoning: "book",
          plannedMove,
          options: bookMoves.map((move) => ({
            uci: move.uci,
            san: move.san,
            detail: `${Math.round(move.weight * 100)}% book weight`,
          })),
        };
        return this.pendingBotPreview;
      }
    }

    this.pendingBotPreview = null;
    return null;
  }

  async applyPendingBotMove(): Promise<{
    gameState: GameState;
    botMove: { uci: string; san: string } | null;
    botReasoning: BotReasoning;
    coachMessage: string;
  }> {
    if (this.chess.isGameOver() || this.turnColor() === this.userColor) {
      return {
        gameState: this.getState(),
        botMove: null,
        botReasoning: "engine",
        coachMessage: this.coachMessage,
      };
    }

    this.isThinking = true;
    const fenBefore = this.chess.fen();
    const preview = this.pendingBotPreview ?? (await this.previewBotTurn());

    if (preview?.plannedMove) {
      const chosenBookMoveBefore = preview.reasoning === "book"
        ? this.book.getBookMoves(fenBefore).find((move) => move.uci === preview.plannedMove?.uci) ?? null
        : null;
      const applied = this.applyUciMove(preview.plannedMove.uci);
      this.pendingBotPreview = null;
      if (applied) {
        await this.recordTrainerBookMoveIfNeeded(
          fenBefore,
          preview.reasoning,
          preview.plannedMove.uci,
          applied.san,
        );
        this.updateCoachMessageAfterBotMove(preview.reasoning, applied.san, chosenBookMoveBefore);
        this.rebuildMoveLogFromPosition();
        this.updateAccuracy();
        this.isThinking = false;
        return {
          gameState: this.getState(),
          botMove: { uci: toUci(applied), san: applied.san },
          botReasoning: preview.reasoning,
          coachMessage: this.coachMessage,
        };
      }
    }

    const normal = await this.chooseNormalBotMove();
    let botMove: { uci: string; san: string } | null = null;
    let botReasoning: BotReasoning = "engine";

    if (normal) {
      const chosenBookMoveBefore = normal.reasoning === "book"
        ? this.book.getBookMoves(fenBefore).find((move) => move.uci === normal.uci) ?? null
        : null;
      const applied = this.applyUciMove(normal.uci);
      if (applied) {
        await this.recordTrainerBookMoveIfNeeded(fenBefore, normal.reasoning, normal.uci, applied.san);
        botMove = { uci: toUci(applied), san: applied.san };
        botReasoning = normal.reasoning;
        this.updateCoachMessageAfterBotMove(normal.reasoning, applied.san, chosenBookMoveBefore);
      }
    }

    this.pendingBotPreview = null;
    this.rebuildMoveLogFromPosition();
    this.updateAccuracy();
    this.isThinking = false;

    return {
      gameState: this.getState(),
      botMove,
      botReasoning,
      coachMessage: this.coachMessage,
    };
  }

  getState(): GameState {
    return {
      fen: this.chess.fen(),
      moveHistory: [...this.moveLog],
      mode: this.mode,
      currentOpening: this.book.getOpeningName(this.chess.fen()),
      userColor: this.userColor === "w" ? "white" : "black",
      isThinking: this.isThinking,
      gameOver: this.chess.isGameOver(),
      result: getGameResult(this.chess),
      coachMessage: this.coachMessage,
      stats: { ...this.stats },
    };
  }

  getLegalMoves(): string[] {
    return this.chess
      .moves({ verbose: true })
      .map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
  }

  async getHint(): Promise<{ uci: string; san: string }> {
    const uci = await this.engine.getBestMove(this.chess.fen(), this.config.engineDepth);
    const move = this.previewUciMove(uci);
    return {
      uci,
      san: move?.san ?? uci,
    };
  }

  async evaluatePosition(depth = Math.max(8, this.config.engineDepth - 4)): Promise<{
    cpWhite: number;
    mate: number | null;
  }> {
    const fen = this.chess.fen();
    const sideToMove = fen.split(" ")[1];
    const evalResult = await this.engine.evaluate(fen, depth);
    const cpWhite = sideToMove === "w" ? evalResult.score : -evalResult.score;
    return { cpWhite, mate: evalResult.mate };
  }

  updateConfig(config: Partial<TrainerConfig>): void {
    this.config = { ...this.config, ...config };
    this.detector.updateConfig(config);
  }

  getConfig(): TrainerConfig {
    return { ...this.config };
  }

  jumpToPly(plyCount: number): GameState {
    const fullHistory = this.chess.history({ verbose: true });
    const boundedPlyCount = Math.max(0, Math.min(plyCount, fullHistory.length));
    const preservedLog = this.moveLog.map((row) => ({ ...row }));
    const preservedMoves = fullHistory.slice(0, boundedPlyCount).map((move) => toUci(move));

    this.chess = new Chess();
    for (const uci of preservedMoves) {
      this.applyUciMove(uci);
    }

    this.pendingBotPreview = null;
    this.rebuildMoveLogFromPosition();
    this.restoreMoveAnalysis(preservedLog);
    this.mode = this.book.isInBook(this.chess.fen()) ? "book" : "free_play";
    this.coachMessage = boundedPlyCount === fullHistory.length
      ? this.coachMessage
      : "Jumped to an earlier move.";
    this.syncStatsToCurrentPosition();
    return this.getState();
  }

  undoLastMove(): GameState {
    if (this.countUserPlies() === 0) {
      return this.getState();
    }

    const preservedLog = this.moveLog.map((row) => ({ ...row }));

    // Step back to the user's own previous turn. That is one ply when the bot
    // has not replied yet and two once it has; undoing two unconditionally can
    // leave the bot to move with nothing scheduled to move it.
    if (!this.chess.undo()) {
      return this.getState();
    }
    if (this.turnColor() !== this.userColor) {
      this.chess.undo();
    }

    this.pendingBotPreview = null;
    this.rebuildMoveLogFromPosition();
    this.restoreMoveAnalysis(preservedLog);
    this.mode = this.book.isInBook(this.chess.fen()) ? "book" : "free_play";
    this.coachMessage = "Undid last full move.";
    this.syncStatsToCurrentPosition();
    return this.getState();
  }

  playExploreMove(moveUci: string): GameState {
    const applied = this.applyUciMove(moveUci);
    if (!applied) {
      throw new Error(`Illegal move: ${moveUci}`);
    }

    this.pendingBotPreview = null;
    this.mode = this.book.isInBook(this.chess.fen()) ? "book" : "free_play";
    this.coachMessage = this.mode === "book"
      ? "Explore mode. This position is still in book."
      : "Explore mode. Engine evaluation is following this branch.";
    this.rebuildMoveLogFromPosition();
    return this.getState();
  }

  /**
   * Drops session-local state. The engine is owned by the caller and is
   * deliberately left running so it can be reused across drills — spinning up a
   * new one re-instantiates several megabytes of WASM.
   */
  destroy(): void {
    this.pendingBotPreview = null;
    this.accuracySamples = [];
  }

  private turnColor(): "w" | "b" {
    return this.chess.turn() === "w" ? "w" : "b";
  }

  private applyUciMove(uci: string): Move | null {
    if (uci.length < 4) {
      return null;
    }

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length >= 5 ? uci[4] : undefined;

    try {
      return this.chess.move({ from, to, promotion });
    } catch {
      return null;
    }
  }

  private previewUciMove(uci: string): Move | null {
    const preview = new Chess(this.chess.fen());
    if (uci.length < 4) {
      return null;
    }

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length >= 5 ? uci[4] : undefined;

    try {
      return preview.move({ from, to, promotion });
    } catch {
      return null;
    }
  }

  private updateCoachMessageAfterBotMove(
    reasoning: BotReasoning,
    san: string,
    chosenBookMoveBefore: ReturnType<OpeningBook["getBookMoves"]>[number] | null,
  ): void {
    if (reasoning === "book") {
      const openingName = this.book.getOpeningName(this.chess.fen()) ?? preferredOpeningFromMove(chosenBookMoveBefore);
      if (this.book.isInBook(this.chess.fen())) {
        this.coachMessage = openingName
          ? `Following opening theory: ${openingName}.`
          : "Following opening theory.";
      } else {
        this.coachMessage = openingName
          ? `Opening finished with ${san}. ${openingName} ends here, so the engine will continue from this position.`
          : `Opening finished with ${san}. The stored line ends here, so the engine will continue from this position.`;
      }
      return;
    }

    if (
      this.coachMessage === "Opening trainer ready." ||
      this.coachMessage === "New training game started." ||
      this.coachMessage === "Undid last full move." ||
      this.coachMessage.startsWith("Following opening theory:") ||
      this.coachMessage.startsWith("Opening finished with ")
    ) {
      this.coachMessage = "Out of book now. Playing best engine moves.";
    }
  }

  private async chooseNormalBotMove(): Promise<{ uci: string; reasoning: Exclude<BotReasoning, "punishment"> } | null> {
    const fen = this.chess.fen();

    if (this.book.isInBook(fen)) {
      const move = await this.chooseAdaptiveBookMove(fen);
      if (move) {
        this.mode = "book";
        this.stats.bookMoves += 1;
        return { uci: move.uci, reasoning: "book" };
      }
    }

    this.mode = "free_play";
    const bestMove = await this.engine.getBestMove(fen, Math.max(10, this.config.engineDepth - 2));
    if (!bestMove || bestMove === "(none)") {
      return null;
    }

    return { uci: bestMove, reasoning: "engine" };
  }

  private async chooseAdaptiveBookMove(fen: string): Promise<{ uci: string; san: string } | null> {
    const moves = this.book.getBookMoves(fen);
    if (moves.length === 0) {
      return null;
    }

    if (moves.length === 1) {
      return { uci: moves[0].uci, san: moves[0].san };
    }

    const counts = await this.memoryStore.getTrainerBookMoveCounts(this.book.getPositionKey(fen));
    const weightedMoves = moves.map((move) => {
      const repetitionCount = counts.get(move.uci) ?? 0;
      const repetitionPenalty = 1 / (1 + repetitionCount * 0.18);
      return {
        ...move,
        adjustedWeight: move.weight * repetitionPenalty,
      };
    });

    const total = weightedMoves.reduce((sum, move) => sum + move.adjustedWeight, 0);
    if (total <= 0) {
      return { uci: moves[0].uci, san: moves[0].san };
    }

    let roll = Math.random() * total;
    for (const move of weightedMoves) {
      roll -= move.adjustedWeight;
      if (roll <= 0) {
        return { uci: move.uci, san: move.san };
      }
    }

    const fallback = weightedMoves[weightedMoves.length - 1];
    return { uci: fallback.uci, san: fallback.san };
  }

  private async recordTrainerBookMoveIfNeeded(
    fenBefore: string,
    reasoning: BotReasoning,
    uci: string,
    san: string,
  ): Promise<void> {
    if (reasoning !== "book") {
      return;
    }

    await this.memoryStore.recordTrainerBookMove({
      positionKey: this.book.getPositionKey(fenBefore),
      uci,
      san,
      openingName: this.book.getOpeningName(fenBefore),
    });
  }

  private rebuildMoveLogFromPosition(): void {
    const moves = this.chess.history({ verbose: true });
    this.moveLog = [];
    for (const move of moves) {
      const asUci = toUci(move);
      if (move.color === "w") {
        this.moveLog.push({
          moveNumber: this.moveLog.length + 1,
          white: move.san,
          black: null,
          whiteUci: asUci,
          blackUci: null,
        });
      } else if (this.moveLog.length > 0) {
        const row = this.moveLog[this.moveLog.length - 1];
        if (row.black === null) {
          row.black = move.san;
          row.blackUci = asUci;
        } else {
          this.moveLog.push({
            moveNumber: row.moveNumber + 1,
            white: null,
            black: move.san,
            whiteUci: null,
            blackUci: asUci,
          });
        }
      } else {
        this.moveLog.push({
          moveNumber: 1,
          white: null,
          black: move.san,
          whiteUci: null,
          blackUci: asUci,
        });
      }
    }
  }

  private restoreMoveAnalysis(previousLog: GameState["moveHistory"]): void {
    // Analysis is always attached to the user's own move, so it has to be keyed
    // by that move on the way out as well as on the way back in — keying by
    // white's move dropped every result for a player training as black.
    const analysisByKey = new Map<string, MoveAnalysis>();
    for (const row of previousLog) {
      if (row.analysis) {
        const key = this.userColor === "w" ? row.whiteUci : row.blackUci;
        if (key) {
          analysisByKey.set(key, row.analysis);
        }
      }
    }

    for (const row of this.moveLog) {
      const key = this.userColor === "w" ? row.whiteUci : row.blackUci;
      if (key && analysisByKey.has(key)) {
        row.analysis = analysisByKey.get(key);
      }
    }
  }

  private attachAnalysisToUserMove(userUci: string, analysis: MoveAnalysis): void {
    for (let i = this.moveLog.length - 1; i >= 0; i -= 1) {
      const row = this.moveLog[i];
      if (this.userColor === "w" && row.whiteUci === userUci) {
        row.analysis = analysis;
        return;
      }
      if (this.userColor === "b" && row.blackUci === userUci) {
        row.analysis = analysis;
        return;
      }
    }
  }

  private recordAccuracySample(analysis: MoveAnalysis | null): void {
    if (!analysis) {
      // A move played straight out of the drilled line, or one that ended the
      // game, has nothing to measure against.
      this.accuracySamples.push(100);
      return;
    }

    this.accuracySamples.push(
      moveAccuracyPercent(
        winPercentFromCp(analysis.evalBefore),
        winPercentFromCp(analysis.evalAfter),
      ),
    );
  }

  private updateAccuracy(): void {
    if (this.accuracySamples.length === 0) {
      this.stats.accuracy = 100;
      return;
    }

    const total = this.accuracySamples.reduce((sum, value) => sum + value, 0);
    this.stats.accuracy = total / this.accuracySamples.length;
  }

  private syncStatsToCurrentPosition(): void {
    this.stats.totalMoves = this.countUserPlies();
    this.stats.mistakes = this.countLoggedMistakes();
    this.stats.punishments = this.countLoggedPunishments();
    this.accuracySamples.length = Math.min(this.accuracySamples.length, this.stats.totalMoves);
    this.updateAccuracy();
  }

  private countUserPlies(): number {
    return this.moveLog.reduce((count, row) => {
      if (this.userColor === "w") {
        return count + (row.whiteUci ? 1 : 0);
      }
      return count + (row.blackUci ? 1 : 0);
    }, 0);
  }

  private countLoggedMistakes(): number {
    return this.moveLog.reduce((count, row) => count + (row.analysis?.isMistake ? 1 : 0), 0);
  }

  private countLoggedPunishments(): number {
    return this.moveLog.reduce((count, row) => count + (row.analysis?.isPunishable ? 1 : 0), 0);
  }

  private async buildOutOfBookRecommendation(
    fenBefore: string,
    fenAfter: string,
    userMoveUci: string,
    wasInBookBefore: boolean,
    bookMovesBefore: ReturnType<OpeningBook["getBookMoves"]>,
  ): Promise<string | null> {
    if (!wasInBookBefore) {
      return null;
    }

    if (bookMovesBefore.some((move) => move.uci === userMoveUci)) {
      return null;
    }

    const alternatives = bookMovesBefore.slice(0, 3);
    if (alternatives.length === 0) {
      return null;
    }

    const moveSan = applyUciToBoard(new Chess(fenBefore), userMoveUci)?.san ?? userMoveUci;
    const recommendationParts: string[] = [];

    for (const alternative of alternatives) {
      const alternativeBoard = new Chess(fenBefore);
      const applied = applyUciToBoard(alternativeBoard, alternative.uci);
      if (!applied) {
        continue;
      }

      const openingName = describeAlternativeOpening(
        this.fullBook.identifyPosition(alternativeBoard.fen()),
        this.trainingOpeningName,
      );
      recommendationParts.push(
        openingName ? `${alternative.san} -> ${openingName}` : `${alternative.san} -> stays in book`,
      );
    }

    if (recommendationParts.length === 0) {
      return null;
    }

    if (this.trainingOpeningName) {
      const generalBookMove = this.fullBook.getBookMoves(fenBefore).some((move) => move.uci === userMoveUci);
      const identifiedOpenings = this.fullBook.identifyPosition(fenAfter);
      const resultingOpening = pickAlternativeOpening(identifiedOpenings, this.trainingOpeningName);
      const transposesToKnownOpening = Boolean(resultingOpening);
      if (generalBookMove || transposesToKnownOpening) {
        await this.memoryStore.recordPlayableMove({
          sourceOpening: this.trainingOpeningName,
          resultingOpening,
          fen: fenBefore,
          playedUci: userMoveUci,
          playedSan: moveSan,
        });
      }
      const leadIn = generalBookMove || transposesToKnownOpening
        ? `${moveSan} is a playable move, but it does not stay in ${this.trainingOpeningName}.`
        : `${moveSan} leaves ${this.trainingOpeningName}.`;
      const contrast = resultingOpening
        ? ` It is steering the game toward ${resultingOpening} instead.`
        : "";
      const bestLine = alternatives.length === 1
        ? ` To stay in that line, play ${recommendationParts[0]}.`
        : ` To stay in that line, choose ${recommendationParts.join("; ")}.`;
      return `${leadIn}${contrast}${bestLine}`;
    }

    return `That move leaves book. Book alternatives: ${recommendationParts.join("; ")}.`;
  }
}

function toUci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

// Centipawns are not linear in how much a move actually cost you: dropping from
// +900 to +600 barely changes the result, while 0 to -300 changes it a lot.
// Mapping through win probability first is how Lichess and chess.com derive
// accuracy, and it makes the number comparable to the ones users see there.
function winPercentFromCp(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

function moveAccuracyPercent(winBefore: number, winAfter: number): number {
  const drop = winBefore - winAfter;
  if (drop <= 0) {
    return 100;
  }

  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

function getGameResult(chess: Chess): string | null {
  if (!chess.isGameOver()) {
    return null;
  }

  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "0-1" : "1-0";
  }

  if (chess.isStalemate()) {
    return "1/2-1/2 (stalemate)";
  }

  if (chess.isDraw()) {
    return "1/2-1/2 (draw)";
  }

  return "game over";
}

function applyUciToBoard(board: Chess, uci: string): Move | null {
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

function pickAlternativeOpening(
  identities: Array<{ family: string; practice: string }>,
  selectedOpening: string,
): string | null {
  const selected = selectedOpening.trim().toLowerCase();

  for (const identity of identities) {
    const practice = identity.practice.trim().toLowerCase();
    const family = identity.family.trim().toLowerCase();
    if (practice === selected || family === selected || practice.startsWith(`${selected}:`)) {
      continue;
    }
    return identity.practice;
  }

  return identities[0]?.practice ?? null;
}

function describeAlternativeOpening(
  identities: Array<{ family: string; practice: string }>,
  selectedOpening: string | null,
): string | null {
  if (!selectedOpening) {
    return identities[0]?.practice ?? null;
  }

  const selected = selectedOpening.trim().toLowerCase();
  const matchingDescendant = identities.find((identity) => {
    const practice = identity.practice.trim().toLowerCase();
    return practice === selected || practice.startsWith(`${selected}:`);
  });

  return matchingDescendant?.practice ?? identities[0]?.practice ?? null;
}

function preferredOpeningFromMove(
  move: ReturnType<OpeningBook["getBookMoves"]>[number] | null,
): string | null {
  if (!move || move.openings.length === 0) {
    return null;
  }

  return move.openings
    .slice()
    .sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ?? null;
}
