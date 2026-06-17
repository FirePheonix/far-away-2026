import AboutHeader from "@/landing/components/AboutHeader";
import AboutValues from "@/landing/components/AboutValues";
import FadeIn from "@/landing/components/FadeIn";
import MarketingShell from "@/landing/components/MarketingShell";

const operatingNotes = [
  "Connects Google, Slack, GitHub, Notion, and desktop workflows behind one assistant.",
  "Keeps every request, run, result, and follow-up task tied to the user who asked for it.",
  "Turns recurring manual work into reviewable workflows without hiding the execution trail.",
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8">
        <AboutHeader />

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-24">
          <FadeIn className="lg:col-span-5">
            <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
              What we build
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-6">
              AI that works inside the tools your team already uses.
            </h2>
          </FadeIn>

          <div className="lg:col-span-7 grid grid-cols-1 gap-4">
            {operatingNotes.map((note, index) => (
              <FadeIn
                key={note}
                delay={index * 0.08}
                className="bg-[#F2F0ED] rounded-2xl p-6 md:p-8"
              >
                <p className="text-brand-text/80 leading-relaxed">{note}</p>
              </FadeIn>
            ))}
          </div>
        </section>

        <AboutValues />
      </div>
    </MarketingShell>
  );
}
