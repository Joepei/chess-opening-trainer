"use client";

import type { GameState } from "@/game/types";
import { t, type Locale } from "@/i18n/messages";

export function MoveHistory({
  moveHistory,
  userColor,
  locale,
  onJumpToPly,
}: {
  moveHistory: GameState["moveHistory"];
  userColor: "white" | "black";
  locale: Locale;
  onJumpToPly?: (plyCount: number) => void;
}) {
  let plyCounter = 0;

  return (
    <section className="surface rounded-xl p-4">
      <h3 className="font-heading text-xl">{t(locale, "moveHistory")}</h3>
      <div className="mt-3 max-h-[260px] overflow-y-auto rounded border border-[rgba(232,224,212,0.1)] bg-[rgba(27,27,47,0.55)] p-2">
        <div className="grid grid-cols-[46px_1fr_1fr] gap-y-1 font-notation text-xs text-[var(--text-secondary)]">
          <span>#</span>
          <span>{t(locale, "white")}</span>
          <span>{t(locale, "black")}</span>
        </div>
        <div className="mt-1 space-y-1">
          {moveHistory.map((row, idx) => {
            const moveClass = classifyMove(row.analysis?.evalDrop ?? 0);
            const isCurrent = idx === moveHistory.length - 1;
            const whitePly = row.white ? ++plyCounter : null;
            const blackPly = row.black ? ++plyCounter : null;
            return (
              <div
                key={`${row.moveNumber}-${row.whiteUci ?? "x"}-${row.blackUci ?? "x"}`}
                className={`grid grid-cols-[46px_1fr_1fr] items-center rounded px-1 py-1 font-notation text-sm ${
                  isCurrent ? "bg-[rgba(212,160,60,0.16)]" : ""
                }`}
              >
                <span className="text-[var(--text-secondary)]">{row.moveNumber}.</span>
                <MoveCell
                  label={row.white ?? "..."}
                  plyCount={whitePly}
                  className={userColor === "white" ? moveClass : "text-[var(--text-primary)]"}
                  onJumpToPly={onJumpToPly}
                />
                <MoveCell
                  label={row.black ?? ""}
                  plyCount={blackPly}
                  className={userColor === "black" ? moveClass : "text-[var(--text-primary)]"}
                  onJumpToPly={onJumpToPly}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function classifyMove(evalDrop: number): string {
  if (evalDrop >= 250) {
    return "text-[var(--error)]";
  }
  if (evalDrop >= 120) {
    return "text-orange-400";
  }
  if (evalDrop >= 50) {
    return "text-[var(--warning)]";
  }
  return "text-[var(--text-primary)]";
}

function MoveCell({
  label,
  plyCount,
  className,
  onJumpToPly,
}: {
  label: string;
  plyCount: number | null;
  className: string;
  onJumpToPly?: (plyCount: number) => void;
}) {
  if (!plyCount || !onJumpToPly || !label) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onJumpToPly(plyCount)}
      className={`w-full rounded px-1 py-0.5 text-left transition hover:bg-[rgba(232,224,212,0.08)] ${className}`}
      title="Jump to this move"
    >
      {label}
    </button>
  );
}
