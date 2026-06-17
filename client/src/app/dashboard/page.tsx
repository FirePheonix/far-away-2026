import { Suspense } from "react";
import { DashboardShell } from "./dashboard-shell";

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="dashboard" />
    </Suspense>
  );
}
