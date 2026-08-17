"use client";

import { t, type Locale } from "@/i18n/messages";

export function EvalBar({
  evalCp,
  mate,
  horizontal = false,
  locale,
}: {
  evalCp: number;
  mate: number | null;
  horizontal?: boolean;
  locale: Locale;
}) {
  const pawns = evalCp / 100;
  const clamped = Math.max(-5, Math.min(5, pawns));
  const ratio = (clamped + 5) / 10;
  const text = mate !== null ? `M${mate}` : `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
  const color = evalCp >= 0 ? "var(--success)" : "var(--error)";

  if (horizontal) {
    return (
      <section className="surface rounded-xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-heading text-lg">{t(locale, "eval")}</h3>
          <span className="font-notation text-sm" style={{ color }}>
            {text}
          </span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded bg-[rgba(232,224,212,0.14)]">
          <div
            className="h-full transition-all duration-500 ease-in-out"
            style={{
              width: `${ratio * 100}%`,
              background: `linear-gradient(90deg, var(--error), var(--warning), var(--success))`,
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="surface flex h-[540px] w-[74px] flex-col items-center justify-between rounded-xl p-3">
      <span className="font-notation text-sm" style={{ color }}>
        {text}
      </span>
      <div className="relative h-[460px] w-8 overflow-hidden rounded bg-[rgba(232,224,212,0.12)]">
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-in-out"
          style={{
            height: `${ratio * 100}%`,
            background:
              "linear-gradient(0deg, rgba(232,213,181,0.95), rgba(255,255,255,0.96))",
          }}
        />
      </div>
      <span className="font-notation text-xs text-transparent">0.0</span>
    </section>
  );
}
