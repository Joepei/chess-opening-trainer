This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Grounded LLM explanations

Mistake explanations use `gpt-5.6-sol` with low reasoning effort as an optional
server-side writing layer. Opening-book results, Stockfish evaluation and PV,
material loss, and the existing heuristics remain the source of truth. The model
does not receive a FEN and cannot replace the deterministic verdict or moves.

Put an OpenAI API key in an untracked `secret.txt` at the project root, either as
the raw key, `OPENAI_API_KEY=<key>`, or `openai-key: "<key>"`, then run the app
normally. The API route reads this file only on the server. Production deployments
may instead provide the `OPENAI_API_KEY` environment variable because `secret.txt`
is intentionally excluded from Git.

If the explanation request fails or its output does not pass grounding checks,
the trainer keeps the existing deterministic explanation.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.


## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
