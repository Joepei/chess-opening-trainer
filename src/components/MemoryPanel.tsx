"use client";

import { translateOpeningName } from "@/i18n/openings";
import { t, type Locale } from "@/i18n/messages";
import type {
  MistakeMemoryItem,
  OpeningProgressStat,
  PlayableMoveMemoryItem,
  TrainerBookMoveStat,
} from "@/training-memory/memory-store";

export function MemoryPanel({
  repeatedMoves,
  playableMoves,
  openingProgress,
  recentMistakes,
  locale,
}: {
  repeatedMoves: TrainerBookMoveStat[];
  playableMoves: PlayableMoveMemoryItem[];
  openingProgress: OpeningProgressStat[];
  recentMistakes: MistakeMemoryItem[];
  locale: Locale;
}) {
  return (
    <section className="surface rounded-xl p-4">
      <h3 className="font-heading text-xl">{t(locale, "memory")}</h3>
      <div className="mt-3 space-y-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "openingProgress")}
          </p>
          <div className="space-y-2">
            {openingProgress.length > 0 ? openingProgress.map((entry) => (
              <div
                key={entry.openingKey}
                className="rounded border border-[rgba(232,224,212,0.1)] bg-[rgba(27,27,47,0.55)] px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {entry.openingName ? translateOpeningName(entry.openingName, locale) : t(locale, "freePlay")}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {entry.sessions} {t(locale, "sessions")} · {entry.totalMoves} {t(locale, "moves")} · {entry.mistakes} {t(locale, "mistakes")}
                </p>
              </div>
            )) : <EmptyState label={t(locale, "noMemoryYet")} />}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "repeatedTrainerMoves")}
          </p>
          <div className="space-y-2">
            {repeatedMoves.length > 0 ? repeatedMoves.map((move) => (
              <div
                key={`${move.positionKey}-${move.uci}`}
                className="rounded border border-[rgba(232,224,212,0.1)] bg-[rgba(27,27,47,0.55)] px-3 py-2 text-sm"
              >
                <p className="font-notation text-[var(--accent)]">{move.san}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {(move.openingName ? translateOpeningName(move.openingName, locale) : t(locale, "openingUnknown"))} · {move.count}x
                </p>
              </div>
            )) : <EmptyState label={t(locale, "noRepeatedMoves")} />}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "playableMoves")}
          </p>
          <div className="space-y-2">
            {playableMoves.length > 0 ? playableMoves.map((move) => (
              <div
                key={move.id}
                className="rounded border border-[rgba(232,224,212,0.1)] bg-[rgba(27,27,47,0.55)] px-3 py-2 text-sm"
              >
                <p className="font-notation text-[var(--success)]">{move.playedSan}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {(move.sourceOpening ? translateOpeningName(move.sourceOpening, locale) : t(locale, "openingUnknown"))}
                  {" -> "}
                  {(move.resultingOpening ? translateOpeningName(move.resultingOpening, locale) : t(locale, "freePlay"))}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">{move.count}x</p>
              </div>
            )) : <EmptyState label={t(locale, "noPlayableMoves")} />}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "recentMistakes")}
          </p>
          <div className="space-y-2">
            {recentMistakes.length > 0 ? recentMistakes.map((mistake) => (
              <div
                key={mistake.id}
                className="rounded border border-[rgba(232,224,212,0.1)] bg-[rgba(27,27,47,0.55)] px-3 py-2 text-sm"
              >
                <p className="text-[var(--text-primary)]">
                  {mistake.openingName ? translateOpeningName(mistake.openingName, locale) : t(locale, "openingUnknown")}
                </p>
                <p className="font-notation text-[var(--error)]">
                  {mistake.playedSan} → {mistake.expectedSan}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {localizeMistakeCategory(mistake.category, locale)}
                </p>
              </div>
            )) : <EmptyState label={t(locale, "noMistakesStored")} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded border border-dashed border-[rgba(232,224,212,0.12)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      {label}
    </div>
  );
}

function localizeMistakeCategory(category: MistakeMemoryItem["category"], locale: Locale): string {
  if (locale === "zh") {
    if (category === "left_book") {
      return "离开开局库";
    }
    if (category === "punishable") {
      return "可被具体惩罚";
    }
    return "轻微不准确";
  }

  if (category === "left_book") {
    return "Left book";
  }
  if (category === "punishable") {
    return "Punishable";
  }
  return "Inaccuracy";
}
