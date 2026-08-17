# Vendored Stockfish

`stockfish.js` and `stockfish.wasm` in this directory are a prebuilt WebAssembly
distribution of [Stockfish](https://github.com/official-stockfish/Stockfish)
(from the [`stockfish`](https://www.npmjs.com/package/stockfish) npm package,
version 18.0.5). They are served as static assets and loaded by the engine
worker at `src/engine/stockfish-worker.ts`.

Stockfish is free software licensed under the **GNU General Public License
version 3**. The full license text is in [COPYING.txt](./COPYING.txt).

These files are unmodified redistributions. Stockfish source is available at
https://github.com/official-stockfish/Stockfish.

The GPL applies to these vendored Stockfish files. It does not extend to the
rest of this repository, which merely loads the engine as a separate program via
the UCI protocol over a worker message channel.
