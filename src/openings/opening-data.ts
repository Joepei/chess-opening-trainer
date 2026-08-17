import catalogData from "@/data/openings/catalog.json";
import positions01 from "@/data/openings/positions-01.json";
import positions02 from "@/data/openings/positions-02.json";
import positions03 from "@/data/openings/positions-03.json";
import positions04 from "@/data/openings/positions-04.json";
import positions05 from "@/data/openings/positions-05.json";
import positions06 from "@/data/openings/positions-06.json";
import positions07 from "@/data/openings/positions-07.json";
import positions08 from "@/data/openings/positions-08.json";

export interface BookMove {
  uci: string;
  san: string;
  count: number;
  openings: string[];
}

export interface OpeningCatalogEntry {
  eco: string;
  name: string;
  pgn: string;
  family: string;
  variation: string;
  moves: string[];
}

export interface OpeningBookData {
  positions: Record<string, { moves: BookMove[] }>;
  catalog: OpeningCatalogEntry[];
}

const positionChunks = [
  positions01,
  positions02,
  positions03,
  positions04,
  positions05,
  positions06,
  positions07,
  positions08,
];

const openingsData: OpeningBookData = {
  positions: Object.assign({}, ...positionChunks.map((chunk) => chunk.positions)),
  catalog: catalogData.catalog,
};

export default openingsData;
