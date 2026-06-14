import { Suspense } from "react";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardRunsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="runs" />
    </Suspense>
  );
}
