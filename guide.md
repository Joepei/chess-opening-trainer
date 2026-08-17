# Chess Opening Trainer — Build Guide (Revised)
# Browser-Based Architecture with Stockfish WASM

## What You're Building

A web app where users:
1. Pick a chess opening line to drill (e.g., Sicilian Dragon)
2. Play moves on a board against a bot that plays realistic opening responses
3. When the user blunders, the bot **punishes only if it leads to concrete
   material loss within N moves** (a tunable parameter)
4. A coaching panel explains what went wrong

**Deployment:** Static website on Vercel (free). Friends open a URL and play.
No installation needed. All chess computation happens in the user's browser.

---

## Architecture

```
Everything runs in the user's browser:

┌──────────────────────────────────────────────────────┐
│                   User's Browser                      │
│                                                      │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  React UI    │  │ Stockfish │  │ Opening Book │  │
│  │  (chess      │  │ WASM      │  │ (JSON data)  │  │
│  │   board +    │◄─►│ (engine   │  │              │  │
│  │   coaching)  │  │  runs     │  │ Lichess ECO  │  │
│  │              │  │  locally) │  │ dataset       │  │
│  └──────────────┘  └───────────┘  └──────────────┘  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Punishment Detector (JS)               │ │
│  │  Uses Stockfish WASM to evaluate positions       │ │
│  │  and find punishment lines — all client-side      │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘

Server (Vercel, free):
- Serves the static React app
- Serves the opening book JSON files
- Optional: API route to proxy Anthropic calls for LLM explanations
```

**Why this is better than the original Python backend plan:**
- $0/month hosting (Vercel free tier)
- No server CPU load — Stockfish runs on each user's machine
- No installation for users — just a URL
- Scales to any number of users for free
- Can add LLM features later as an optional enhancement

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | Next.js (React) | Easy Vercel deployment, API routes built in |
| Chess board | react-chessboard + chess.js | Standard React chess UI |
| Chess engine | stockfish.wasm (stockfish-nnue.wasm) | Runs in browser via Web Worker |
| Opening data | Lichess chess-openings (JSON) | Free, comprehensive, public domain |
| Styling | Tailwind CSS | Fast to build, works with Next.js |
| Deployment | Vercel | Free, git push to deploy |
| LLM (optional) | Anthropic API via Next.js API route | Add later when needed |

---

## Prerequisites (On Your Windows Machine)

Before starting, install:
1. **Node.js 18+** — download from https://nodejs.org (LTS version)
2. **Git** — download from https://git-scm.com/download/win
3. **A code editor** — VS Code recommended
4. **A Vercel account** — sign up free at https://vercel.com (use GitHub login)
5. **A GitHub account** — for storing code and auto-deploying to Vercel

You do NOT need Python or Stockfish installed locally anymore.
Stockfish runs in the browser as WASM.

---

## SESSION 1: Project Setup + Stockfish WASM Working

### Step 1.1 — Create Next.js Project

**Paste this to your coding agent:**

```
Create a Next.js project for a chess opening trainer called "chess-opening-trainer".

1. Initialize the project:
   npx create-next-app@latest chess-opening-trainer
   Options: TypeScript=Yes, Tailwind=Yes, App Router=Yes, src/=Yes

2. Install dependencies:
   cd chess-opening-trainer
   npm install chess.js react-chessboard
   
3. Create this project structure inside src/:
   src/
   ├── app/
   │   ├── layout.tsx
   │   ├── page.tsx              (main game page)
   │   └── api/                  (for later LLM proxy)
   ├── components/
   │   ├── ChessBoard.tsx        (the interactive board)
   │   ├── CoachPanel.tsx        (right side info panel)
   │   ├── MoveHistory.tsx       (move list)
   │   ├── EvalBar.tsx           (evaluation bar)
   │   ├── NewGameDialog.tsx     (opening selector)
   │   └── SettingsPanel.tsx     (tunable parameters)
   ├── engine/
   │   ├── stockfish-worker.ts   (Web Worker for Stockfish WASM)
   │   ├── stockfish-api.ts      (clean API wrapping the worker)
   │   └── test-stockfish.ts     (manual test script)
   ├── game/
   │   ├── session.ts            (game session state machine)
   │   ├── punishment.ts         (punishment detection logic)
   │   └── types.ts              (shared TypeScript types)
   ├── openings/
   │   ├── book-manager.ts       (opening book logic)
   │   ├── opening-catalog.ts    (parses the ECO dataset)
   │   └── lichess-explorer.ts   (optional: live API queries)
   └── data/
       └── (opening JSON files go here)

4. Create src/game/types.ts with these core types:

   export interface MoveAnalysis {
     isMistake: boolean;
     isPunishable: boolean;
     evalBefore: number;         // centipawns
     evalAfter: number;
     evalDrop: number;
     bestMove: string;           // UCI
     bestMoveSan: string;        // SAN for display
     punishmentLine: string[];   // UCI moves
     punishmentLineSan: string[];// SAN for display
     materialChange: number;
     explanation?: string;       // from LLM, added later
   }

   export interface GameState {
     fen: string;
     moveHistory: Array<{
       moveNumber: number;
       white: string | null;     // SAN
       black: string | null;     // SAN
       whiteUci: string | null;
       blackUci: string | null;
       analysis?: MoveAnalysis;
     }>;
     mode: 'book' | 'punishment' | 'free_play';
     currentOpening: string | null;
     userColor: 'white' | 'black';
     isThinking: boolean;
     gameOver: boolean;
     result: string | null;
     coachMessage: string;
     stats: SessionStats;
   }

   export interface SessionStats {
     totalMoves: number;
     bookMoves: number;
     mistakes: number;
     punishments: number;
     accuracy: number;           // percentage
   }

   export interface TrainerConfig {
     punishmentDepth: number;    // default 5 (half-moves to search)
     evalThreshold: number;      // default 50 (centipawn drop = mistake)
     materialLossThreshold: number; // default 100 (cp loss to trigger punishment)
     engineDepth: number;        // default 16 (Stockfish search depth)
   }

   export const DEFAULT_CONFIG: TrainerConfig = {
     punishmentDepth: 5,
     evalThreshold: 50,
     materialLossThreshold: 100,
     engineDepth: 16,
   };

5. Make sure the app runs: npm run dev
   Verify you see the default Next.js page at http://localhost:3000
```

