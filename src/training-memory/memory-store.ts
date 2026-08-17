export type TrainerBookMoveStat = {
  positionKey: string;
  uci: string;
  san: string;
  openingName: string | null;
  count: number;
  lastPlayedAt: string;
};

export type MistakeMemoryItem = {
  id: string;
  openingName: string | null;
  fen: string;
  playedUci: string;
  playedSan: string;
  expectedUci: string;
  expectedSan: string;
  category: "left_book" | "punishable" | "inaccuracy";
  coachMessage: string;
  timestamp: string;
};

export type OpeningProgressStat = {
  openingKey: string;
  openingName: string | null;
  sessions: number;
  totalMoves: number;
  mistakes: number;
  punishments: number;
  lastPracticedAt: string;
};

export type PlayableMoveMemoryItem = {
  id: string;
  sourceOpening: string | null;
  resultingOpening: string | null;
  fen: string;
  playedUci: string;
  playedSan: string;
  count: number;
  lastPlayedAt: string;
};

export type SessionSummaryInput = {
  openingName: string | null;
  totalMoves: number;
  mistakes: number;
  punishments: number;
};

export interface TrainingMemoryStore {
  getTrainerBookMoveCounts(positionKey: string): Promise<Map<string, number>>;
  recordTrainerBookMove(stat: {
    positionKey: string;
    uci: string;
    san: string;
    openingName: string | null;
  }): Promise<void>;
  recordMistake(item: Omit<MistakeMemoryItem, "id" | "timestamp">): Promise<void>;
  getRecentMistakes(limit: number): Promise<MistakeMemoryItem[]>;
  recordSessionSummary(summary: SessionSummaryInput): Promise<void>;
  getOpeningProgress(limit: number): Promise<OpeningProgressStat[]>;
  getMostRepeatedTrainerBookMoves(limit: number): Promise<TrainerBookMoveStat[]>;
  recordPlayableMove(item: Omit<PlayableMoveMemoryItem, "id" | "count" | "lastPlayedAt">): Promise<void>;
  getPlayableMoves(limit: number): Promise<PlayableMoveMemoryItem[]>;
}

const DB_NAME = "chess-opening-trainer-memory";
const DB_VERSION = 3;
const TRAINER_BOOK_MOVES_STORE = "trainer-book-moves";
const MISTAKES_STORE = "mistakes";
const OPENING_PROGRESS_STORE = "opening-progress";
const PLAYABLE_MOVES_STORE = "playable-moves";
const FREE_PLAY_KEY = "__free_play__";
const REQUIRED_STORES = [
  TRAINER_BOOK_MOVES_STORE,
  MISTAKES_STORE,
  OPENING_PROGRESS_STORE,
  PLAYABLE_MOVES_STORE,
] as const;

type TrainerBookMoveRecord = TrainerBookMoveStat & {
  id: string;
};

type OpeningProgressRecord = OpeningProgressStat;
type PlayableMoveRecord = PlayableMoveMemoryItem;

