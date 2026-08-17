"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChessBoard } from "@/components/ChessBoard";
import { CoachPanel } from "@/components/CoachPanel";
import { EvalBar } from "@/components/EvalBar";
import { MemoryPanel } from "@/components/MemoryPanel";
import { MoveHistory } from "@/components/MoveHistory";
import { NewGameDialog } from "@/components/NewGameDialog";
import { SettingsPanel } from "@/components/SettingsPanel";
import { StockfishEngine } from "@/engine/stockfish-api";
import { GameSession } from "@/game/session";
import { DEFAULT_CONFIG, type BotPreview, type GameState, type MoveAnalysis, type TrainerConfig } from "@/game/types";
import { localizeCoachMessage, type Locale, t } from "@/i18n/messages";
import { translateOpeningName } from "@/i18n/openings";
import { getSharedOpeningBook } from "@/openings/book-manager";
import {
  IndexedDbTrainingMemoryStore,
  type MistakeMemoryItem,
  type OpeningProgressStat,
  type PlayableMoveMemoryItem,
  type TrainerBookMoveStat,
} from "@/training-memory/memory-store";

type StartParams = {
  openingName: string | null;
  color: "white" | "black";
  startMove: number;
  config: TrainerConfig;
};

type OpeningMeta = {
  name: string | null;
  eco: string | null;
};

