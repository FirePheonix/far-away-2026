import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome to Workspace Assistant
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is ready. Next step is connecting Google Workspace from the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
