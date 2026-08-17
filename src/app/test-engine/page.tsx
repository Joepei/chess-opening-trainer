"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Chess } from "chess.js";

import { StockfishEngine } from "@/engine/stockfish-api";
import { PunishmentDetector } from "@/game/punishment";
import type { MoveAnalysis } from "@/game/types";
import { OpeningBook } from "@/openings/book-manager";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type EvalResult = {
  score: number;
  bestMove: string;
  pv: string[];
  mate: number | null;
};

type TopMove = {
  move: string;
  score: number;
  pv: string[];
};

type PunishmentTestResult = {
  id: string;
  label: string;
  fen: string;
  userMoveUci: string;
  userMoveSan: string;
  elapsedMs: number;
  analysis: MoveAnalysis;
};

export default function TestEnginePage() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [topMoves, setTopMoves] = useState<TopMove[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openingSummary, setOpeningSummary] = useState<{
    totalPositions: number;
    startMoves: Array<{ san: string; uci: string; weight: number }>;
    afterE4: Array<{ san: string; uci: string; weight: number }>;
    afterE4C5Nf3: Array<{ san: string; uci: string; weight: number }>;
    dragonAfterE4C5Nf3: Array<{ san: string; uci: string; weight: number; openings: string[] }>;
    randomStartSamples: string[];
  } | null>(null);

  const [punishmentResults, setPunishmentResults] = useState<PunishmentTestResult[]>([]);
  const [runningPunishmentTests, setRunningPunishmentTests] = useState(false);

  const openingBook = useMemo(() => new OpeningBook(), []);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const appendOutput = (line: string) => {
    setOutput((prev) => [...prev.slice(-600), line]);
  };

  async function initEngine() {
    try {
      setBusy(true);
      setError(null);

      if (!engineRef.current) {
        engineRef.current = new StockfishEngine();
        engineRef.current.subscribeRawOutput((line) => appendOutput(line));
      }

      await engineRef.current.init();
      setInitialized(true);
      appendOutput("[ui] Engine initialized.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function evaluateStartPosition() {
    if (!engineRef.current) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setTopMoves([]);

      const result = await engineRef.current.evaluate(START_FEN, 16);
      setEvalResult(result);
      appendOutput(
        `[ui] Eval: score=${result.score}cp best=${result.bestMove} pv=${result.pv.join(" ")}`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function getTopFiveMoves() {
    if (!engineRef.current) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setEvalResult(null);

      const result = await engineRef.current.getTopMoves(START_FEN, 5, 16);
      setTopMoves(result);
      appendOutput(`[ui] Top moves fetched: ${result.length}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function runOpeningBookTests() {
    const fenAfterE4 = playMoves(START_FEN, ["e4"]).fen();
    const fenAfterE4C5Nf3 = playMoves(START_FEN, ["e4", "c5", "Nf3"]).fen();
    const dragonBook = openingBook.filterByOpening("Sicilian Defense: Dragon");

    const randomStartSamples: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const move = openingBook.chooseBookMove(START_FEN);
      if (move) {
        randomStartSamples.push(move.san);
      }
    }

    setOpeningSummary({
      totalPositions: openingBook.getPositionCount(),
      startMoves: openingBook.getBookMoves(START_FEN).map((move) => ({
        san: move.san,
        uci: move.uci,
        weight: move.weight,
      })),
      afterE4: openingBook.getBookMoves(fenAfterE4).map((move) => ({
        san: move.san,
        uci: move.uci,
        weight: move.weight,
      })),
      afterE4C5Nf3: openingBook.getBookMoves(fenAfterE4C5Nf3).map((move) => ({
        san: move.san,
        uci: move.uci,
        weight: move.weight,
      })),
      dragonAfterE4C5Nf3: dragonBook.getBookMoves(fenAfterE4C5Nf3).map((move) => ({
        san: move.san,
        uci: move.uci,
        weight: move.weight,
        openings: move.openings,
      })),
      randomStartSamples,
    });
  }

  async function runPunishmentTests() {
    if (!engineRef.current) {
      setError("Initialize engine first.");
      return;
    }

    const detector = new PunishmentDetector(engineRef.current);
    const tests = getPunishmentTestInputs();

    try {
      setRunningPunishmentTests(true);
      setError(null);
      setPunishmentResults([]);

      const results: PunishmentTestResult[] = [];
      for (const test of tests) {
        const start = performance.now();
        const analysis = await detector.analyzeMove(
          test.fen,
          test.userMoveUci,
          test.userMoveSan,
        );
        const elapsedMs = performance.now() - start;

        results.push({
          id: test.id,
          label: test.label,
          fen: test.fen,
          userMoveUci: test.userMoveUci,
          userMoveSan: test.userMoveSan,
          elapsedMs,
          analysis,
        });
      }

      setPunishmentResults(results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningPunishmentTests(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Engine + Openings + Punishment Test Lab</h1>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={initEngine}
          disabled={busy}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Initialize Engine
        </button>
        <button
          type="button"
          onClick={evaluateStartPosition}
          disabled={!initialized || busy}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Evaluate Starting Position
        </button>
        <button
          type="button"
          onClick={getTopFiveMoves}
          disabled={!initialized || busy}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Get Top 5 Moves
        </button>
        <button
          type="button"
          onClick={runOpeningBookTests}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white"
        >
          Run Opening Book Tests
        </button>
        <button
          type="button"
          onClick={runPunishmentTests}
          disabled={!initialized || runningPunishmentTests}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {runningPunishmentTests ? "Running Punishment Tests..." : "Run Punishment Tests"}
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {evalResult ? (
        <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Evaluation</h2>
          <p className="mt-2 text-sm">
            Score: {evalResult.score >= 0 ? "+" : ""}
            {evalResult.score}cp
          </p>
          <p className="text-sm">Best move: {evalResult.bestMove || "n/a"}</p>
          <p className="text-sm">Mate: {evalResult.mate ?? "none"}</p>
          <p className="mt-2 text-sm">PV: {evalResult.pv.join(" ") || "n/a"}</p>
        </section>
      ) : null}

      {topMoves.length > 0 ? (
        <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Top Moves</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {topMoves.map((move) => (
              <li key={`${move.move}-${move.pv.join("-")}`}>
                {move.move} ({move.score >= 0 ? "+" : ""}
                {move.score}cp)
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {openingSummary ? (
        <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Opening Book Tests</h2>
          <p className="mt-2 text-sm">Total positions in book: {openingSummary.totalPositions}</p>
          <MoveList
            title="Start position moves"
            moves={openingSummary.startMoves.map((m) => ({
              label: `${m.san} (${m.uci})`,
              score: `${(m.weight * 100).toFixed(2)}%`,
            }))}
          />
          <MoveList
            title="After 1.e4 responses"
            moves={openingSummary.afterE4.map((m) => ({
              label: `${m.san} (${m.uci})`,
              score: `${(m.weight * 100).toFixed(2)}%`,
            }))}
          />
          <MoveList
            title="After 1.e4 c5 2.Nf3 responses"
            moves={openingSummary.afterE4C5Nf3.map((m) => ({
              label: `${m.san} (${m.uci})`,
              score: `${(m.weight * 100).toFixed(2)}%`,
            }))}
          />
          <MoveList
            title='Filtered "Sicilian Defense: Dragon" responses at 1.e4 c5 2.Nf3'
            moves={openingSummary.dragonAfterE4C5Nf3.map((m) => ({
              label: `${m.san} (${m.uci})`,
              score: `${(m.weight * 100).toFixed(2)}% | ${m.openings[0] ?? ""}`,
            }))}
          />
          <p className="mt-4 text-sm">
            Random `chooseBookMove` samples from start (20): {openingSummary.randomStartSamples.join(", ")}
          </p>
          <p className="text-sm">
            Unique sampled moves: {new Set(openingSummary.randomStartSamples).size}
          </p>
        </section>
      ) : null}

      {punishmentResults.length > 0 ? (
        <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Punishment Detector Tests</h2>
          <div className="mt-3 space-y-4">
            {punishmentResults.map((result) => (
              <article key={result.id} className="rounded-md border border-black/10 p-3">
                <h3 className="font-medium">{result.label}</h3>
                <p className="text-xs text-black/70">FEN: {result.fen}</p>
                <p className="text-sm">
                  User move: {result.userMoveSan} ({result.userMoveUci})
                </p>
                <p className="text-sm">
                  Eval before/after/drop: {fmtCp(result.analysis.evalBefore)} /{" "}
                  {fmtCp(result.analysis.evalAfter)} / {fmtCp(result.analysis.evalDrop)}
                </p>
                <p className="text-sm">
                  Mistake: {String(result.analysis.isMistake)} | Punishable:{" "}
                  {String(result.analysis.isPunishable)} | Material loss proxy:{" "}
                  {Math.round(result.analysis.materialChange)}cp
                </p>
                <p className="text-sm">Best move was: {result.analysis.bestMoveSan}</p>
                <p className="text-sm">
                  Punishment line:{" "}
                  {result.analysis.punishmentLineSan.length > 0
                    ? result.analysis.punishmentLineSan.join(" ")
                    : "(none)"}
                </p>
                <p className="text-sm">Time: {result.elapsedMs.toFixed(0)}ms</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-black/10 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Raw UCI Output</h2>
        <textarea
          readOnly
          value={output.join("\n")}
          className="mt-2 h-72 w-full rounded border border-black/15 p-2 font-mono text-xs"
        />
      </section>
    </main>
  );
}

function MoveList({
  title,
  moves,
}: {
  title: string;
  moves: Array<{ label: string; score: string }>;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {moves.length === 0 ? (
        <p className="text-sm text-black/60">(no moves)</p>
      ) : (
        <ol className="mt-1 list-decimal pl-5 text-sm">
          {moves.map((move) => (
            <li key={`${move.label}-${move.score}`}>
              {move.label} - {move.score}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function playMoves(startFen: string, sanMoves: string[]): Chess {
  const board = new Chess(startFen);
  for (const san of sanMoves) {
    board.move(san, { strict: false });
  }
  return board;
}

function toSanFromUci(fen: string, uci: string): string {
  const board = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? uci[4] : undefined;
  try {
    const move = board.move({ from, to, promotion });
    return move.san;
  } catch {
    return uci;
  }
}

function getPunishmentTestInputs(): Array<{
  id: string;
  label: string;
  fen: string;
  userMoveUci: string;
  userMoveSan: string;
}> {
  const case1Fen = "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQKBNR b KQkq - 1 2";

  const case2Board = playMoves(START_FEN, ["e4", "e5", "Nf3", "Nc6", "Bc4"]);
  const case2Fen = case2Board.fen();

  const case3Board = playMoves(START_FEN, ["e4"]);
  const case3Fen = case3Board.fen();

  const case4Board = playMoves(START_FEN, ["e4", "e5", "Nf3", "Nc6"]);
  const case4Fen = case4Board.fen();

  return [
    {
      id: "case1",
      label: "Case 1: clear blunder (f7f5)",
      fen: case1Fen,
      userMoveUci: "f7f5",
      userMoveSan: toSanFromUci(case1Fen, "f7f5"),
    },
    {
      id: "case2",
      label: "Case 2: slight inaccuracy (d7d6)",
      fen: case2Fen,
      userMoveUci: "d7d6",
      userMoveSan: toSanFromUci(case2Fen, "d7d6"),
    },
    {
      id: "case3",
      label: "Case 3: book move (c7c5)",
      fen: case3Fen,
      userMoveUci: "c7c5",
      userMoveSan: toSanFromUci(case3Fen, "c7c5"),
    },
    {
      id: "case4",
      label: "Case 4: hanging knight (f3e5)",
      fen: case4Fen,
      userMoveUci: "f3e5",
      userMoveSan: toSanFromUci(case4Fen, "f3e5"),
    },
  ];
}

function fmtCp(cp: number): string {
  return `${cp >= 0 ? "+" : ""}${Math.round(cp)}cp`;
}
