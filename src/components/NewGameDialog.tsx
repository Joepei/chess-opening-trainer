"use client";

import { useMemo, useState } from "react";

import type { TrainerConfig } from "@/game/types";
import { t, type Locale } from "@/i18n/messages";
import { translateOpeningName } from "@/i18n/openings";
import { getCatalog, searchOpenings } from "@/openings/opening-catalog";

type VariationPick = {
  fullName: string;
  prefix: string;
  eco: string;
  pgn: string;
  moveCount: number;
};

export function NewGameDialog({
  open,
  initialConfig,
  onClose,
  onStart,
  locale,
}: {
  open: boolean;
  initialConfig: TrainerConfig;
  onClose: () => void;
  onStart: (params: {
    openingName: string | null;
    color: "white" | "black";
    startMove: number;
    config: TrainerConfig;
  }) => void;
  locale: Locale;
}) {
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<"white" | "black">("white");
  const [startMove, setStartMove] = useState(1);
  const [punishmentDepth, setPunishmentDepth] = useState(Math.max(10, initialConfig.punishmentDepth));
  const [evalThreshold, setEvalThreshold] = useState(initialConfig.evalThreshold);
  const [selected, setSelected] = useState<VariationPick | null>(null);

  const families = useMemo(() => {
    const baseFamilies = getCatalog();
    if (!query.trim()) {
      return baseFamilies;
    }

    const englishMatches = searchOpenings(query);
    const englishKeys = new Set(
      englishMatches.flatMap((family) =>
        family.variations.map((variation) => `${family.name}::${variation.fullName}::${variation.eco}`),
      ),
    );

    const lowered = query.trim().toLowerCase();
    return baseFamilies
      .map((family) => {
        const translatedFamily = translateOpeningName(family.name, locale)?.toLowerCase() ?? "";
        const familyMatch = translatedFamily.includes(lowered);
        const variations = family.variations.filter((variation) => {
          const key = `${family.name}::${variation.fullName}::${variation.eco}`;
          if (englishKeys.has(key)) {
            return true;
          }
          const translatedVariation =
            translateOpeningName(variation.fullName, locale)?.toLowerCase() ?? "";
          return familyMatch || translatedVariation.includes(lowered);
        });

        if (familyMatch || variations.length > 0) {
          return {
            ...family,
            variations: familyMatch ? family.variations : variations,
          };
        }
        return null;
      })
      .filter((family): family is (typeof baseFamilies)[number] => family !== null);
  }, [locale, query]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(8,8,16,0.72)] p-4">
      <div className="surface w-full max-w-4xl rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-3xl">{t(locale, "startNewDrill")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[rgba(232,224,212,0.12)] px-3 py-1 text-sm"
          >
            {t(locale, "close")}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="rounded-xl border border-[rgba(232,224,212,0.12)] bg-[rgba(27,27,47,0.5)] p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, "searchOpenings")}
              className="mb-3 w-full rounded border border-[rgba(232,224,212,0.15)] bg-[rgba(27,27,47,0.85)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <div className="max-h-[360px] overflow-y-auto pr-1">
              {families.map((family) => (
                <div key={family.name} className="mb-3">
                  <p className="font-heading text-lg text-[var(--accent)]">
                    {translateOpeningName(family.name, locale) ?? family.name}
                  </p>
                  <div className="mt-1 space-y-1">
                    {family.variations.map((variation, idx) => (
                      <button
                        key={`${variation.eco}-${variation.fullName}-${variation.pgn}-${idx}`}
                        type="button"
                        onClick={() =>
                          setSelected({
                            fullName: variation.fullName,
                            prefix: variation.prefix,
                            eco: variation.eco,
                            pgn: variation.pgn,
                            moveCount: variation.moveCount,
                          })
                        }
                        className={`w-full rounded px-2 py-1 text-left text-sm ${
                          selected?.fullName === variation.fullName
                            ? "bg-[rgba(212,160,60,0.28)]"
                            : "bg-[rgba(232,224,212,0.08)]"
                        }`}
                      >
                        <span className="font-notation text-xs text-[var(--text-secondary)]">
                          {variation.eco}
                        </span>{" "}
                        {translateOpeningName(variation.fullName, locale) ?? variation.fullName}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[rgba(232,224,212,0.12)] bg-[rgba(27,27,47,0.5)] p-3">
            <p className="mb-2 font-heading text-xl">{t(locale, "selection")}</p>
            <p className="text-sm">
              {selected
                ? translateOpeningName(selected.fullName, locale) ?? selected.fullName
                : t(locale, "noVariationSelected")}
            </p>
            <p className="mt-1 font-notation text-xs text-[var(--text-secondary)]">
              {selected ? `${selected.eco} | ${selected.moveCount} plies` : ""}
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{selected?.pgn ?? ""}</p>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="mb-1 text-[var(--text-secondary)]">{t(locale, "playAs")}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setColor("white")}
                    className={`rounded px-3 py-1 ${color === "white" ? "bg-[var(--accent)] text-black" : "bg-[rgba(232,224,212,0.12)]"}`}
                  >
                    {t(locale, "white")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setColor("black")}
                    className={`rounded px-3 py-1 ${color === "black" ? "bg-[var(--accent)] text-black" : "bg-[rgba(232,224,212,0.12)]"}`}
                  >
                    {t(locale, "black")}
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[var(--text-secondary)]">{t(locale, "startFromMove")}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={startMove}
                  onChange={(e) => setStartMove(Number(e.target.value))}
                  className="w-full rounded border border-[rgba(232,224,212,0.15)] bg-[rgba(27,27,47,0.85)] px-2 py-1"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[var(--text-secondary)]">{t(locale, "punishmentDepth")}: {punishmentDepth}</span>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={punishmentDepth}
                  onChange={(e) => setPunishmentDepth(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[var(--text-secondary)]">{t(locale, "evalThreshold")}: {evalThreshold}</span>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={evalThreshold}
                  onChange={(e) => setEvalThreshold(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                onStart({
                  openingName: selected?.fullName ?? null,
                  color,
                  startMove,
                  config: {
                    ...initialConfig,
                    punishmentDepth,
                    evalThreshold,
                  },
                })
              }
              className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-black transition hover:brightness-110"
            >
              {t(locale, "startDrilling")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