type SessionSelection = {
  openingName: string | null;
  color: "white" | "black";
  startMove: number;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function HomePage() {
  const sessionRef = useRef<GameSession | null>(null);
  const engineRef = useRef<StockfishEngine | null>(null);
  // Bumped on every new drill so in-flight move handlers from the previous one
  // can tell they are stale and stop writing to state.
  const sessionGenerationRef = useRef(0);
  const evalDisplayRef = useRef<{ cpWhite: number; mate: number | null } | null>(null);
  const memoryStoreRef = useRef(new IndexedDbTrainingMemoryStore());
  const sessionOpeningRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [config, setConfig] = useState<TrainerConfig>(DEFAULT_CONFIG);
  const [locale, setLocale] = useState<Locale>("en");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exploreMode, setExploreMode] = useState(false);
  const [openingMeta, setOpeningMeta] = useState<OpeningMeta>({ name: null, eco: null });
  const [selection, setSelection] = useState<SessionSelection>({
    openingName: null,
    color: "white",
    startMove: 1,
  });
  const [latestAnalysis, setLatestAnalysis] = useState<MoveAnalysis | null>(null);
  const [botPreview, setBotPreview] = useState<BotPreview | null>(null);
  const [evalCpWhite, setEvalCpWhite] = useState(0);
  const [evalMate, setEvalMate] = useState<number | null>(null);
  const [punishmentFlash, setPunishmentFlash] = useState(false);
  const [punishmentShake, setPunishmentShake] = useState(false);
  const [mistakeSquares, setMistakeSquares] = useState<string[]>([]);
  const [openingProgress, setOpeningProgress] = useState<OpeningProgressStat[]>([]);
  const [repeatedTrainerMoves, setRepeatedTrainerMoves] = useState<TrainerBookMoveStat[]>([]);
  const [playableMoves, setPlayableMoves] = useState<PlayableMoveMemoryItem[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<MistakeMemoryItem[]>([]);

  const legalMoves = sessionRef.current?.getLegalMoves() ?? [];

  const lastMoveUci = useMemo(() => {
    if (!gameState || gameState.moveHistory.length === 0) {
      return null;
    }
    const row = gameState.moveHistory[gameState.moveHistory.length - 1];
    return row.blackUci ?? row.whiteUci ?? null;
  }, [gameState]);

  const highlightSquares = useMemo(() => {
    if (!lastMoveUci || lastMoveUci.length < 4) {
      return [];
    }
    return [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)];
  }, [lastMoveUci]);

  const arrowsOnBoard = useMemo(() => {
    if (!latestAnalysis || latestAnalysis.punishmentLine.length === 0) {
      return [];
    }
    return latestAnalysis.punishmentLine.slice(0, 2).map((uci) => ({
      startSquare: uci.slice(0, 2),
      endSquare: uci.slice(2, 4),
      color: "rgba(196,69,54,0.85)",
    }));
  }, [latestAnalysis]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const refreshMemoryDashboard = useCallback(async () => {
    const store = memoryStoreRef.current;
    const [progress, repeated, playable, mistakes] = await Promise.all([
      store.getOpeningProgress(5),
      store.getMostRepeatedTrainerBookMoves(5),
      store.getPlayableMoves(5),
      store.getRecentMistakes(5),
    ]);
    setOpeningProgress(progress);
    setRepeatedTrainerMoves(repeated);
    setPlayableMoves(playable);
    setRecentMistakes(mistakes);
  }, []);

  const startSession = useCallback(async (params: StartParams) => {
    setBusy(true);
    setError(null);
    setLatestAnalysis(null);
    setBotPreview(null);
    setMistakeSquares([]);
    setExploreMode(false);
    evalDisplayRef.current = null;
    setEvalCpWhite(0);
    setEvalMate(null);

    try {
      if (gameStateRef.current && gameStateRef.current.stats.totalMoves > 0) {
        await memoryStoreRef.current.recordSessionSummary({
          openingName: sessionOpeningRef.current,
          totalMoves: gameStateRef.current.stats.totalMoves,
          mistakes: gameStateRef.current.stats.mistakes,
          punishments: gameStateRef.current.stats.punishments,
        });
      }

      sessionRef.current?.destroy();
      sessionGenerationRef.current += 1;

      // The engine outlives individual drills: re-creating it would re-download
      // and re-instantiate several megabytes of WASM on every new game.
      if (!engineRef.current) {
        const created = new StockfishEngine();
        try {
          await created.init();
        } catch (err) {
          created.destroy();
          throw err;
        }
        engineRef.current = created;
      } else {
        await engineRef.current.newGame();
      }
      const engine = engineRef.current;

      const baseBook = getSharedOpeningBook();
      const book = params.openingName ? baseBook.filterByOpening(params.openingName) : baseBook;

      let eco: string | null = null;
      let startMoves: string[] = [];

      if (params.openingName) {
        const openingPrefix = params.openingName;
        const catalogEntry = baseBook
          .getRawData()
          .catalog.find((entry) => getPracticeOpeningPrefix(entry.name) === openingPrefix);
        eco = catalogEntry?.eco ?? null;
        const plies = Math.max(0, (params.startMove - 1) * 2);
        startMoves = (catalogEntry?.moves ?? []).slice(0, plies);
      }

      const session = new GameSession({
        engine,
        book,
        fullBook: baseBook,
        config: params.config,
        trainingOpeningName: params.openingName,
        userColor: params.color,
        memoryStore: memoryStoreRef.current,
      });

      const state = await session.initialize(startMoves);
      sessionRef.current = session;
      setConfig(params.config);
      setSelection({
        openingName: params.openingName,
        color: params.color,
        startMove: params.startMove,
      });
      sessionOpeningRef.current = params.openingName;
      setBotPreview(null);
      setGameState(state);
      setOpeningMeta({ name: params.openingName, eco });
      setDialogOpen(false);
      await refreshMemoryDashboard();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refreshMemoryDashboard]);

  useEffect(() => {
    void startSession({
      openingName: null,
      color: "white",
      startMove: 1,
      config: DEFAULT_CONFIG,
    });

    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [startSession]);

  useEffect(() => {
    void refreshMemoryDashboard();
  }, [refreshMemoryDashboard]);

  useEffect(() => {
    const session = sessionRef.current;
    const fen = gameState?.fen;
    if (!session || !fen) {
      return;
    }

    let cancelled = false;

    void session
      .evaluatePosition()
      .then((result) => {
        if (!cancelled) {
          const smoothed = smoothDisplayedEval(evalDisplayRef.current, result);
          evalDisplayRef.current = smoothed;
          setEvalCpWhite(smoothed.cpWhite);
          setEvalMate(smoothed.mate);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [gameState?.fen]);

  function onBoardMove(uci: string): boolean {
    const session = sessionRef.current;
    if (!session || busy || !gameState || gameState.gameOver) {
      return false;
    }

    if (!isLegalUci(session.getLegalMoves(), uci)) {
      return false;
    }

    if (exploreMode) {
      setError(null);
      setLatestAnalysis(null);
      setBotPreview(null);
      setMistakeSquares([]);
      setPunishmentFlash(false);
      setPunishmentShake(false);
      evalDisplayRef.current = null;
      setGameState(session.playExploreMove(uci));
      return true;
    }

    setBusy(true);
    setError(null);
    setBotPreview(null);
    setMistakeSquares([]);

    const generation = sessionGenerationRef.current;
    const isStale = () => sessionGenerationRef.current !== generation;

    void session
      .submitUserMove(uci)
      .then(async (result) => {
        if (isStale()) {
          return;
        }

        if (result.analysis?.isMistake) {
          const category = result.analysis.isPunishable
            ? "punishable"
            : result.gameState.mode === "free_play"
              ? "left_book"
              : "inaccuracy";
          await memoryStoreRef.current.recordMistake({
            openingName: selection.openingName ?? gameState?.currentOpening ?? null,
            fen: gameState?.fen ?? START_FEN,
            playedUci: uci,
            playedSan: result.gameState.moveHistory[result.gameState.moveHistory.length - 1]?.[selection.color === "white" ? "white" : "black"] ?? uci,
            expectedUci: result.analysis.bestMove,
            expectedSan: result.analysis.bestMoveSan,
            category,
            coachMessage: result.coachMessage,
          });
        }

        setGameState(result.gameState);
        setLatestAnalysis(result.analysis);

        if (result.analysis?.isMistake) {
          setMistakeSquares([uci.slice(2, 4)]);
        }

        if (result.analysis?.isPunishable) {
          setPunishmentFlash(true);
          setPunishmentShake(true);
          window.setTimeout(() => setPunishmentFlash(false), 520);
          window.setTimeout(() => setPunishmentShake(false), 520);
        }

        const preview = await session.previewBotTurn();
        if (isStale()) {
          return;
        }
        setBotPreview(preview);

        if (preview) {
          await delay(1200);
          if (isStale()) {
            return;
          }
        }

        const botResult = await session.applyPendingBotMove();
        if (isStale()) {
          return;
        }
        setGameState(botResult.gameState);
        await refreshMemoryDashboard();
      })
      .catch((err) => {
        if (isStale()) {
          return;
        }
        setError((err as Error).message);
        setBotPreview(null);
        setGameState(session.getState());
      })
      .finally(() => {
        if (!isStale()) {
          setBusy(false);
        }
      });

    return true;
  }

  function switchColor(color: "white" | "black") {
    if (busy || selection.color === color) {
      return;
    }

    const hasProgress = (gameState?.stats.totalMoves ?? 0) > 0;
    if (hasProgress && !window.confirm(t(locale, "discardGameConfirm"))) {
      return;
    }

    void startSession({
      openingName: selection.openingName,
      color,
      startMove: selection.startMove,
      config,
    });
  }

  function updateConfig(next: Partial<TrainerConfig>) {
    const merged = { ...config, ...next };
    setConfig(merged);
    sessionRef.current?.updateConfig(next);
  }

  function undoLastMove() {
    const session = sessionRef.current;
    if (!session || busy || !gameState || gameState.stats.totalMoves <= 0) {
      return;
    }

    setError(null);
    setLatestAnalysis(null);
    setBotPreview(null);
    setMistakeSquares([]);
    setPunishmentFlash(false);
    setPunishmentShake(false);
    evalDisplayRef.current = null;
    setGameState(session.undoLastMove());
  }

  function jumpToMove(plyCount: number) {
    const session = sessionRef.current;
    if (!session || busy || !gameState) {
      return;
    }

    setError(null);
    setLatestAnalysis(null);
    setBotPreview(null);
    setMistakeSquares([]);
    setPunishmentFlash(false);
    setPunishmentShake(false);
    evalDisplayRef.current = null;
    setEvalCpWhite(0);
    setEvalMate(null);
    setGameState(session.jumpToPly(plyCount));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
      <header className="surface flex flex-wrap items-center justify-between rounded-xl px-4 py-3">
        <div>
          <h1 className="font-heading text-3xl leading-tight">{t(locale, "appTitle")}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{t(locale, "appSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded bg-[rgba(232,224,212,0.1)] p-1 text-sm">
            <button
              type="button"
              onClick={() => switchColor("white")}
              className={`rounded px-2 py-1 ${
                selection.color === "white" ? "bg-[var(--accent)] text-black" : ""
              }`}
            >
              {t(locale, "white")}
            </button>
            <button
              type="button"
              onClick={() => switchColor("black")}
              className={`rounded px-2 py-1 ${
                selection.color === "black" ? "bg-[var(--accent)] text-black" : ""
              }`}
            >
              {t(locale, "black")}
            </button>
          </div>
          <div className="rounded bg-[rgba(232,224,212,0.1)] p-1 text-sm">
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`rounded px-2 py-1 ${locale === "en" ? "bg-[var(--accent)] text-black" : ""}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLocale("zh")}
              className={`rounded px-2 py-1 ${locale === "zh" ? "bg-[var(--accent)] text-black" : ""}`}
            >
              简体中文
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded bg-[rgba(232,224,212,0.14)] px-3 py-2 text-sm"
          >
            {t(locale, "settings")}
          </button>
          <button
            type="button"
            onClick={undoLastMove}
            disabled={busy || (gameState?.stats.totalMoves ?? 0) <= 0}
            className="rounded bg-[rgba(232,224,212,0.14)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(locale, "undo")}
          </button>
          <button
            type="button"
            onClick={() => setExploreMode((value) => !value)}
            className={`rounded px-3 py-2 text-sm ${
              exploreMode
                ? "bg-[var(--accent)] font-semibold text-black"
                : "bg-[rgba(232,224,212,0.14)]"
            }`}
          >
            {t(locale, "explore")}
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
          >
            {t(locale, "newGame")}
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded border border-[rgba(196,69,54,0.6)] bg-[rgba(196,69,54,0.18)] px-3 py-2 text-sm text-[var(--text-primary)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[80px_1fr_390px]">
        <div className="hidden lg:block">
          <EvalBar evalCp={evalCpWhite} mate={evalMate} locale={locale} />
        </div>

        <div className="space-y-3">
          <ChessBoard
            fen={gameState?.fen ?? START_FEN}
            userColor={gameState?.userColor ?? "white"}
            legalMoves={legalMoves}
            highlightSquares={highlightSquares}
            mistakeSquares={mistakeSquares}
            arrowsOnBoard={arrowsOnBoard}
            punishmentFlash={punishmentFlash}
            disabled={busy || !gameState || gameState.gameOver}
            onMove={onBoardMove}
          />
          <div className="lg:hidden">
            <EvalBar evalCp={evalCpWhite} mate={evalMate} horizontal locale={locale} />
          </div>
        </div>

        <aside className="space-y-3">
          <CoachPanel
            openingName={
              openingMeta.name
                ? translateOpeningName(openingMeta.name, locale)
                : t(locale, "startingPosition")
            }
            eco={openingMeta.eco}
            mode={gameState?.mode ?? "book"}
            message={
              busy
                ? t(locale, "engineThinking")
                : localizeCoachMessage(
                    exploreMode
                      ? "Explore mode. Move either side freely and watch the engine evaluation update."
                      : gameState?.coachMessage ?? t(locale, "startBySelecting"),
                    locale,
                  )
            }
            botPreview={botPreview}
            punishmentLineSan={latestAnalysis?.punishmentLineSan ?? []}
            punishmentShake={punishmentShake}
            locale={locale}
          />

          <MoveHistory
            moveHistory={gameState?.moveHistory ?? []}
            userColor={gameState?.userColor ?? "white"}
            locale={locale}
            onJumpToPly={jumpToMove}
          />

          <div className="surface rounded-xl p-3 text-sm">
            <p>
              {t(locale, "accuracy")}:{" "}
              <span className="font-notation text-[var(--accent)]">
                {(gameState?.stats.accuracy ?? 100).toFixed(1)}%
              </span>
            </p>
            <p className="text-[var(--text-secondary)]">
              {gameState?.stats.punishments ?? 0}/{gameState?.stats.totalMoves ?? 0} {t(locale, "punishments")}
            </p>
          </div>

          <MemoryPanel
            repeatedMoves={repeatedTrainerMoves}
            playableMoves={playableMoves}
            openingProgress={openingProgress}
            recentMistakes={recentMistakes}
            locale={locale}
          />
        </aside>
      </div>

      <SettingsPanel config={config} onChange={updateConfig} locale={locale} />

      <NewGameDialog
        open={dialogOpen}
        initialConfig={config}
        onClose={() => setDialogOpen(false)}
        onStart={(params) => void startSession(params)}
        locale={locale}
      />
    </main>
  );
}

function smoothDisplayedEval(
  previous: { cpWhite: number; mate: number | null } | null,
  next: { cpWhite: number; mate: number | null },
): { cpWhite: number; mate: number | null } {
  if (!previous) {
    return next;
  }

  if (next.mate !== null) {
    return next;
  }

  if (previous.mate !== null) {
    return {
      cpWhite: next.cpWhite,
      mate: null,
    };
  }

  const delta = next.cpWhite - previous.cpWhite;
  if (Math.abs(delta) < 18) {
    return previous;
  }

  const alpha = Math.abs(delta) >= 120 ? 0.6 : 0.35;
  return {
    cpWhite: Math.round(previous.cpWhite + delta * alpha),
    mate: null,
  };
}

function isLegalUci(legalMoves: string[], uci: string): boolean {
  if (legalMoves.includes(uci)) {
    return true;
  }
  if (uci.length === 4) {
    return legalMoves.some((candidate) => candidate.startsWith(uci));
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getPracticeOpeningPrefix(name: string): string {
  const colonIndex = name.indexOf(": ");
  if (colonIndex < 0) {
    return name.trim();
  }

  const family = name.slice(0, colonIndex).trim();
  const remainder = name.slice(colonIndex + 2).trim();
  const topVariation = remainder.split(",")[0].trim();

  if (!topVariation) {
    return family;
  }

  return `${family}: ${topVariation}`;
}
