# Far Away Japan

A small monorepo with a Next.js client and an Express + gRPC server.

## Getting Started

Install dependencies from the project root:

```bash
npm install
```

Run both apps together:

```bash
npm run dev
```

Run one side at a time:

```bash
npm run dev:client
npm run dev:server
```

## Available Scripts

- `npm run dev` - starts the client and server together
- `npm run dev:client` - starts the Next.js app
- `npm run dev:server` - starts the API and gRPC server
- `npm run build` - builds both workspaces

## Project Structure

- `client/` - Next.js frontend
- `server/` - Express HTTP API and gRPC backend

## Notes

This repository uses npm workspaces, so dependencies are installed once at the root and shared by both packages.