export class IndexedDbTrainingMemoryStore implements TrainingMemoryStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private countsCache = new Map<string, Map<string, number>>();

  async getTrainerBookMoveCounts(positionKey: string): Promise<Map<string, number>> {
    const cached = this.countsCache.get(positionKey);
    if (cached) {
      return new Map(cached);
    }

    const db = await this.getHealthyDb(TRAINER_BOOK_MOVES_STORE);
    if (!db) {
      return new Map();
    }

    return new Promise((resolve) => {
      let request: IDBRequest;
      try {
        const tx = db.transaction(TRAINER_BOOK_MOVES_STORE, "readonly");
        const store = tx.objectStore(TRAINER_BOOK_MOVES_STORE);
        const index = store.index("positionKey");
        request = index.getAll(IDBKeyRange.only(positionKey));
      } catch {
        this.dbPromise = null;
        resolve(new Map());
        return;
      }

      request.onsuccess = () => {
        const counts = new Map<string, number>();
        const rows = (request.result as TrainerBookMoveRecord[]) ?? [];
        for (const row of rows) {
          counts.set(row.uci, row.count);
        }
        this.countsCache.set(positionKey, counts);
        resolve(new Map(counts));
      };

      request.onerror = () => resolve(new Map());
    });
  }

  async recordTrainerBookMove(stat: {
    positionKey: string;
    uci: string;
    san: string;
    openingName: string | null;
  }): Promise<void> {
    const positionCounts = this.countsCache.get(stat.positionKey) ?? new Map<string, number>();
    const nextCount = (positionCounts.get(stat.uci) ?? 0) + 1;
    positionCounts.set(stat.uci, nextCount);
    this.countsCache.set(stat.positionKey, positionCounts);

    const db = await this.getHealthyDb(TRAINER_BOOK_MOVES_STORE);
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      let store: IDBObjectStore;
      let getRequest: IDBRequest;
      const id = makeTrainerBookMoveId(stat.positionKey, stat.uci);
      try {
        tx = db.transaction(TRAINER_BOOK_MOVES_STORE, "readwrite");
        store = tx.objectStore(TRAINER_BOOK_MOVES_STORE);
        getRequest = store.get(id);
      } catch {
        this.dbPromise = null;
        resolve();
        return;
      }

      getRequest.onsuccess = () => {
        const existing = getRequest.result as TrainerBookMoveRecord | undefined;
        const record: TrainerBookMoveRecord = {
          id,
          positionKey: stat.positionKey,
          uci: stat.uci,
          san: stat.san,
          openingName: stat.openingName,
          count: (existing?.count ?? 0) + 1,
          lastPlayedAt: new Date().toISOString(),
        };
        store.put(record);
      };

      getRequest.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async recordMistake(item: Omit<MistakeMemoryItem, "id" | "timestamp">): Promise<void> {
    const db = await this.getHealthyDb(MISTAKES_STORE);
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      let store: IDBObjectStore;
      try {
        tx = db.transaction(MISTAKES_STORE, "readwrite");
        store = tx.objectStore(MISTAKES_STORE);
      } catch {
        this.dbPromise = null;
        resolve();
        return;
      }
      store.put({
        ...item,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      } satisfies MistakeMemoryItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async getRecentMistakes(limit: number): Promise<MistakeMemoryItem[]> {
    const db = await this.getHealthyDb(MISTAKES_STORE);
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      let request: IDBRequest;
      try {
        const tx = db.transaction(MISTAKES_STORE, "readonly");
        const store = tx.objectStore(MISTAKES_STORE);
        request = store.getAll();
      } catch {
        this.dbPromise = null;
        resolve([]);
        return;
      }

      request.onsuccess = () => {
        const rows = ((request.result as MistakeMemoryItem[]) ?? [])
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, limit);
        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  }

  async recordSessionSummary(summary: SessionSummaryInput): Promise<void> {
    const db = await this.getHealthyDb(OPENING_PROGRESS_STORE);
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      let store: IDBObjectStore;
      const openingKey = normalizeOpeningKey(summary.openingName);
      let getRequest: IDBRequest;
      try {
        tx = db.transaction(OPENING_PROGRESS_STORE, "readwrite");
        store = tx.objectStore(OPENING_PROGRESS_STORE);
        getRequest = store.get(openingKey);
      } catch {
        this.dbPromise = null;
        resolve();
        return;
      }

      getRequest.onsuccess = () => {
        const existing = getRequest.result as OpeningProgressRecord | undefined;
        const record: OpeningProgressRecord = {
          openingKey,
          openingName: summary.openingName,
          sessions: (existing?.sessions ?? 0) + 1,
          totalMoves: (existing?.totalMoves ?? 0) + summary.totalMoves,
          mistakes: (existing?.mistakes ?? 0) + summary.mistakes,
          punishments: (existing?.punishments ?? 0) + summary.punishments,
          lastPracticedAt: new Date().toISOString(),
        };
        store.put(record);
      };

      getRequest.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async getOpeningProgress(limit: number): Promise<OpeningProgressStat[]> {
    const db = await this.getHealthyDb(OPENING_PROGRESS_STORE);
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      let request: IDBRequest;
      try {
        const tx = db.transaction(OPENING_PROGRESS_STORE, "readonly");
        const store = tx.objectStore(OPENING_PROGRESS_STORE);
        request = store.getAll();
      } catch {
        this.dbPromise = null;
        resolve([]);
        return;
      }

      request.onsuccess = () => {
        const rows = ((request.result as OpeningProgressRecord[]) ?? [])
          .sort((a, b) => {
            const severityA = a.mistakes * 3 + a.punishments * 2 + a.totalMoves;
            const severityB = b.mistakes * 3 + b.punishments * 2 + b.totalMoves;
            return severityB - severityA || b.lastPracticedAt.localeCompare(a.lastPracticedAt);
          })
          .slice(0, limit);
        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  }

  async getMostRepeatedTrainerBookMoves(limit: number): Promise<TrainerBookMoveStat[]> {
    const db = await this.getHealthyDb(TRAINER_BOOK_MOVES_STORE);
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      let request: IDBRequest;
      try {
        const tx = db.transaction(TRAINER_BOOK_MOVES_STORE, "readonly");
        const store = tx.objectStore(TRAINER_BOOK_MOVES_STORE);
        request = store.getAll();
      } catch {
        this.dbPromise = null;
        resolve([]);
        return;
      }

      request.onsuccess = () => {
        const rows = ((request.result as TrainerBookMoveRecord[]) ?? [])
          .sort((a, b) => b.count - a.count || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
          .slice(0, limit);
        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  }

  async recordPlayableMove(item: Omit<PlayableMoveMemoryItem, "id" | "count" | "lastPlayedAt">): Promise<void> {
    const db = await this.getHealthyDb(PLAYABLE_MOVES_STORE);
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      let store: IDBObjectStore;
      const id = makePlayableMoveId(item.sourceOpening, item.fen, item.playedUci);
      let getRequest: IDBRequest;
      try {
        tx = db.transaction(PLAYABLE_MOVES_STORE, "readwrite");
        store = tx.objectStore(PLAYABLE_MOVES_STORE);
        getRequest = store.get(id);
      } catch {
        this.dbPromise = null;
        resolve();
        return;
      }

      getRequest.onsuccess = () => {
        const existing = getRequest.result as PlayableMoveRecord | undefined;
        const record: PlayableMoveRecord = {
          id,
          sourceOpening: item.sourceOpening,
          resultingOpening: item.resultingOpening,
          fen: item.fen,
          playedUci: item.playedUci,
          playedSan: item.playedSan,
          count: (existing?.count ?? 0) + 1,
          lastPlayedAt: new Date().toISOString(),
        };
        store.put(record);
      };

      getRequest.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async getPlayableMoves(limit: number): Promise<PlayableMoveMemoryItem[]> {
    const db = await this.getHealthyDb(PLAYABLE_MOVES_STORE);
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      let request: IDBRequest;
      try {
        const tx = db.transaction(PLAYABLE_MOVES_STORE, "readonly");
        const store = tx.objectStore(PLAYABLE_MOVES_STORE);
        request = store.getAll();
      } catch {
        this.dbPromise = null;
        resolve([]);
        return;
      }

      request.onsuccess = () => {
        const rows = ((request.result as PlayableMoveRecord[]) ?? [])
          .sort((a, b) => b.count - a.count || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
          .slice(0, limit);
        resolve(rows);
      };

      request.onerror = () => resolve([]);
    });
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") {
      return null;
    }

    if (!this.dbPromise) {
      this.dbPromise = openTrainingMemoryDb();
    }

    return this.dbPromise;
  }

  private async getHealthyDb(requiredStore: string): Promise<IDBDatabase | null> {
    let db = await this.getDb();
    if (db && db.objectStoreNames.contains(requiredStore)) {
      return db;
    }

    if (db) {
      db.close();
    }
    this.dbPromise = recreateTrainingMemoryDb();
    db = await this.dbPromise;
    if (db && db.objectStoreNames.contains(requiredStore)) {
      return db;
    }

    this.dbPromise = null;
    return null;
  }
}

export class NoopTrainingMemoryStore implements TrainingMemoryStore {
  async getTrainerBookMoveCounts(): Promise<Map<string, number>> {
    return new Map();
  }

  async recordTrainerBookMove(): Promise<void> {
    return;
  }

  async recordMistake(): Promise<void> {
    return;
  }

  async getRecentMistakes(): Promise<MistakeMemoryItem[]> {
    return [];
  }

  async recordSessionSummary(): Promise<void> {
    return;
  }

  async getOpeningProgress(): Promise<OpeningProgressStat[]> {
    return [];
  }

  async getMostRepeatedTrainerBookMoves(): Promise<TrainerBookMoveStat[]> {
    return [];
  }

  async recordPlayableMove(): Promise<void> {
    return;
  }

  async getPlayableMoves(): Promise<PlayableMoveMemoryItem[]> {
    return [];
  }
}

function openTrainingMemoryDb(): Promise<IDBDatabase | null> {
  return openTrainingMemoryDbInternal(false);
}

function openTrainingMemoryDbInternal(hasRetried: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        ensureStore(db, request.transaction!, TRAINER_BOOK_MOVES_STORE, { keyPath: "id" }, (store) => {
          if (!store.indexNames.contains("positionKey")) {
            store.createIndex("positionKey", "positionKey", { unique: false });
          }
        });

        ensureStore(db, request.transaction!, MISTAKES_STORE, { keyPath: "id" });
        ensureStore(db, request.transaction!, OPENING_PROGRESS_STORE, { keyPath: "openingKey" });
        ensureStore(db, request.transaction!, PLAYABLE_MOVES_STORE, { keyPath: "id" });
      };

      request.onsuccess = async () => {
        const db = request.result;
        if (hasRequiredStores(db)) {
          resolve(db);
          return;
        }

        db.close();
        if (hasRetried) {
          resolve(null);
          return;
        }

        const repaired = await recreateTrainingMemoryDb();
        resolve(repaired);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function recreateTrainingMemoryDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      deleteRequest.onsuccess = async () => resolve(await openTrainingMemoryDbInternal(true));
      deleteRequest.onerror = () => resolve(null);
      deleteRequest.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function ensureStore(
  db: IDBDatabase,
  tx: IDBTransaction,
  storeName: string,
  options: IDBObjectStoreParameters,
  setup?: (store: IDBObjectStore) => void,
): void {
  let store: IDBObjectStore;
  if (!db.objectStoreNames.contains(storeName)) {
    store = db.createObjectStore(storeName, options);
  } else {
    store = tx.objectStore(storeName);
  }

  setup?.(store);
}

function hasRequiredStores(db: IDBDatabase): boolean {
  return REQUIRED_STORES.every((storeName) => db.objectStoreNames.contains(storeName));
}

function makeTrainerBookMoveId(positionKey: string, uci: string): string {
  return `${positionKey}::${uci}`;
}

function normalizeOpeningKey(openingName: string | null): string {
  return openingName?.trim().toLowerCase() || FREE_PLAY_KEY;
}

function makePlayableMoveId(sourceOpening: string | null, fen: string, playedUci: string): string {
  return `${normalizeOpeningKey(sourceOpening)}::${fen}::${playedUci}`;
}