### Step 1.2 — Stockfish WASM Integration

**Paste this to your coding agent:**

```
Set up Stockfish to run in the browser via Web Workers and WASM.

We'll use the stockfish.js WASM build. Here's how:

1. Download Stockfish WASM files. Run these commands in the project root:

   mkdir -p public/stockfish
   
   Download from the official stockfish.js npm package or CDN.
   The simplest approach: install it as a dependency and copy the files:
   
   npm install stockfish
   
   Then copy the WASM files to public/stockfish/:
   - node_modules/stockfish/src/stockfish-nnue-16-single.js
   - node_modules/stockfish/src/stockfish-nnue-16-single.wasm
   
   (The exact filenames may vary by version. Look in node_modules/stockfish/src/
   for .js and .wasm files. We want the "single" threaded version for broadest 
   browser compatibility.)

   If the above doesn't work, use the stockfish.wasm npm package instead:
   npm install stockfish.wasm
   
   Or download directly from:
   https://github.com/nicfab/stockfish.wasm/releases
   
   Place the .js and .wasm files in public/stockfish/

2. Create src/engine/stockfish-worker.ts:

   This is a Web Worker that loads Stockfish WASM and communicates
   via postMessage. The worker should:
   
   - On initialization: load the Stockfish WASM module
   - Accept UCI commands as string messages
   - Send back UCI output as string messages
   
   // stockfish-worker.ts
   // This runs in a Web Worker context
   
   let stockfish: any = null;
   
   self.onmessage = async (e: MessageEvent) => {
     const { type, payload } = e.data;
     
     if (type === 'init') {
       // Load Stockfish WASM
       // Use importScripts for the classic approach, or dynamic import
       // The exact loading method depends on which stockfish.js package
       // you're using. Try:
       importScripts('/stockfish/stockfish-nnue-16-single.js');
       // The script should expose a Stockfish() constructor or similar
       // Initialize and set up message forwarding
       
       // When Stockfish outputs a line:
       // self.postMessage({ type: 'output', payload: line });
     }
     
     if (type === 'command') {
       // Send UCI command to Stockfish
       // e.g., "position fen ... moves ..."
       // e.g., "go depth 16"
       // e.g., "quit"
     }
   };

   IMPORTANT: The exact initialization depends on the stockfish.js build.
   Common patterns:
   
   Pattern A (stockfish npm package):
     importScripts('/stockfish/stockfish.js');
     const sf = await Stockfish();
     sf.addMessageListener((line: string) => {
       self.postMessage({ type: 'output', payload: line });
     });
     sf.postMessage('uci');  // send commands this way
   
   Pattern B (stockfish.wasm):
     importScripts('/stockfish/stockfish.js');
     // Stockfish is ready, communicates via postMessage/onmessage internally
   
   Try Pattern A first. If it doesn't work, inspect what the JS file exports
   and adapt. The key thing is: we need to send UCI commands in and get
   UCI output back.

3. Create src/engine/stockfish-api.ts:

   This is a clean Promise-based API that wraps the Web Worker.
   
   export class StockfishEngine {
     private worker: Worker;
     private messageQueue: Array<(line: string) => void> = [];
     private isReady: boolean = false;
     
     constructor() {
       this.worker = new Worker(
         new URL('./stockfish-worker.ts', import.meta.url)
       );
       this.worker.onmessage = (e) => this.handleMessage(e);
     }
     
     async init(): Promise<void> {
       // Send 'init' to worker, wait for 'uciok' response
       this.worker.postMessage({ type: 'init' });
       await this.waitForOutput('uciok');
       this.sendCommand('isready');
       await this.waitForOutput('readyok');
       this.isReady = true;
     }
     
     async evaluate(fen: string, depth: number = 16): Promise<{
       score: number;  // centipawns from side-to-move perspective
       bestMove: string;
       pv: string[];   // principal variation (best line)
       mate: number | null;  // moves to mate, or null
     }> {
       // Send: position fen <fen>
       // Send: go depth <depth>
       // Parse the "info depth N ... score cp X ... pv ..." lines
       // Wait for "bestmove" line
       // Return the evaluation from the deepest info line
       
       // IMPORTANT: Parse "score cp X" for centipawn evaluation
       // Parse "score mate X" for mate-in-X
       // Parse "pv" for the principal variation moves
     }
     
     async getTopMoves(fen: string, n: number = 5, depth: number = 16): Promise<Array<{
       move: string;   // UCI
       score: number;  // centipawns
       pv: string[];
     }>> {
       // Send: setoption name MultiPV value <n>
       // Send: position fen <fen>
       // Send: go depth <depth>
       // Parse all "info depth <depth> multipv X ..." lines
       // Reset: setoption name MultiPV value 1
     }
     
     async getBestMove(fen: string, depth: number = 16): Promise<string> {
       // Simple wrapper: evaluate and return just the best move
     }
     
     private sendCommand(cmd: string): void {
       this.worker.postMessage({ type: 'command', payload: cmd });
     }
     
     private waitForOutput(contains: string): Promise<string> {
       // Returns a promise that resolves when a worker message
       // contains the specified string
     }
     
     destroy(): void {
       this.worker.terminate();
     }
   }

4. Create a TEST PAGE to verify Stockfish works.
   Create src/app/test-engine/page.tsx:
   
   A simple page with:
   - A "Initialize Engine" button
   - A "Evaluate Starting Position" button  
   - A "Get Top 5 Moves" button
   - A text area showing raw UCI output
   - Display results: evaluation score, best move, top moves list
   
   This page is just for testing — we'll remove it later.
   
   When you click "Evaluate Starting Position", it should:
   - Call engine.evaluate() with the starting FEN
   - Display something like: "Score: +20cp, Best move: e2e4"
   - Show the principal variation
   
   When you click "Get Top 5 Moves", it should:
   - Call engine.getTopMoves() with starting FEN
   - Display a list like:
     1. e2e4  (+30cp)
     2. d2d4  (+25cp)
     3. g1f3  (+20cp)
     4. c2c4  (+15cp)
     5. e2e3  (+10cp)

5. Run `npm run dev` and go to http://localhost:3000/test-engine
   
   TEST CHECKLIST:
   □ Engine initializes without errors in browser console
   □ Evaluating starting position returns a score near 0 (+/-30cp is fine)
   □ Best move is a reasonable opening move (e4, d4, Nf3, c4, etc.)
   □ Top 5 moves returns 5 different legal moves with scores
   □ No WASM loading errors in console
   □ Worker doesn't freeze the UI (main thread stays responsive)
   
   If the WASM doesn't load, common fixes:
   - Check the file paths in public/stockfish/
   - Check browser console for CORS or MIME type errors
   - Make sure .wasm files are being served with correct MIME type
   - Try a different stockfish.js build
   
   DO NOT PROCEED until all tests pass. This is the foundation.
```

