import { StockfishEngine } from "./stockfish-api";

const START_FEN = "rn1qkbnr/pppb1ppp/3pp3/8/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 0 1";

export async function runManualStockfishTest(): Promise<void> {
  const engine = new StockfishEngine();
  try {
    await engine.init();
    const evalResult = await engine.evaluate(START_FEN, 12);
    const topMoves = await engine.getTopMoves(START_FEN, 3, 12);
    console.log("Stockfish eval:", evalResult);
    console.log("Top moves:", topMoves);
  } finally {
    engine.destroy();
  }
}
