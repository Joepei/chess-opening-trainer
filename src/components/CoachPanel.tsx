"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { BotPreview } from "@/game/types";
import { t, type Locale } from "@/i18n/messages";

export function CoachPanel({
  openingName,
  eco,
  mode,
  message,
  botPreview = null,
  punishmentLineSan = [],
  punishmentShake = false,
  locale,
}: {
  openingName: string | null;
  eco?: string | null;
  mode: "book" | "punishment" | "free_play";
  message: string;
  botPreview?: BotPreview | null;
  punishmentLineSan?: string[];
  punishmentShake?: boolean;
  locale: Locale;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const safeLineIndex = Math.min(lineIndex, Math.max(0, punishmentLineSan.length - 1));

  const modeMeta = useMemo(() => {
    if (mode === "book") {
      return { label: t(locale, "inBook"), className: "bg-[rgba(74,158,109,0.2)] text-[var(--success)]" };
    }
    if (mode === "punishment") {
      return {
        label: t(locale, "punishment"),
        className:
          "bg-[rgba(196,69,54,0.2)] text-[var(--error)] animate-[mistakePulse_1s_ease-in-out_infinite]",
      };
    }
    return { label: t(locale, "freePlay"), className: "bg-[rgba(212,160,60,0.2)] text-[var(--warning)]" };
  }, [locale, mode]);

  return (
    <section
      className={`rounded-xl border border-[rgba(232,224,212,0.08)] bg-[var(--coach-surface)] p-4 ${
        punishmentShake ? "panel-shake" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xl leading-tight">{openingName ?? t(locale, "startingPosition")}</p>
          {eco ? (
            <span className="mt-1 inline-block rounded bg-[rgba(212,160,60,0.2)] px-2 py-0.5 font-notation text-xs text-[var(--accent)]">
              {eco}
            </span>
          ) : null}
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold transition-colors duration-300 ${modeMeta.className}`}>
          {modeMeta.label}
        </span>
      </div>

      <div className="gold-border rounded-lg bg-[rgba(30,30,56,0.8)] p-3" aria-live="polite">
        <p
          key={message}
          className="typewriter-text text-sm leading-relaxed text-[var(--text-primary)]"
          style={{ "--type-duration-ms": "520ms" } as CSSProperties}
        >
          {message}
        </p>
      </div>

      {botPreview && botPreview.options.length > 0 ? (
        <div className="mt-3 rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(27,27,47,0.65)] p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "bookChoices")}
          </p>
          <p className="mb-2 text-sm text-[var(--text-primary)]">
            {t(locale, "computerWillPlay")}{" "}
            <span className="font-notation text-[var(--accent)]">{botPreview.plannedMove.san}</span>
          </p>
          <div className="space-y-1">
            {botPreview.options.map((option) => (
              <div
                key={option.uci}
                className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                  option.uci === botPreview.plannedMove.uci
                    ? "bg-[rgba(212,160,60,0.18)]"
                    : "bg-[rgba(232,224,212,0.06)]"
                }`}
              >
                <span className="font-notation text-[var(--text-primary)]">{option.san}</span>
                <span className="text-xs text-[var(--text-secondary)]">{option.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {punishmentLineSan.length > 0 ? (
        <div className="mt-3 rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(27,27,47,0.65)] p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
            {t(locale, "punishmentLine")}
          </p>
          <div className="flex flex-wrap gap-1">
            {punishmentLineSan.map((move, idx) => (
              <button
                key={`${move}-${idx}`}
                type="button"
                onClick={() => setLineIndex(idx)}
                className={`rounded px-2 py-1 font-notation text-xs ${
                  idx === safeLineIndex
                    ? "bg-[rgba(212,160,60,0.35)] text-[var(--text-primary)]"
                    : "bg-[rgba(232,224,212,0.1)] text-[var(--text-secondary)]"
                }`}
              >
                {idx + 1}. {move}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {t(locale, "focusMove")}: {safeLineIndex + 1}. {punishmentLineSan[safeLineIndex]}
          </p>
        </div>
      ) : null}
    </section>
  );
}
