import { DashboardShell } from "../dashboard-shell";
import { Suspense } from "react";

export const metadata = {
  title: "Pending Tasks | Clawvio",
};

export default function TasksPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardShell view="tasks" />
    </Suspense>
  );
}
