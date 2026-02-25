# DDX Interviews

A [Next.js](https://nextjs.org) application bootstrapped with `create-next-app`, deployed on [Vercel](https://vercel.com).

**Live URL:** [https://ddx-interviews.vercel.app](https://ddx-interviews.vercel.app)

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ (v20 LTS recommended)
- [npm](https://www.npmjs.com/) v9+
- [Vercel CLI](https://vercel.com/docs/cli) (for deployments)

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd ddx-interviews
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in any required values. The `.env.example` file documents all available variables.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### 5. Build for production

```bash
npm run build
npm run start
```

## Project Structure

```
src/
  app/
    layout.tsx    # Root layout (HTML shell, fonts, global CSS)
    page.tsx      # Home page
    globals.css   # Global Tailwind CSS styles
public/           # Static assets (images, icons)
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Linting:** ESLint with next config
- **Deployment:** Vercel

## Deployment

The app is deployed to Vercel. Any push to the `main` branch will trigger a production deployment automatically once the GitHub repo is connected.

To deploy manually:

```bash
vercel          # Preview deployment
vercel --prod   # Production deployment
```

## Available Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start dev server on localhost:3000 |
| `npm run build` | Create optimized production build  |
| `npm run start` | Start production server            |
| `npm run lint`  | Run ESLint                         |
