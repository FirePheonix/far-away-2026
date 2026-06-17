/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React from "react";
import FadeIn from "./FadeIn";
import { ArrowUpRight } from "lucide-react";
import assets from "../data/assets.json";

const ContactSection = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Thanks. We received your request and will get back to you soon.");
  };

  return (
    <div className="py-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <FadeIn className="lg:col-span-5 relative min-h-[500px] rounded-[2.5rem] overflow-hidden p-8 flex flex-col justify-end">
          <img
            src={assets.vercel.sections.contact_bg}
            alt="Contact Background"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          <div className="relative z-10 text-white">
            <h2 className="text-4xl font-serif mb-4 leading-tight">
              Build your conversation OS.
            </h2>
            <p className="text-sm opacity-80 mb-8 max-w-xs">
              Tell us your workflow and we will help you launch Clawvio with
              the right integrations, automations, and run visibility.
            </p>

            <div className="flex items-center gap-6 text-xs font-medium uppercase tracking-widest opacity-60">
              <span>Clawvio</span>
              <span>Conversation-first</span>
              <span>Execution-ready</span>
            </div>
          </div>
        </FadeIn>

        <FadeIn
          delay={0.2}
          className="lg:col-span-7 bg-[#F2F0ED] rounded-[2.5rem] p-8 md:p-12 flex flex-col justify-center"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-medium text-brand-dark uppercase tracking-wide ml-2">
                  Name*
                </label>
                <input
                  required
                  type="text"
                  className="w-full bg-[#E5E2DC] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-brand-dark uppercase tracking-wide ml-2">
                  Email*
                </label>
                <input
                  required
                  type="email"
                  className="w-full bg-[#E5E2DC] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-medium text-brand-dark uppercase tracking-wide ml-2">
                What do you want to enable first?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Voice-to-action",
                  "Google Workspace automation",
                  "Task + notes orchestration",
                  "Team run tracking",
                  "Knowledge base growth",
                  "All of the above",
                ].map((opt, i) => (
                  <label key={i} className="cursor-pointer">
                    <input type="checkbox" className="peer sr-only" />
                    <span className="block text-xs font-medium px-4 py-2 rounded-full border border-brand-dark/10 text-brand-text/60 peer-checked:bg-brand-dark peer-checked:text-white transition-all hover:bg-white">
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-medium text-brand-dark uppercase tracking-wide ml-2">
                Current blocker
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Too many disconnected tools",
                  "Manual follow-up workload",
                  "No reliable execution layer",
                  "Knowledge scattered everywhere",
                ].map((opt, i) => (
                  <label key={i} className="cursor-pointer">
                    <input
                      type="radio"
                      name="challenge"
                      className="peer sr-only"
                    />
                    <span className="block text-xs font-medium px-4 py-2 rounded-full border border-brand-dark/10 text-brand-text/60 peer-checked:bg-brand-dark peer-checked:text-white transition-all hover:bg-white">
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                placeholder="Share your workflow and tools..."
                rows={4}
                className="w-full bg-[#E5E2DC] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none transition-all resize-none placeholder:text-brand-text/40"
              ></textarea>
            </div>

            <button
              type="submit"
              className="w-full bg-brand-dark text-white font-medium py-4 rounded-full hover:bg-black transition-transform hover:scale-[1.01] active:scale-[0.99] duration-300 flex items-center justify-center gap-2"
              name="book-call"
            >
              Request onboarding <ArrowUpRight size={16} />
            </button>

            <p className="text-[10px] text-center text-brand-text/40">
              By submitting, you agree to our terms of service.
            </p>
          </form>
        </FadeIn>
      </div>
    </div>
  );
};

export default ContactSection;
