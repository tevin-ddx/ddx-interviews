# AGENTS.md

## Cursor Cloud specific instructions

**CodeStream** is a collaborative live interview platform built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Prisma 7 + SQLite, and Monaco Editor.

### Available scripts

See `package.json` for full details. Key commands:

- `npm run dev` — starts the dev server on port 3000
- `npm run build` — creates an optimized production build
- `npm run lint` — runs ESLint (flat config in `eslint.config.mjs`)

### Database

- **Prisma 7** with SQLite via `@prisma/adapter-better-sqlite3` driver adapter.
- Schema lives in `prisma/schema.prisma`; the generated client is at `src/generated/prisma/` (gitignored).
- After pulling, run `npx prisma generate` to regenerate the client. Run `npx prisma migrate dev` to apply schema changes.
- The SQLite database is at `dev.db` in the project root (from `DATABASE_URL="file:./dev.db"` in `.env`).
- Seed the DB via `sqlite3 dev.db < prisma/seed.sql` or use the `prisma/seed.mjs` script.

### Authentication

- Admin login: `admin@codestream.dev` / `admin123`
- JWT-based sessions stored in HTTP-only cookies (`jose` library).
- The admin layout at `/admin` redirects to `/login` if no valid session.

### Code execution

- The `/api/execute` endpoint first attempts the Piston API (external, free). If that fails (network restrictions, timeout), it falls back to local `python3` execution via `child_process`.
- Local execution has a 10-second timeout. Temp files are created in `os.tmpdir()`.

### Key architecture notes

- Prisma 7 `prisma-client` generator requires a driver adapter (not zero-arg `new PrismaClient()`). See `src/lib/db.ts` for the singleton pattern with `PrismaBetterSqlite3`.
- Monaco Editor is loaded client-side only (wrapped in `"use client"` components).
- The `src/generated/prisma/` directory is gitignored; regenerate after cloning with `npx prisma generate`.
- The seed files (`prisma/seed.ts`, `prisma/seed.mjs`) are excluded from `tsconfig.json` to avoid build errors.
