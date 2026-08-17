/// <reference lib="webworker" />

type WorkerInput =
  | { type: "init" }
  | { type: "command"; payload: string }
  | { type: "terminate" };

type WorkerOutput =
  | { type: "output"; payload: string }
  | { type: "ready" }
  | { type: "error"; payload: string };

let engineWorker: Worker | null = null;
let pendingCommands: string[] = [];

function post(msg: WorkerOutput): void {
  self.postMessage(msg);
}

function initEngine(): void {
  if (engineWorker) {
    post({ type: "ready" });
    return;
  }

  try {
    // In nested-worker contexts some browsers reject root-relative URLs.
    const origin =
      typeof self.location?.origin === "string" && self.location.origin !== "null"
        ? self.location.origin
        : new URL(self.location.href).origin;
    const stockfishScriptUrl = new URL("/stockfish/stockfish.js", origin).toString();
    engineWorker = new Worker(stockfishScriptUrl);

    engineWorker.onmessage = (event: MessageEvent<unknown>) => {
      post({ type: "output", payload: String(event.data ?? "") });
    };

    engineWorker.onerror = (event: ErrorEvent) => {
      post({
        type: "error",
        payload: event.message || "Stockfish inner worker failed.",
      });
    };

    for (const command of pendingCommands) {
      engineWorker.postMessage(command);
    }
    pendingCommands = [];

    post({ type: "ready" });
  } catch (error) {
    post({
      type: "error",
      payload:
        error instanceof Error
          ? `Failed to initialize Stockfish worker: ${error.message}`
          : "Failed to initialize Stockfish worker.",
    });
  }
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const message = event.data;

  if (message.type === "init") {
    initEngine();
    return;
  }

  if (message.type === "command") {
    if (!engineWorker) {
      pendingCommands.push(message.payload);
      return;
    }
    engineWorker.postMessage(message.payload);
    return;
  }

  if (message.type === "terminate" && engineWorker) {
    engineWorker.terminate();
    engineWorker = null;
  }
};
