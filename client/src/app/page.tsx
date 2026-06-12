import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { DemoSection } from "@/components/home/DemoSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { fetchLandingStatus } from "@/lib/api/status";
import type { StatusResponse } from "@/lib/schemas/landing";

export default async function Home() {
  let status: StatusResponse | null = null;
  let error: string | undefined;

  try {
    status = await fetchLandingStatus();
  } catch {
    error = "Could not reach API backend";
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 selection:bg-blue-100 font-sans overflow-x-hidden">
      <Header status={status} error={error} />
      <main>
        <HeroSection />
        <DemoSection />
        <FeaturesSection />
      </main>
      <Footer />
    </div>
  );
}