---

## SESSION 2: Opening Book + Punishment Detector

### Step 2.1 — Opening Book Manager

**Paste this to your coding agent:**

```
Build the opening book system that loads chess opening data and determines
what moves are "acceptable" in any position.

1. First, prepare the opening data. The user has downloaded the lichess
   chess-openings repository. We need to convert the .tsv files into
   JSON that can be bundled with the app.

   Create a script: scripts/convert-openings.ts (or .js)
   
   This script should:
   a. Read the .tsv files (a.tsv through e.tsv) from a specified directory
   b. Parse each line: ECO\tName\tPGN
   c. For each opening, use chess.js to play through the PGN and record
      every position (as FEN, board part only) with the move that follows
   d. Build a position tree:
      {
        positions: {
          [fen_board_part: string]: {
            moves: Array<{
              uci: string,
              san: string,
              count: number,    // how many openings go through this move
              openings: string[] // which opening names use this move
            }>
          }
        },
        catalog: Array<{
          eco: string,
          name: string,
          pgn: string,
          family: string,      // e.g., "Sicilian Defense"
          variation: string,   // e.g., "Dragon Variation"
          moves: string[]      // UCI move list
        }>
      }
   e. Save as src/data/openings.json
   
   Note: This file will be large (~2-5MB). That's fine for now.
   Later we can split it by ECO code for lazy loading.
   
   IMPORTANT for FEN normalization: When using a FEN as a position key,
   strip the halfmove clock and fullmove number (fields 5 and 6), and
   keep only the first 4 fields (piece placement, active color, castling,
   en passant). This ensures transpositions are matched.
   
   Example:
   Full FEN: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
   Position key: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3"

2. Create src/openings/book-manager.ts:

   import openingsData from '@/data/openings.json';
   import { Chess } from 'chess.js';
   
   export class OpeningBook {
     private positions: Map<string, Array<{
       uci: string;
       san: string;
       count: number;
       openings: string[];
     }>>;
     
     constructor(data?: typeof openingsData) {
       // Load from the JSON data
       // Build the positions map
     }
     
     getPositionKey(fen: string): string {
       // Strip move counters from FEN for position matching
       const parts = fen.split(' ');
       return parts.slice(0, 4).join(' ');
     }
     
     isInBook(fen: string): boolean {
       return this.positions.has(this.getPositionKey(fen));
     }
     
     getBookMoves(fen: string): Array<{
       uci: string;
       san: string;
       weight: number;  // proportional to count
       openings: string[];
     }> {
       // Return all book moves for this position with weights
     }
     
     chooseBookMove(fen: string): { uci: string; san: string } | null {
       // Randomly select a move weighted by frequency
       // Uses weighted random selection
     }
     
     getOpeningName(fen: string): string | null {
       // Return the most specific opening name that matches this position
       // Walk backwards through move history to find the deepest named position
     }
     
     filterByOpening(openingPrefix: string): OpeningBook {
       // Return a new OpeningBook containing only positions
       // from openings whose name starts with openingPrefix
       // e.g., "Sicilian Defense: Dragon" includes all Dragon sub-variations
     }
   }

3. Create src/openings/opening-catalog.ts:

   export interface OpeningFamily {
     name: string;           // "Sicilian Defense"
     eco: string[];          // ["B20", "B21", ...]
     variations: Array<{
       name: string;         // "Dragon Variation"
       fullName: string;     // "Sicilian Defense: Dragon Variation"
       eco: string;
       pgn: string;
       moveCount: number;    // how many half-moves in the line
     }>;
   }
   
   export function getCatalog(): OpeningFamily[] {
     // Parse openings.json catalog and group by family
     // Sort families alphabetically
     // Sort variations by ECO code within each family
   }
   
   export function searchOpenings(query: string): OpeningFamily[] {
     // Fuzzy search openings by name
     // Useful for the search box in the UI
   }

4. TEST: Add to the test-engine page (or create a test-openings page):
   - Load the opening book
   - Display: "Total positions in book: X"
   - For the starting position, show all book moves with weights
   - After 1.e4, show all book responses
   - After 1.e4 c5 2.Nf3, show all book responses (should include d6, Nc6, e6, etc.)
   - Test filterByOpening("Sicilian Defense: Dragon") and verify it
     only returns Dragon-related moves
   - Test chooseBookMove returns different moves on repeated calls
     (it's random, so call it 20 times and verify at least 2 different moves appear)
   
   Run the conversion script first:
   npx tsx scripts/convert-openings.ts --input /path/to/chess-openings/dist --output src/data/openings.json
   
   Then npm run dev and verify on the test page.
```

