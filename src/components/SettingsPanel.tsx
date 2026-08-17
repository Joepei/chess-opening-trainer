"use client";

import type { TrainerConfig } from "@/game/types";
import { t, type Locale } from "@/i18n/messages";

export function SettingsPanel({
  config,
  onChange,
  locale,
}: {
  config: TrainerConfig;
  onChange: (next: Partial<TrainerConfig>) => void;
  locale: Locale;
}) {
  return (
    <section className="surface rounded-xl p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <label>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{t(locale, "punishmentDepth")}</span>
            <span className="font-notation text-[var(--accent)]">{config.punishmentDepth}</span>
          </div>
          <input
            type="range"
            min={10}
            max={50}
            value={config.punishmentDepth}
            onChange={(e) => onChange({ punishmentDepth: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </label>

        <label>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{t(locale, "evalThreshold")}</span>
            <span className="font-notation text-[var(--accent)]">{config.evalThreshold}</span>
          </div>
          <input
            type="range"
            min={20}
            max={200}
            step={5}
            value={config.evalThreshold}
            onChange={(e) => onChange({ evalThreshold: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </label>
      </div>
    </section>
  );
}
