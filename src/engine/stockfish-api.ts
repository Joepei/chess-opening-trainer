type EngineEval = {
  score: number;
  bestMove: string;
  pv: string[];
  mate: number | null;
};

type TopMove = {
  move: string;
  score: number;
  pv: string[];
};

type InfoLine = {
  depth: number;
  multipv: number;
  scoreCp: number | null;
  scoreMate: number | null;
  pv: string[];
};

type PendingWaiter = {
  matcher: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type WorkerMessage =
  | { type: "output"; payload: string }
  | { type: "ready" }
  | { type: "error"; payload: string };

// A search is deterministic for a given (position, depth), so results can be
// reused. Bounded so a long session cannot grow the map without limit.
const EVAL_CACHE_LIMIT = 4096;

export class StockfishEngine {
  private worker: Worker;
  private isReady = false;
  private pendingWaiters: PendingWaiter[] = [];
  private rawOutputListeners = new Set<(line: string) => void>();
  private operationQueue: Promise<void> = Promise.resolve();
  private evalCache = new Map<string, EngineEval>();

  constructor() {
    this.worker = new Worker(new URL("./stockfish-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleMessage(event.data);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      this.handleMessage({
        type: "error",
        payload: event.message || "Stockfish outer worker failed.",
      });
    };
  }

  async init(): Promise<void> {
    await this.enqueue(async () => {
      if (this.isReady) {
        return;
      }

      this.worker.postMessage({ type: "init" });
      this.sendCommand("uci");
      await this.waitForOutput("uciok", 30_000);
      this.sendCommand("isready");
      await this.waitForOutput("readyok", 30_000);
      this.isReady = true;
    });
  }

  async newGame(): Promise<void> {
    await this.enqueue(async () => {
      if (!this.isReady) {
        return;
      }
      this.sendCommand("ucinewgame");
      this.sendCommand("isready");
      await this.waitForOutput("readyok", 30_000);
    });
  }

  async evaluate(fen: string, depth = 16): Promise<EngineEval> {
    const cacheKey = `${depth}::${fen}`;
    const cached = this.evalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    return this.enqueue(async () => {
      this.ensureReady();

      const alreadyCached = this.evalCache.get(cacheKey);
      if (alreadyCached) {
        return alreadyCached;
      }

      this.sendCommand("setoption name MultiPV value 1");
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth}`);

      const infoLines: InfoLine[] = [];

      const waiter = this.waitForOutput("bestmove", 30_000);
      const unsub = this.subscribeRawOutput((line) => {
        if (line.startsWith("info ")) {
          const parsed = parseInfoLine(line);
          if (parsed) {
            infoLines.push(parsed);
          }
        }
      });

      const bestmoveLine = await waiter;
      unsub();

      const bestMove = bestmoveLine.split(/\s+/)[1] ?? "";
      const bestInfo = pickBestInfo(infoLines, depth, 1);

      const mate = bestInfo?.scoreMate ?? null;
      const score = bestInfo?.scoreCp ?? (mate === null ? 0 : mate > 0 ? 100000 : -100000);

      const result: EngineEval = {
        score,
        bestMove,
        pv: bestInfo?.pv ?? [],
        mate,
      };

      this.cacheEval(cacheKey, result);
      return result;
    });
  }

  async getTopMoves(fen: string, n = 5, depth = 16): Promise<TopMove[]> {
    return this.enqueue(async () => {
      this.ensureReady();

      this.sendCommand(`setoption name MultiPV value ${n}`);
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth}`);

      const infoLines: InfoLine[] = [];
      const waiter = this.waitForOutput("bestmove", 30_000);
      const unsub = this.subscribeRawOutput((line) => {
        if (line.startsWith("info ")) {
          const parsed = parseInfoLine(line);
          if (parsed) {
            infoLines.push(parsed);
          }
        }
      });

      await waiter;
      unsub();
      this.sendCommand("setoption name MultiPV value 1");

      const byPv = new Map<number, InfoLine>();

      for (let i = 1; i <= n; i += 1) {
        const picked = pickBestInfo(infoLines, depth, i);
        if (picked) {
          byPv.set(i, picked);
        }
      }

      return Array.from(byPv.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, info]) => ({
          move: info.pv[0] ?? "",
          score:
            info.scoreCp ?? (info.scoreMate === null ? 0 : info.scoreMate > 0 ? 100000 : -100000),
          pv: info.pv,
        }));
    });
  }

  async getBestMove(fen: string, depth = 16): Promise<string> {
    const evalResult = await this.evaluate(fen, depth);
    return evalResult.bestMove;
  }

  subscribeRawOutput(listener: (line: string) => void): () => void {
    this.rawOutputListeners.add(listener);
    return () => this.rawOutputListeners.delete(listener);
  }

  destroy(): void {
    if (this.isReady) {
      this.sendCommand("quit");
    }
    this.worker.postMessage({ type: "terminate" });
    this.worker.terminate();

    for (const waiter of this.pendingWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error("Engine destroyed."));
    }
    this.pendingWaiters = [];
    this.rawOutputListeners.clear();
    this.evalCache.clear();
    this.isReady = false;
  }

  private cacheEval(key: string, result: EngineEval): void {
    if (this.evalCache.size >= EVAL_CACHE_LIMIT) {
      const oldestKey = this.evalCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.evalCache.delete(oldestKey);
      }
    }
    this.evalCache.set(key, result);
  }

  private ensureReady(): void {
    if (!this.isReady) {
      throw new Error("Engine is not initialized. Call init() first.");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private sendCommand(command: string): void {
    this.worker.postMessage({ type: "command", payload: command });
  }

  private waitForOutput(contains: string, timeoutMs = 15_000): Promise<string> {
    return this.waitForLine((line) => line.includes(contains), timeoutMs);
  }

  private waitForMessageType(type: WorkerMessage["type"], timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for worker message: ${type}`));
      }, timeoutMs);

      const listener = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === type) {
          cleanup();
          resolve();
          return;
        }
        if (event.data.type === "error") {
          cleanup();
          reject(new Error(event.data.payload));
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.worker.removeEventListener("message", listener);
      };

      this.worker.addEventListener("message", listener);
    });
  }

  private waitForLine(
    matcher: (line: string) => boolean,
    timeoutMs = 15_000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingWaiters = this.pendingWaiters.filter((w) => w !== waiter);
        reject(new Error("Timed out waiting for engine output."));
      }, timeoutMs);

      const waiter: PendingWaiter = {
        matcher,
        resolve: (line) => {
          clearTimeout(timeoutId);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        timeoutId,
      };

      this.pendingWaiters.push(waiter);
    });
  }

  private handleMessage(message: WorkerMessage): void {
    if (message.type === "error") {
      const error = new Error(message.payload);
      for (const waiter of this.pendingWaiters) {
        clearTimeout(waiter.timeoutId);
        waiter.reject(error);
      }
      this.pendingWaiters = [];
      return;
    }

    if (message.type !== "output") {
      return;
    }

    const line = message.payload;
    for (const listener of this.rawOutputListeners) {
      listener(line);
    }

    const nextWaiters: PendingWaiter[] = [];
    for (const waiter of this.pendingWaiters) {
      if (waiter.matcher(line)) {
        waiter.resolve(line);
      } else {
        nextWaiters.push(waiter);
      }
    }
    this.pendingWaiters = nextWaiters;
  }
}

function parseInfoLine(line: string): InfoLine | null {
  const tokens = line.trim().split(/\s+/);
  if (!tokens.includes("depth")) {
    return null;
  }

  const depth = getNumberAfter(tokens, "depth") ?? 0;
  const multipv = getNumberAfter(tokens, "multipv") ?? 1;
  const scoreKindIndex = tokens.indexOf("score");
  let scoreCp: number | null = null;
  let scoreMate: number | null = null;

  if (scoreKindIndex >= 0 && scoreKindIndex + 2 < tokens.length) {
    const scoreType = tokens[scoreKindIndex + 1];
    const scoreValue = Number.parseInt(tokens[scoreKindIndex + 2], 10);
    if (Number.isFinite(scoreValue)) {
      if (scoreType === "cp") {
        scoreCp = scoreValue;
      } else if (scoreType === "mate") {
        scoreMate = scoreValue;
      }
    }
  }

  const pvIndex = tokens.indexOf("pv");
  const pv = pvIndex >= 0 ? tokens.slice(pvIndex + 1) : [];

  return {
    depth,
    multipv,
    scoreCp,
    scoreMate,
    pv,
  };
}

function pickBestInfo(lines: InfoLine[], targetDepth: number, multipv: number): InfoLine | null {
  const filtered = lines.filter((line) => line.multipv === multipv && line.pv.length > 0);
  if (filtered.length === 0) {
    return null;
  }

  const atOrBelowTarget = filtered.filter((line) => line.depth <= targetDepth);
  const pool = atOrBelowTarget.length > 0 ? atOrBelowTarget : filtered;

  return pool.reduce((best, current) => (current.depth > best.depth ? current : best));
}

function getNumberAfter(tokens: string[], key: string): number | null {
  const index = tokens.indexOf(key);
  if (index < 0 || index + 1 >= tokens.length) {
    return null;
  }
  const value = Number.parseInt(tokens[index + 1], 10);
  return Number.isFinite(value) ? value : null;
}