### Step 2.2 — Punishment Detection

**Paste this to your coding agent:**

```
Build the punishment detection system. This is the core novel feature.

Create src/game/punishment.ts:

import { StockfishEngine } from '@/engine/stockfish-api';
import { Chess } from 'chess.js';
import { MoveAnalysis, TrainerConfig, DEFAULT_CONFIG } from './types';

export class PunishmentDetector {
  private engine: StockfishEngine;
  private config: TrainerConfig;
  
  constructor(engine: StockfishEngine, config: TrainerConfig = DEFAULT_CONFIG) {
    this.engine = engine;
    this.config = config;
  }
  
  async analyzeMove(
    fenBefore: string,
    userMoveUci: string,
    userMoveSan: string
  ): Promise<MoveAnalysis> {
    /*
    Core logic — this is the most important function in the app:
    
    1. EVALUATE BEFORE: Get Stockfish eval of position before user's move.
       Use this.config.engineDepth for search depth.
       The score should be from the user's perspective (side to move).
    
    2. APPLY MOVE: Use chess.js to apply the user's move and get the new FEN.
    
    3. EVALUATE AFTER: Get Stockfish eval of position after user's move.
       IMPORTANT: Now it's the opponent's turn, so the score is from
       the opponent's perspective. Negate it to compare with evalBefore.
       
       evalAfter (from user's perspective) = -(raw score from Stockfish)
       because Stockfish always returns score from side-to-move perspective.
    
    4. CALCULATE DROP: evalDrop = evalBefore - evalAfter
       If evalDrop < this.config.evalThreshold: NOT a mistake. Return early.
    
    5. GET BEST MOVE: What should the user have played?
       Use engine.evaluate(fenBefore) to get the best move.
       
    6. IF MISTAKE — CHECK IF PUNISHABLE:
       Now we need to determine if this mistake leads to CONCRETE material
       loss within N moves, or if it's just a vague positional issue.
       
       a. From the position AFTER the user's bad move, get Stockfish's
          best move (this is the opponent's punishment move).
       b. Play alternating best moves for this.config.punishmentDepth
          total half-moves (plies):
          - Opponent plays best (punishing)
          - User plays best (defending)
          - Opponent plays best (continuing punishment)
          - ... for punishmentDepth plies
       c. Evaluate the final position after the punishment line.
       d. Also evaluate what the position would be if both sides just
          played best moves from the ORIGINAL (before mistake) position
          for the same number of plies. This is the "baseline".
       e. materialChange = (eval after punishment line) - (baseline eval)
          This measures how much WORSE the user is specifically because
          of their mistake, even accounting for best defense.
       f. If materialChange >= this.config.materialLossThreshold:
          IS PUNISHABLE — the mistake leads to concrete loss.
       g. If materialChange < threshold:
          NOT PUNISHABLE — it's positional, the bot should not punish.
    
    7. Return the full MoveAnalysis object.
    */
  }
  
  async getPunishmentLine(fen: string, depth: number): Promise<{
    moves: string[];      // UCI
    movesSan: string[];   // SAN
    finalEval: number;
  }> {
    /*
    Generate the "best play" sequence from the given position.
    Both sides play their best move, alternating, for `depth` plies.
    
    For each ply:
    1. Get Stockfish best move
    2. Apply it to the board (chess.js)
    3. Record the move
    4. Repeat
    
    Return the move sequence and the evaluation of the final position.
    
    Convert UCI moves to SAN using chess.js for display purposes.
    */
  }
  
  updateConfig(config: Partial<TrainerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

TEST: Create a test page or add to existing test page:

Test Case 1 — Clear blunder (SHOULD be punishable):
  FEN: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQKBNR b KQkq - 1 2"
  (after 1.e4 e5 2.Bc4 — Italian game setup)
  User plays: f7f5 (a terrible move — leaves the king diagonal wide open)
  This should be detected as punishable (Qh5+ wins material or leads to mate)
  Expected: isMistake=true, isPunishable=true, evalDrop > 200

Test Case 2 — Slight inaccuracy (should NOT be punishable):
  From starting position, play 1.e4 e5 2.Nf3 Nc6 3.Bc4
  User plays: d7d6 (passive but not losing)
  Expected: isMistake might be true (small eval drop), isPunishable=false
  (no material loss within 5 moves)

Test Case 3 — Book move (no mistake):
  From starting position, play 1.e4
  User plays: c7c5 (Sicilian — perfectly fine)
  Expected: isMistake=false, isPunishable=false, evalDrop < 20

Test Case 4 — Hanging piece:
  Set up a position where a knight is undefended and can be captured.
  User makes the move that hangs the knight.
  Expected: isMistake=true, isPunishable=true, punishment line starts with
  capturing the knight.

Display test results clearly on the page. Show:
- The FEN and user move
- eval before / after / drop
- Whether it's a mistake and whether it's punishable
- The punishment line if applicable
- Time taken for analysis

IMPORTANT: These analyses will take a few seconds each because Stockfish
needs to think. Show a loading indicator. Do NOT proceed to the next
session until these tests produce correct results.
```

