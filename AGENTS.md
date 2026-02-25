# AGENTS.md

## Cursor Cloud specific instructions

This is a **Next.js 16** (App Router) application using TypeScript, Tailwind CSS v4, and ESLint. It is a single-service app with no database or external API dependencies at this time.

### Available scripts

See `package.json` and `README.md` for full details. Key commands:

- `npm run dev` — starts the dev server on port 3000
- `npm run build` — creates an optimized production build
- `npm run lint` — runs ESLint (flat config in `eslint.config.mjs`)

### Environment variables

Copy `.env.example` to `.env.local` before running. Currently all variables are optional/commented out.

### Notes

- The dev server (Turbopack) runs on **port 3000** by default.
- There are no automated tests configured yet (no test framework or test scripts in `package.json`).
- No Docker, database, or external services are required to run the app locally.
