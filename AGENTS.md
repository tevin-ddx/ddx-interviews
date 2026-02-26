# AGENTS.md

## Cursor Cloud specific instructions

**d/dx interviews** is a collaborative live interview platform built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Prisma 7 + PostgreSQL, Monaco Editor, and Framer Motion.

### Available scripts

See `package.json`. Key commands: `npm run dev`, `npm run dev:ws`, `npm run build`, `npm run lint`.

### Real-time collaboration

- A separate Yjs WebSocket server at `server/ws.mjs` runs on port 1234.
- Start it with `npm run dev:ws` alongside the Next.js dev server.
- Each interview room connects to `ws://localhost:1234/<roomId>` for CRDT-based document sync.
- Cursor presence is handled via a custom awareness protocol over the same WebSocket.

### Database

- **PostgreSQL** via Docker for local dev, Vercel Postgres for production.
- Local: `docker run -d --name ddx-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ddx -p 5432:5432 postgres:16-alpine`
- Prisma 7 uses `@prisma/adapter-pg` (standard `pg` driver). See `src/lib/db.ts`.
- After pulling: `npx prisma generate && npx prisma migrate dev`.
- Schema: `prisma/schema.prisma`. Generated client: `src/generated/prisma/` (gitignored).

### Authentication

Admin login: `admin@codestream.dev` / `admin123`. JWT sessions in HTTP-only cookies (`jose`).

### Code execution

Supports **Python** and **C++**. The `/api/execute` endpoint uses a 3-tier fallback:
1. **Docker sandbox** (primary): Custom `ddx-runner` image with Python 3.12 (pandas, numpy, torch), g++ (C++17). Build with `docker build -t ddx-runner -f docker/runner.Dockerfile .`. Requires `sudo chmod 666 /var/run/docker.sock`.
2. **Vercel Sandbox** (production): Firecracker microVMs with persistent sandbox pool per interview room.
3. **Local fallback** (dev): `python3` or `g++` via `child_process`.

### File attachments

Questions support file attachments (datasets, test inputs, reference files). Uses `@vercel/blob` when `BLOB_READ_WRITE_TOKEN` is set (Vercel deployment), otherwise stores locally in `public/uploads/`.

### Gotchas

- Docker socket permissions: run `sudo chmod 666 /var/run/docker.sock` after Docker install for the Node.js process to use Docker.
- Prisma 7 `prisma-client` generator requires a driver adapter in `new PrismaClient({ adapter })`. Zero-arg constructors won't work.
- `src/generated/prisma/` is gitignored; always run `npx prisma generate` after cloning.
- Ghost Next.js processes can hold port 3000. Use `rm -rf .next && npx next dev -p 3000` if you see port conflicts.