---

## SESSION 3: Game Session + Minimal Playable Board

### Step 3.1 — Game Session State Machine

**Paste this to your coding agent:**

```
Create the game session manager that ties everything together into
a playable game loop.

Create src/game/session.ts:

import { Chess } from 'chess.js';
import { StockfishEngine } from '@/engine/stockfish-api';
import { OpeningBook } from '@/openings/book-manager';
import { PunishmentDetector } from './punishment';
import { GameState, MoveAnalysis, TrainerConfig, SessionStats, DEFAULT_CONFIG } from './types';

export class GameSession {
  private chess: Chess;
  private engine: StockfishEngine;
  private book: OpeningBook;
  private detector: PunishmentDetector;
  private userColor: 'w' | 'b';
  private mode: 'book' | 'punishment' | 'free_play';
  private punishmentQueue: string[];  // remaining punishment moves (UCI)
  private moveLog: GameState['moveHistory'];
  private stats: SessionStats;
  private config: TrainerConfig;
  
  constructor(params: {
    engine: StockfishEngine;
    book: OpeningBook;
    config?: TrainerConfig;
    userColor?: 'white' | 'black';
  }) {
    this.chess = new Chess();
    this.engine = params.engine;
    this.book = params.book;
    this.config = params.config || DEFAULT_CONFIG;
    this.detector = new PunishmentDetector(this.engine, this.config);
    this.userColor = params.userColor === 'black' ? 'b' : 'w';
    this.mode = 'book';
    this.punishmentQueue = [];
    this.moveLog = [];
    this.stats = { totalMoves: 0, bookMoves: 0, mistakes: 0, punishments: 0, accuracy: 100 };
  }
  
  async initialize(startMoves?: string[]): Promise<GameState> {
    /*
    Set up the game. If startMoves are provided (UCI strings),
    play them on the board to set up the starting position.
    
    If it's the bot's turn after setup, make the bot's move.
    
    Return the initial GameState.
    */
  }
  
  async makeUserMove(moveUci: string): Promise<{
    gameState: GameState;
    analysis: MoveAnalysis | null;
    botMove: { uci: string; san: string } | null;
    botReasoning: 'book' | 'punishment' | 'engine';
    coachMessage: string;
  }> {
    /*
    Process the user's move. This is the main game loop function.
    
    FLOW:
    
    1. Validate: Check move is legal using chess.js. If not, throw error.
    
    2. Record the FEN before the move.
    
    3. Apply the user's move to chess.js.
    
    4. Update stats.
    
    5. Check if game is over (checkmate, stalemate, etc.)
    
    6. Determine bot's response based on current mode:
    
       MODE: "punishment"
       - The bot is in the middle of punishing a previous mistake
       - Play the next move from this.punishmentQueue
       - If queue is empty, switch mode back to "book" or "free_play"
       - coachMessage: "Continuing punishment... [move X of Y]"
    
       MODE: "book" or "free_play"
       - Run detector.analyzeMove() on the user's move
       - IF is_punishable:
           * Switch mode to "punishment"
           * Store the punishment line in this.punishmentQueue
           * Pop the first move as bot's response
           * stats.mistakes++ and stats.punishments++
           * coachMessage: "That was a mistake! [explanation]. Watch how
             your opponent exploits it..."
       - ELSE IF is_mistake but NOT punishable:
           * stats.mistakes++
           * Don't switch mode — continue normally
           * coachMessage: "That's slightly inaccurate, but your opponent
             can't immediately exploit it. The best move was [bestMove]."
           * Choose bot move normally (book or engine)
       - ELSE (not a mistake):
           * Choose bot move:
             - If book.isInBook(currentFen): use book.chooseBookMove()
               Set mode to "book"
               coachMessage: "Good move! Following the [opening name]."
             - Else: use engine.getBestMove() at moderate depth
               Set mode to "free_play"
               coachMessage: "You're out of book now. Playing on your own!"
    
    7. Apply bot's move to chess.js.
    
    8. Check game over again.
    
    9. Update accuracy: stats.accuracy = ((stats.totalMoves - stats.mistakes) / stats.totalMoves) * 100
    
    10. Return the result.
    */
  }
  
  getState(): GameState {
    /* Return current game state for the UI */
  }
  
  getLegalMoves(): string[] {
    /* Return legal moves as UCI strings */
  }
  
  getHint(): Promise<{ uci: string; san: string }> {
    /* Return the engine's best move for the current position */
  }
  
  undoLastMove(): GameState {
    /* Undo the last full move (user move + bot response).
       Reset mode if needed. */
  }
  
  destroy(): void {
    /* Clean up engine */
  }
}

Now create the MINIMAL PLAYABLE UI.
Update src/app/page.tsx to be a working game page:

- Initialize StockfishEngine and OpeningBook on component mount
- Create a GameSession
- Render a chessboard (react-chessboard) that:
  - Shows the current position
  - Allows drag-and-drop moves
  - On drop: calls session.makeUserMove()
  - Shows the bot's response after a brief delay (feels more natural)
  - Highlights the last move
- Below the board, show:
  - Current mode (book/punishment/free_play) as colored text
  - The coach message
  - Move history as a simple text list
  - Basic stats (moves, mistakes, accuracy)
- A "New Game" button that resets the session

Keep the UI minimal for now — just functional. We'll polish in Session 4.

The board should be flipped if user is black.

TEST:
□ Board loads and shows starting position
□ You can drag a piece to make a move
□ Bot responds within 2-5 seconds
□ After 1.e4, bot plays a reasonable response
□ Mode shows "book" during opening moves
□ Playing a clearly bad move (e.g., moving your queen out early and
  losing it) triggers punishment mode
□ Coach message updates after each move
□ Stats update correctly
□ Game detects checkmate/stalemate

This is the CORE MILESTONE. Once this works, you have a playable product.
```

