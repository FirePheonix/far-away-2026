# Far Away Japan

Monorepo with a **Next.js 16 client** and an **Express + gRPC server**.

## Quick start

```bash
npm install
npm run dev
```

| App | URL |
|-----|-----|
| Client (landing page) | http://localhost:3000 |
| Server (Express API) | http://localhost:4000/health |
| Server (gRPC) | `localhost:50051` |

Run only one side:

```bash
npm run dev:client
npm run dev:server
```

## Project layout

```
client/   → Next.js frontend (TypeScript, Zod, shadcn/ui, Tailwind)
server/   → Express HTTP API + gRPC backend
```

## Why is `node_modules` at the root?

This repo uses **npm workspaces**. Dependencies for `client` and `server` are installed once at the project root and shared between packages. That is normal — you only run `npm install` from the root, not inside each folder.

`node_modules` is gitignored and should never be committed.
