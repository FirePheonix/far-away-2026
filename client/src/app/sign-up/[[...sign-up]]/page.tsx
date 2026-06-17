import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-brand-bg text-brand-dark">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_440px]">
        <section>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            clawvio
          </Link>
          <h1 className="mt-12 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] md:text-7xl">
            Build your operating system powered by conversation.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-brand-text/70">
            Connect meetings, calendars, notes, tasks, and Google apps into one intelligent workflow.
          </p>
          <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-3">
            {["Meet", "Gmail", "Calendar"].map((item) => (
              <div key={item} className="rounded-lg border border-brand-dark/10 bg-white p-4">
                <p className="text-sm font-semibold">{item}</p>
                <p className="mt-1 text-xs text-brand-text/60">Ready to connect</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-brand-dark/10 bg-white p-3 shadow-[0_24px_80px_rgba(18,18,18,0.10)]">
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "shadow-none w-full",
                card: "shadow-none border-0 w-full",
                headerTitle: "text-brand-dark",
                headerSubtitle: "text-brand-text/60",
                formButtonPrimary: "bg-brand-dark hover:bg-black text-white",
              },
            }}
          />
        </section>
      </div>
    </main>
  );
}
