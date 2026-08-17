#!/usr/bin/env tsx

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import { Chess } from "chess.js";

type Args = {
  input: string;
  output: string;
};

type PositionMove = {
  uci: string;
  san: string;
  count: number;
  openings: string[];
};

type OpeningCatalogEntry = {
  eco: string;
  name: string;
  pgn: string;
  family: string;
  variation: string;
  moves: string[];
};

type OpeningData = {
  positions: Record<string, { moves: PositionMove[] }>;
  catalog: OpeningCatalogEntry[];
};

type MutableMove = {
  uci: string;
  san: string;
  count: number;
  openings: Set<string>;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--output") {
      args.output = argv[i + 1];
      i += 1;
    }
  }

  if (!args.input || !args.output) {
    throw new Error("Usage: tsx scripts/convert-openings.ts --input <dir> --output <file>");
  }

  return {
    input: args.input,
    output: args.output,
  };
}

function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function getFamilyAndVariation(name: string): { family: string; variation: string } {
  const separators = [":", ","];
  for (const sep of separators) {
    if (name.includes(sep)) {
      const [head, ...rest] = name.split(sep);
      return {
        family: head.trim(),
        variation: rest.join(sep).trim(),
      };
    }
  }

  return {
    family: name.trim(),
    variation: "Main Line",
  };
}

function parsePgnMoves(pgn: string): string[] {
  const cleaned = pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(" ")
    .map((m) => m.trim())
    .filter(Boolean);
}

function parseTsvLine(line: string): { eco: string; name: string; pgn: string } | null {
  if (!line.trim()) {
    return null;
  }

  const firstTab = line.indexOf("\t");
  if (firstTab < 0) {
    return null;
  }
  const secondTab = line.indexOf("\t", firstTab + 1);
  if (secondTab < 0) {
    return null;
  }

  const eco = line.slice(0, firstTab).trim();
  const name = line.slice(firstTab + 1, secondTab).trim();
  const pgn = line.slice(secondTab + 1).trim();

  if (!eco || !name || !pgn) {
    return null;
  }

  if (eco.toLowerCase() === "eco" && name.toLowerCase() === "name") {
    return null;
  }

  return { eco, name, pgn };
}

function findTsvFiles(inputDir: string): string[] {
  const resolved = resolve(inputDir);
  const files = readdirSync(resolved, { withFileTypes: true });

  const local = files
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".tsv")
    .map((entry) => join(resolved, entry.name));

  if (local.length > 0) {
    return local.sort();
  }

  const dist = join(resolved, "dist");
  const distFiles = readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".tsv")
    .map((entry) => join(dist, entry.name))
    .sort();

  return distFiles;
}

function ensureMove(
  positionMoves: Map<string, MutableMove>,
  uci: string,
  san: string,
  openingName: string,
): void {
  const key = `${uci}|${san}`;
  const existing = positionMoves.get(key);
  if (existing) {
    existing.count += 1;
    existing.openings.add(openingName);
    return;
  }

  positionMoves.set(key, {
    uci,
    san,
    count: 1,
    openings: new Set([openingName]),
  });
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const tsvFiles = findTsvFiles(input);
  if (tsvFiles.length === 0) {
    throw new Error(`No TSV files found in ${input}`);
  }

  const positions = new Map<string, Map<string, MutableMove>>();
  const catalog: OpeningCatalogEntry[] = [];
  let skipped = 0;

  for (const file of tsvFiles) {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const parsed = parseTsvLine(line);
      if (!parsed) {
        continue;
      }

      const { eco, name, pgn } = parsed;
      const tokens = parsePgnMoves(pgn);
      if (tokens.length === 0) {
        continue;
      }

      const chess = new Chess();
      const openingMoves: string[] = [];

      let valid = true;
      for (const token of tokens) {
        const fenKey = normalizeFen(chess.fen());
        let move: ReturnType<typeof chess.move>;
        try {
          move = chess.move(token, { strict: false });
        } catch {
          valid = false;
          break;
        }

        const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
        openingMoves.push(uci);

        let moveMap = positions.get(fenKey);
        if (!moveMap) {
          moveMap = new Map<string, MutableMove>();
          positions.set(fenKey, moveMap);
        }
        ensureMove(moveMap, uci, move.san, name);
      }

      if (!valid) {
        skipped += 1;
        continue;
      }

      const { family, variation } = getFamilyAndVariation(name);
      catalog.push({
        eco,
        name,
        pgn,
        family,
        variation,
        moves: openingMoves,
      });
    }
  }

  const jsonPositions: OpeningData["positions"] = {};
  for (const [fen, moveMap] of positions.entries()) {
    const moves = Array.from(moveMap.values())
      .sort((a, b) => b.count - a.count || a.uci.localeCompare(b.uci))
      .map((move) => ({
        uci: move.uci,
        san: move.san,
        count: move.count,
        openings: Array.from(move.openings).sort(),
      }));
    jsonPositions[fen] = { moves };
  }

  catalog.sort((a, b) => a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name));

  const outputData: OpeningData = {
    positions: jsonPositions,
    catalog,
  };

  const outputPath = resolve(output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(outputData), "utf8");

  console.log(`TSV files: ${tsvFiles.length}`);
  console.log(`Positions: ${Object.keys(jsonPositions).length}`);
  console.log(`Catalog entries: ${catalog.length}`);
  console.log(`Skipped invalid lines: ${skipped}`);
  console.log(`Wrote: ${outputPath}`);
}

main();
