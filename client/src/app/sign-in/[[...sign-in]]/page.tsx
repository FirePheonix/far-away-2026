import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-brand-bg text-brand-dark">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_440px]">
        <section>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            clawvio
          </Link>
          <h1 className="mt-12 max-w-2xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] md:text-7xl">
            Return to your conversation workspace.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-brand-text/70">
            Review runs, connected apps, contacts, and the memory Clawvio is building for your workflows.
          </p>
        </section>

        <section className="rounded-2xl border border-brand-dark/10 bg-white p-3 shadow-[0_24px_80px_rgba(18,18,18,0.10)]">
          <SignIn
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