---

## SESSION 4: UI Polish + Opening Selector

### Step 4.1 — Full UI Design

**Paste this to your coding agent:**

```
Now polish the UI into something that looks great and is pleasant to use.

DESIGN DIRECTION: "Chess study room" aesthetic — warm, focused, slightly 
vintage feel. Think of a mahogany desk with a chess board and a leather 
notebook next to it.

COLOR PALETTE:
- Background: #1B1B2F (deep dark navy)
- Surface/panels: #232340 (slightly lighter)
- Board light squares: #E8D5B5 (warm cream/birch)
- Board dark squares: #8B6914 (rich walnut/mahogany)
- Accent/highlight: #D4A03C (warm gold)
- Success/book: #4A9E6D (muted green)
- Warning/inaccuracy: #D4A03C (amber, same as accent)
- Error/punishment: #C44536 (warm red)
- Text primary: #E8E0D4 (warm off-white)
- Text secondary: #9A9AB0 (muted lavender gray)
- Coach panel background: #1E1E38

TYPOGRAPHY:
- Import from Google Fonts:
  - "Crimson Pro" for headings and opening names (serif, scholarly)
  - "IBM Plex Mono" for move notation (monospace, clean)
  - "DM Sans" for UI text (modern sans-serif)

LAYOUT (desktop — min-width 1024px):
┌─────────────────────────────────────────────────────────────┐
│  ♔ Chess Opening Trainer          [Settings ⚙️] [New Game] │
├────────┬─────────────────────────┬──────────────────────────┤
│        │                         │  ┌─ Opening ──────────┐  │
│  EVAL  │                         │  │ Sicilian Dragon    │  │
│  BAR   │      CHESS BOARD        │  │ Mode: 📗 In Book   │  │
│        │      (takes 55%         │  └────────────────────┘  │
│ +0.3   │       of width)         │                          │
│  ██    │                         │  ┌─ Move History ─────┐  │
│  ██    │                         │  │ 1. e4    c5        │  │
│  ██    │                         │  │ 2. Nf3   d6        │  │
│  ░░    │                         │  │ 3. d4    cxd4      │  │
│  ░░    │                         │  └────────────────────┘  │
│        │                         │                          │
│        │                         │  ┌─ Coach ────────────┐  │
│        │                         │  │ 💡 Good move!       │  │
│        │                         │  │ You're following    │  │
│        │                         │  │ the main Dragon    │  │
│        │                         │  │ line. Key idea: Bg7 │  │
│        │                         │  │ fianchetto next.   │  │
│        │                         │  └────────────────────┘  │
│        │                         │                          │
│        │                         │  Accuracy: 92% | ⚡ 3/14 │
├────────┴─────────────────────────┴──────────────────────────┤
│  Punishment Depth: [━━━━●━━━] 5  |  Threshold: [━━●━━━━] 50│
└─────────────────────────────────────────────────────────────┘

MOBILE LAYOUT (below 1024px):
- Board takes full width
- Eval bar moves to horizontal below the board
- Coach panel stacks below
- Settings collapse into a drawer

COMPONENTS TO BUILD (update existing or create):

1. src/components/ChessBoard.tsx
   - Wrap react-chessboard with Chessboard component
   - Props: fen, onMove, userColor, highlightSquares, arrowsOnBoard
   - Highlight last move (from/to) with gold tint
   - Highlight mistake square with red pulse animation (CSS keyframe)
   - Show legal move indicators (small dots) when picking up a piece
   - Board orientation flips based on userColor
   - Animate pieces moving (react-chessboard supports this natively)
   - Custom piece set if possible (use the default if not easy to change)

2. src/components/EvalBar.tsx
   - Vertical bar to the left of the board
   - White portion (bottom) height = eval mapped to 0-100%
   - Clamp to range [-5, +5] pawns (so +5 or higher = 100% white)
   - Show centipawn number (e.g., "+0.3" or "-1.2")
   - Show "M3" for mate-in-3, etc.
   - Smooth CSS transition when eval changes
   - Green tint when user is better, red when worse

3. src/components/CoachPanel.tsx
   - Opening name with ECO code badge
   - Mode indicator:
     📗 "In Book" (green badge)
     📙 "Free Play" (amber badge)
     📕 "Punishment" (red badge, with a subtle pulse animation)
   - Coach message area with a subtle typewriter reveal animation
     (reveal text character by character over ~500ms)
   - When punishment triggers: show the punishment line as a 
     mini move sequence you can click through

4. src/components/MoveHistory.tsx
   - Two-column format: move number | white move | black move
   - Color-code moves based on analysis:
     Normal: default text color
     Inaccuracy: yellow/amber
     Mistake: orange
     Blunder: red
   - Highlight the current move
   - Scrollable if long
   - Monospace font (IBM Plex Mono) for alignment

5. src/components/NewGameDialog.tsx
   - Modal overlay
   - Search box for openings (type "sicilian" to filter)
   - Tree/list of opening families and variations
   - Click a variation to select it, shows the PGN and move count
   - Color picker: "Play as White" / "Play as Black" toggle
   - "Start from move" number input (default: 1)
   - Parameter sliders: punishment depth, eval threshold
   - "Start Drilling!" button (gold, prominent)

6. src/components/SettingsPanel.tsx
   - Horizontal bar at the bottom
   - Sliders for punishment_depth (1-10), eval_threshold (20-200)
   - Labels that update live as you drag
   - Changes take effect immediately on the current session

ANIMATIONS:
- Board pieces: use react-chessboard's built-in animation
- Mode change: CSS transition on the badge (color fade over 300ms)
- Coach message: typewriter effect using a custom hook that reveals
  text character by character
- Punishment trigger: red flash overlay on the board (opacity 0 -> 0.3 -> 0)
  lasting 500ms, with a subtle shake on the coaching panel
- Eval bar: CSS transition on height (500ms ease-in-out)

SOUND EFFECTS (optional but nice):
- Use Web Audio API to generate simple tones:
  - Move: short click/tap (800Hz, 50ms)
  - Capture: slightly lower thud (400Hz, 80ms)
  - Check: two quick high tones (1000Hz, 30ms x2)
  - Punishment triggered: low ominous tone (200Hz, 300ms, with fade)
  - Or download free sounds from: https://github.com/lichess-org/lila/tree/master/public/sound

TEST:
□ Board looks good on desktop (1920px wide)
□ Board looks good on laptop (1366px wide)  
□ Board looks good on tablet/mobile (375px wide)
□ Eval bar animates smoothly when eval changes
□ Mode badge changes color correctly
□ Move history colors match analysis results
□ Coach message reveals with typewriter animation
□ New game dialog opens, shows openings, and starts a game
□ Settings sliders change values and affect the session
□ Punishment trigger plays the red flash animation
```

