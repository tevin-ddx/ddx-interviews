# AGENTS.md

## Cursor Cloud specific instructions

**CodeStream** is a collaborative live interview platform built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Prisma 7 + PostgreSQL, Monaco Editor, and Framer Motion.

### Available scripts

See `package.json`. Key commands: `npm run dev`, `npm run build`, `npm run lint`.

### Database

- **PostgreSQL** via Docker for local dev, Vercel Postgres for production.
- Local: `docker run -d --name codestream-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=codestream -p 5432:5432 postgres:16-alpine`
- Prisma 7 uses `@prisma/adapter-pg` (standard `pg` driver). See `src/lib/db.ts`.
- After pulling: `npx prisma generate && npx prisma migrate dev`.
- Schema: `prisma/schema.prisma`. Generated client: `src/generated/prisma/` (gitignored).

### Authentication

Admin login: `admin@codestream.dev` / `admin123`. JWT sessions in HTTP-only cookies (`jose`).

### Code execution

The `/api/execute` endpoint uses a 3-tier fallback:
1. **Docker sandbox** (primary): `python:3.12-alpine` with `--network none`, memory/CPU limits. Requires Docker and `sudo chmod 666 /var/run/docker.sock`.
2. **Piston API** (fallback for Vercel): Free external API at `emkc.org`.
3. **Local Python** (last resort): Direct `python3` via `child_process`.

### Gotchas

- Docker socket permissions: run `sudo chmod 666 /var/run/docker.sock` after Docker install for the Node.js process to use Docker.
- Prisma 7 `prisma-client` generator requires a driver adapter in `new PrismaClient({ adapter })`. Zero-arg constructors won't work.
- `src/generated/prisma/` is gitignored; always run `npx prisma generate` after cloning.
- Ghost Next.js processes can hold port 3000. Use `rm -rf .next && npx next dev -p 3000` if you see port conflicts.
