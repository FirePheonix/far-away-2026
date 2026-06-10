import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { fetchLandingStatus } from "@/lib/api/status";

export default async function Home() {
  let status = null;
  let error: string | undefined;

  try {
    status = await fetchLandingStatus();
  } catch {
    error = "Could not reach API backend";
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.92_0.04_250),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,oklch(0.28_0.06_250),transparent_55%)]" />

      <main className="relative mx-auto flex min-h-full max-w-5xl flex-col px-6 py-16 sm:px-10 sm:py-24">
        <header className="mb-16 flex items-center justify-between">
          <span className="text-sm font-medium tracking-wide text-muted-foreground">
            Far Away Japan
          </span>
          <StatusPill status={status} error={error} />
        </header>

        <section className="flex flex-1 flex-col justify-center gap-8">
          <div className="max-w-2xl space-y-6">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Next.js 16 · Express · gRPC
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Build something fast. Ship something beautiful.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              A full-stack starter with TypeScript, Zod validation, shadcn/ui,
              and a high-performance gRPC backend. Database coming soon.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button render={<Link href="#stack" />} nativeButton={false} size="lg">
              Explore the stack
            </Button>
            <Button
              render={
                <a
                  href="http://localhost:4000/health"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
              variant="outline"
              size="lg"
            >
              Express health check
            </Button>
          </div>
        </section>

        <section id="stack" className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Next.js 16",
              body: "App Router, React 19, Turbopack, and server-side API calls.",
            },
            {
              title: "Express API",
              body: "REST health endpoint on port 4000 while gRPC runs on 50051.",
            },
            {
              title: "Zod + shadcn",
              body: "Validated contracts on both ends and polished UI primitives.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border bg-card/60 p-5 backdrop-blur-sm"
            >
              <h2 className="mb-2 font-medium">{item.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