---

## SESSION 5: Lichess Explorer + Stats + Final Polish

### Step 5.1 — Lichess Explorer (Optional Enhancement)

**Paste this to your coding agent:**

```
Add optional live data from the Lichess Opening Explorer API to make
the bot's opening choices more realistic.

Create src/openings/lichess-explorer.ts:

const LICHESS_EXPLORER_URL = 'https://explorer.lichess.ovh';

interface ExplorerMove {
  uci: string;
  san: string;
  white: number;  // white wins
  draws: number;
  black: number;  // black wins
  totalGames: number;
  averageRating: number;
  playRate: number; // percentage of games with this move
}

export class LichessExplorer {
  private cache: Map<string, ExplorerMove[]> = new Map();
  private lastRequestTime: number = 0;
  private minInterval: number = 1500; // 1.5 seconds between requests (be nice to Lichess)
  
  async getMoves(fen: string, source: 'masters' | 'lichess' = 'lichess'): Promise<ExplorerMove[]> {
    /*
    Query the Lichess Opening Explorer.
    
    Endpoints:
    - Masters: GET https://explorer.lichess.ovh/masters?fen=<FEN>
    - Lichess: GET https://explorer.lichess.ovh/lichess?fen=<FEN>&ratings=2200,2500&speeds=rapid,classical
    
    The response JSON has a "moves" array with objects containing:
    { uci, san, white, draws, black, averageRating }
    
    Add totalGames = white + draws + black
    Add playRate = totalGames / sum(all moves' totalGames)
    
    Rate limit: wait at least 1.5 seconds between requests.
    Cache results so the same position is never queried twice.
    
    Filter out moves with fewer than 20 games.
    */
  }
  
  async getAcceptableMoves(fen: string, minPlayRate: number = 0.05): Promise<ExplorerMove[]> {
    // Return only moves played at least minPlayRate of the time
  }
}

Update the OpeningBook.chooseBookMove() method:
- If a LichessExplorer instance is available, FIRST check the local book
- If local book has moves, use those (user's repertoire takes priority)
- If local book has no moves for this position, fall back to Explorer data
- This way the bot plays the user's repertoire lines when in book,
  but can also play common alternatives that aren't in the repertoire

Also update the GameSession:
- Accept an optional LichessExplorer in the constructor
- Pass it to the book manager

NOTE: Lichess Explorer requests go to an external API, so they require
internet access. The app should work fine without it (falls back to
local book only). Add a try/catch around explorer calls and degrade
gracefully if offline or rate limited.

TEST:
□ Query starting position — e4 and d4 should be top moves
□ Query after 1.e4 — c5, e5, e6, d5 etc. should appear
□ Cache works (second query for same FEN returns instantly)
□ Rate limiting works (rapid queries are spaced out)
□ App still works if Lichess API is unreachable
```

