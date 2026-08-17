"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

const Chessboard = dynamic(
  () => import("react-chessboard").then((module) => module.Chessboard),
  { ssr: false },
);

type PieceDropArgs = {
  sourceSquare: string;
  targetSquare: string | null;
  piece: { pieceType: string };
};

type Arrow = {
  startSquare: string;
  endSquare: string;
  color: string;
};

export function ChessBoard({
  fen,
  userColor,
  legalMoves,
  highlightSquares = [],
  mistakeSquares = [],
  arrowsOnBoard = [],
  punishmentFlash = false,
  disabled = false,
  onMove,
}: {
  fen: string;
  userColor: "white" | "black";
  legalMoves: string[];
  highlightSquares?: string[];
  mistakeSquares?: string[];
  arrowsOnBoard?: Arrow[];
  punishmentFlash?: boolean;
  disabled?: boolean;
  onMove: (uci: string) => boolean;
}) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    for (const square of highlightSquares) {
      styles[square] = {
        backgroundColor: "rgba(212, 160, 60, 0.36)",
      };
    }

    for (const square of mistakeSquares) {
      styles[square] = {
        ...(styles[square] ?? {}),
        animation: "mistakePulse 900ms ease-in-out infinite",
      };
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        boxShadow: "inset 0 0 0 3px rgba(212, 160, 60, 0.85)",
      };
    }

    const targets = selectedSquare
      ? legalMoves
          .filter((uci) => uci.startsWith(selectedSquare))
          .map((uci) => uci.slice(2, 4))
      : [];

    for (const square of targets) {
      styles[square] = {
        ...(styles[square] ?? {}),
        background:
          "radial-gradient(circle at center, rgba(27, 27, 47, 0.35) 0, rgba(27, 27, 47, 0.35) 16%, transparent 18%)",
      };
    }

    return styles;
  }, [highlightSquares, legalMoves, mistakeSquares, selectedSquare]);

  function handlePieceDrop({ sourceSquare, targetSquare, piece }: PieceDropArgs): boolean {
    if (disabled || !targetSquare) {
      return false;
    }

    const promotion = getAutoPromotion(piece.pieceType, targetSquare);
    const uci = `${sourceSquare}${targetSquare}${promotion ?? ""}`;
    const ok = onMove(uci);
    if (ok) {
      setSelectedSquare(null);
    }
    return ok;
  }

  return (
    <div className="relative w-full">
      <div className="surface rounded-xl p-3">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: userColor,
            onPieceDrop: handlePieceDrop,
            onPieceClick: ({ square }) => setSelectedSquare(square),
            allowDragging: !disabled,
            showNotation: true,
            squareStyles,
            arrows: arrowsOnBoard,
            darkSquareStyle: { backgroundColor: "var(--board-dark)" },
            lightSquareStyle: { backgroundColor: "var(--board-light)" },
            animationDurationInMs: 260,
          }}
        />
      </div>
      {punishmentFlash ? (
        <div className="punishment-flash pointer-events-none absolute inset-0 rounded-xl bg-[rgba(196,69,54,0.35)]" />
      ) : null}
    </div>
  );
}

function getAutoPromotion(pieceType: string, targetSquare: string): "q" | null {
  if (!pieceType.toLowerCase().endsWith("p")) {
    return null;
  }
  const rank = targetSquare[1];
  return rank === "1" || rank === "8" ? "q" : null;
}
