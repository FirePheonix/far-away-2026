import { Suspense } from "react";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardAppsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="apps" />
    </Suspense>
  );
}