### Step 5.2 — Session Stats + Deployment

**Paste this to your coding agent:**

```
Add session statistics tracking and prepare for deployment to Vercel.

1. SESSION STATS:
   Update the stats display in the UI to show:
   - Moves played / Moves in book
   - Mistakes / Punishments triggered
   - Accuracy percentage (with a small accuracy trend sparkline if you want)
   - Current opening name and variation
   
   Stats should persist within a session (page refresh resets them).
   For cross-session persistence, use localStorage:
   
   interface StoredStats {
     sessions: Array<{
       date: string;
       opening: string;
       accuracy: number;
       mistakes: number;
       punishments: number;
       totalMoves: number;
     }>;
   }
   
   Save to localStorage after each completed game.
   Show a "History" section in the settings or a separate page
   that displays past sessions.

   NOTE: localStorage works fine because this is a client-side-only app.
   Each user's browser stores their own stats.

2. DEPLOYMENT PREPARATION:

   a. Make sure there are no server-side dependencies. Everything should
      run in the browser. The Stockfish WASM files must be in public/.
      The opening data JSON must be importable or in public/.
   
   b. Test the production build:
      npm run build
      npm run start
      Verify everything works at http://localhost:3000
   
   c. Create a vercel.json in the project root (optional, for config):
      {
        "buildCommand": "npm run build",
        "outputDirectory": ".next",
        "framework": "nextjs"
      }
   
   d. Set up the Vercel deployment:
      - Push the project to a GitHub repository
      - Go to vercel.com, click "New Project"
      - Import the GitHub repo
      - Vercel auto-detects Next.js and configures everything
      - Click "Deploy"
      - You'll get a URL like chess-opening-trainer.vercel.app
   
   e. IMPORTANT: Verify the WASM files are served correctly from Vercel.
      The public/ directory is served as static files. Check that:
      - https://your-app.vercel.app/stockfish/stockfish.js loads
      - https://your-app.vercel.app/stockfish/stockfish.wasm loads
      - The Content-Type for .wasm is application/wasm
      
      If .wasm files aren't served correctly, add to vercel.json:
      {
        "headers": [
          {
            "source": "/stockfish/(.*).wasm",
            "headers": [
              { "key": "Content-Type", "value": "application/wasm" }
            ]
          }
        ]
      }

   f. Check the opening data file size. If openings.json is over 4MB,
      consider splitting it:
      - openings-a.json, openings-b.json, ... openings-e.json
      - Load only the relevant file when the user selects an opening family
      - Or use Next.js dynamic imports

3. FINAL README.md:
   Create a README with:
   - Project name and one-line description
   - Screenshot of the UI
   - Link to the live deployment
   - "How it works" section (the 3-tier logic: book → mistake detection → punishment)
   - "Configuration" section explaining the tunable parameters
   - "Development" section (how to run locally)
   - Credits (Stockfish, Lichess, chess.js, etc.)

TEST (production):
□ npm run build succeeds without errors
□ npm run start works and app is fully functional
□ Deploy to Vercel succeeds
□ Opening the Vercel URL loads the app
□ Stockfish initializes in the browser on Vercel
□ A full game can be played on the deployed version
□ Stats persist in localStorage between sessions
□ Share the URL with a friend — verify it works on their machine
```

---

## Summary: 5 Sessions, Not 12

| Session | What You Build | End State |
|---------|---------------|-----------|
| 1 | Next.js setup + Stockfish WASM in browser | Engine evaluates positions in browser |
| 2 | Opening book + punishment detection | Core logic works (testable on test pages) |
| 3 | Game session + minimal playable board | **Playable chess trainer in browser** |
| 4 | Full UI polish + opening selector | **Looks great, fully featured** |
| 5 | Lichess Explorer + stats + Vercel deploy | **Live on the internet, shareable URL** |

## What You Need to Provide

| Item | When | Where to Get It |
|------|------|-----------------|
| Lichess chess-openings .tsv files | Session 2 | Already downloaded |
| GitHub account | Session 5 | github.com (free) |
| Vercel account | Session 5 | vercel.com (free, use GitHub login) |
| Anthropic API key | Future enhancement | console.anthropic.com (for LLM coaching) |

## What You Do NOT Need

- ~~Python~~ (everything runs in JavaScript/TypeScript)
- ~~Stockfish binary download~~ (runs as WASM in the browser)
- ~~A server~~ (Vercel hosts static files for free)
- ~~A database~~ (localStorage for stats)
- ~~FastAPI~~ (no backend needed for core features)

## Future Enhancements (After v1)

Once the core product works and is deployed:
1. **LLM Coaching**: Add a Next.js API route that proxies calls to Anthropic.
   This is the only thing that needs server-side code. Vercel serverless
   functions handle this for free (with limits).
2. **User accounts**: Add authentication (NextAuth.js) so stats persist
   across devices.
3. **Custom repertoire upload**: Let users paste or upload their own PGN.
4. **Multiplayer**: Let friends drill each other's repertoires.
5. **Mobile app**: Wrap in a PWA for app-like experience on phones.
