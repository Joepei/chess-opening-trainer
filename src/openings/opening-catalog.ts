import openingsData, { type OpeningBookData } from "./opening-data";

export interface OpeningFamily {
  name: string;
  eco: string[];
  variations: Array<{
    name: string;
    fullName: string;
    prefix: string;
    eco: string;
    pgn: string;
    moveCount: number;
  }>;
}

const data: OpeningBookData = openingsData;

export function getCatalog(): OpeningFamily[] {
  const byFamily = new Map<string, OpeningFamily>();

  for (const entry of data.catalog) {
    const familyName = entry.family || entry.name;
    const variationName = getTopVariationLabel(entry);
    const fullName = getPracticeOpeningPrefix(entry.name);

    let family = byFamily.get(familyName);
    if (!family) {
      family = {
        name: familyName,
        eco: [],
        variations: [],
      };
      byFamily.set(familyName, family);
    }

    if (!family.eco.includes(entry.eco)) {
      family.eco.push(entry.eco);
    }

    const existing = family.variations.find((variation) => variation.prefix === fullName);
    if (existing) {
      if (entry.eco < existing.eco) {
        existing.eco = entry.eco;
        existing.pgn = entry.pgn;
        existing.moveCount = entry.moves.length;
        existing.fullName = fullName;
        existing.prefix = fullName;
      }
      continue;
    }

    family.variations.push({
      name: variationName,
      fullName,
      prefix: fullName,
      eco: entry.eco,
      pgn: entry.pgn,
      moveCount: entry.moves.length,
    });
  }

  const families = Array.from(byFamily.values());
  for (const family of families) {
    family.eco.sort();
    family.variations.sort((a, b) => a.eco.localeCompare(b.eco) || a.fullName.localeCompare(b.fullName));
  }

  families.sort((a, b) => a.name.localeCompare(b.name));
  return families;
}

export function searchOpenings(query: string): OpeningFamily[] {
  const q = query.trim().toLowerCase();
  const families = getCatalog();
  if (!q) {
    return families;
  }

  const terms = q.split(/\s+/).filter(Boolean);

  return families
    .map((family) => {
      const familyMatch = terms.every((term) => family.name.toLowerCase().includes(term));
      const variations = family.variations.filter((variation) => {
        const full = variation.fullName.toLowerCase();
        return terms.every((term) => full.includes(term));
      });

      if (familyMatch || variations.length > 0) {
        return {
          ...family,
          variations: familyMatch ? family.variations : variations,
        };
      }
      return null;
    })
    .filter((item): item is OpeningFamily => item !== null);
}

export function getPracticeOpeningPrefix(name: string): string {
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

function getTopVariationLabel(entry: OpeningBookData["catalog"][number]): string {
  const prefix = getPracticeOpeningPrefix(entry.name);
  if (prefix === entry.family) {
    return "Main Line";
  }

  return prefix.replace(`${entry.family}: `, "");
}
