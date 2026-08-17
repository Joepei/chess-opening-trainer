import { Chess } from "chess.js";
import openingsData, { type BookMove, type OpeningBookData } from "./opening-data";

export interface BookMoveWithWeight {
  uci: string;
  san: string;
  weight: number;
  openings: string[];
}

export interface OpeningIdentity {
  family: string;
  practice: string;
  rawNames: string[];
  ecoCodes: string[];
}

let sharedBook: OpeningBook | null = null;

/**
 * Building a book replays every catalog line through chess.js to construct the
 * reverse index, which is far too expensive to redo on every new drill.
 */
export function getSharedOpeningBook(): OpeningBook {
  if (!sharedBook) {
    sharedBook = new OpeningBook();
  }
  return sharedBook;
}

export class OpeningBook {
  private positions: Map<string, BookMove[]>;
  private reverseIndex: Map<string, OpeningIdentity[]>;
  private data: OpeningBookData;
  private filteredCache = new Map<string, OpeningBook>();

  constructor(data: OpeningBookData = openingsData) {
    this.data = data;
    this.positions = new Map();
    this.reverseIndex = new Map();

    for (const [positionKey, record] of Object.entries(data.positions)) {
      this.positions.set(
        positionKey,
        record.moves.map((move) => ({
          uci: move.uci,
          san: move.san,
          count: move.count,
          openings: [...move.openings],
        })),
      );
    }

    this.buildReverseIndex();
  }

  getPositionKey(fen: string): string {
    const parts = fen.split(" ");
    return parts.slice(0, 4).join(" ");
  }

  isInBook(fen: string): boolean {
    return this.positions.has(this.getPositionKey(fen));
  }

  getBookMoves(fen: string): BookMoveWithWeight[] {
    const moves = this.positions.get(this.getPositionKey(fen)) ?? [];
    const total = moves.reduce((sum, move) => sum + move.count, 0);
    if (total <= 0) {
      return [];
    }

    return moves
      .map((move) => ({
        uci: move.uci,
        san: move.san,
        openings: [...move.openings],
        weight: move.count / total,
      }))
      .sort((a, b) => b.weight - a.weight || a.uci.localeCompare(b.uci));
  }

  chooseBookMove(fen: string): { uci: string; san: string } | null {
    const moves = this.positions.get(this.getPositionKey(fen)) ?? [];
    if (moves.length === 0) {
      return null;
    }

    const total = moves.reduce((sum, move) => sum + move.count, 0);
    let roll = Math.random() * total;
    for (const move of moves) {
      roll -= move.count;
      if (roll <= 0) {
        return { uci: move.uci, san: move.san };
      }
    }

    const fallback = moves[moves.length - 1];
    return { uci: fallback.uci, san: fallback.san };
  }

  getOpeningName(fen: string): string | null {
    const identities = this.identifyPosition(fen);
    if (identities.length === 0) {
      return null;
    }

    return identities[0]?.practice ?? null;
  }

  filterByOpening(openingPrefix: string): OpeningBook {
    const prefix = openingPrefix.trim().toLowerCase();
    if (!prefix) {
      return this;
    }

    const cached = this.filteredCache.get(prefix);
    if (cached) {
      return cached;
    }

    const filteredPositions: OpeningBookData["positions"] = {};

    for (const [fen, record] of Object.entries(this.data.positions)) {
      const moves: BookMove[] = [];
      for (const move of record.moves) {
        const openings = move.openings.filter((name) =>
          matchesOpeningSelection(name, prefix),
        );
        if (openings.length > 0) {
          moves.push({
            uci: move.uci,
            san: move.san,
            count: openings.length,
            openings,
          });
        }
      }

      if (moves.length > 0) {
        filteredPositions[fen] = { moves };
      }
    }

    const filteredCatalog = this.data.catalog.filter((entry) =>
      matchesOpeningSelection(entry.name, prefix),
    );

    const filtered = new OpeningBook({
      positions: filteredPositions,
      catalog: filteredCatalog,
    });
    this.filteredCache.set(prefix, filtered);
    return filtered;
  }

  getPositionCount(): number {
    return this.positions.size;
  }

  identifyPosition(fen: string): OpeningIdentity[] {
    return this.reverseIndex.get(this.getPositionKey(fen)) ?? [];
  }

  getRawData(): OpeningBookData {
    return this.data;
  }

  private buildReverseIndex(): void {
    const reverseBuilder = new Map<string, Map<string, {
      family: string;
      practice: string;
      rawNames: Set<string>;
      ecoCodes: Set<string>;
    }>>();

    for (const entry of this.data.catalog) {
      const board = new Chess();

      for (const moveUci of entry.moves) {
        const applied = applyUciMove(board, moveUci);
        if (!applied) {
          break;
        }

        const positionKey = this.getPositionKey(board.fen());
        const practice = getPracticeOpeningPrefix(entry.name);
        const family = entry.family || practice;
        const identityKey = `${family}::${practice}`;
        let byIdentity = reverseBuilder.get(positionKey);
        if (!byIdentity) {
          byIdentity = new Map();
          reverseBuilder.set(positionKey, byIdentity);
        }

        let identity = byIdentity.get(identityKey);
        if (!identity) {
          identity = {
            family,
            practice,
            rawNames: new Set(),
            ecoCodes: new Set(),
          };
          byIdentity.set(identityKey, identity);
        }

        identity.rawNames.add(entry.name);
        identity.ecoCodes.add(entry.eco);
      }
    }

    for (const [positionKey, byIdentity] of reverseBuilder.entries()) {
      const identities = Array.from(byIdentity.values())
        .map((identity) => ({
          family: identity.family,
          practice: identity.practice,
          rawNames: Array.from(identity.rawNames).sort(sortOpeningNames),
          ecoCodes: Array.from(identity.ecoCodes).sort(),
        }))
        .sort((a, b) => {
          const depthA = specificityScore(a.practice);
          const depthB = specificityScore(b.practice);
          if (depthA !== depthB) {
            return depthB - depthA;
          }
          return b.rawNames.length - a.rawNames.length || a.practice.localeCompare(b.practice);
        });

      this.reverseIndex.set(positionKey, identities);
    }
  }
}

function specificityScore(name: string): number {
  const colonCount = (name.match(/:/g) ?? []).length;
  const commaCount = (name.match(/,/g) ?? []).length;
  return colonCount * 2 + commaCount;
}

function sortOpeningNames(a: string, b: string): number {
  const depthA = specificityScore(a);
  const depthB = specificityScore(b);
  if (depthA !== depthB) {
    return depthB - depthA;
  }
  return b.length - a.length || a.localeCompare(b);
}

function matchesOpeningSelection(name: string, prefix: string): boolean {
  const practicePrefix = getPracticeOpeningPrefix(name).toLowerCase();
  if (practicePrefix === prefix) {
    return true;
  }

  if (!prefix.includes(":") && practicePrefix.startsWith(`${prefix}:`)) {
    return true;
  }

  const aliases = getOpeningAliases(prefix);
  return aliases.some((alias) => practicePrefix.includes(alias));
}

function getPracticeOpeningPrefix(name: string): string {
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

function applyUciMove(board: Chess, uci: string) {
  if (uci.length < 4) {
    return null;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? uci[4] : undefined;

  try {
    return board.move({ from, to, promotion });
  } catch {
    return null;
  }
}

function getOpeningAliases(prefix: string): string[] {
  const aliases = new Set<string>();

  if (prefix === "london system") {
    aliases.add("accelerated london system");
  }

  return Array.from(aliases);
}
