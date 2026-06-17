import { Suspense } from "react";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardConnectionsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="connections" />
    </Suspense>
  );
}
