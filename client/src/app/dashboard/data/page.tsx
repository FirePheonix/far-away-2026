import { Suspense } from "react";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardDataPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="data" />
    </Suspense>
  );
}
