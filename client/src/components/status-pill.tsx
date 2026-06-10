import type { StatusResponse } from "@/lib/schemas/landing";

type StatusPillProps = {
  status: StatusResponse | null;
  error?: string;
};

export function StatusPill({ status, error }: StatusPillProps) {
  if (error) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-sm text-destructive">
        <span className="size-2 rounded-full bg-destructive" />
        Backend offline
      </div>
    );
  }

  if (!status) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
        Checking status…
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-300">
      <span className="size-2 rounded-full bg-emerald-500" />
      {status.message} · v{status.version}
    </div>
  );
}
