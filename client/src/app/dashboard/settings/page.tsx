import { Suspense } from "react";
import { DashboardShell } from "../dashboard-shell";

export default function DashboardSettingsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardShell view="settings" />
    </Suspense>
  );
}
