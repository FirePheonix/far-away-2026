/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useState } from "react";
import FadeIn from "./FadeIn";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "Does Clawvio execute real actions or just suggest them?",
    answer:
      "It executes real actions through connected apps like Gmail, Calendar, Sheets, Docs, Slack, GitHub, and Notion using authenticated integrations.",
  },
  {
    question: "How does Clawvio build my personal knowledge base?",
    answer:
      "Each request, workflow step, and result is captured as structured run history so decisions and outcomes stay searchable and reusable.",
  },
  {
    question: "Can I control what data Clawvio can access?",
    answer:
      "Yes. Access is controlled by the apps and scopes you connect via OAuth, and you can revoke or reconnect integrations anytime.",
  },
  {
    question: "Will this work for both solo users and teams?",
    answer:
      "Yes. Solo users get a personal command center, while teams get shared operational memory and consistent execution across workflows.",
  },
  {
    question: "How quickly can we start seeing value?",
    answer:
      "Most teams get value in the first week by automating routine follow-ups, scheduling, and cross-tool updates through one interface.",
  },
];

const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="py-24">
      <div className="text-center mb-16">
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            FAQ
          </span>
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark">
            Everything you need to {" "}
            <span className="italic text-brand-text/50">run with Clawvio.</span>
          </h2>
          <p className="mt-6 text-brand-text max-w-md mx-auto text-sm">
            Product, security, integrations, and execution - all in one place.
          </p>
        </FadeIn>
      </div>

      <div className="max-w-3xl mx-auto">
        {faqs.map((faq, idx) => (
          <FadeIn key={idx} delay={idx * 0.05} className="mb-4">
            <button
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
              className="w-full text-left bg-[#F5F4F1] rounded-xl p-6 flex items-center justify-between hover:bg-[#EBE9E4] transition-colors"
              name="faq"
            >
              <span className="font-medium text-brand-dark">{faq.question}</span>
              <span className="text-brand-dark/50">
                {openIndex === idx ? <Minus size={20} /> : <Plus size={20} />}
              </span>
            </button>
            <AnimatePresence>
              {openIndex === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-2 text-brand-text/80 text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </FadeIn>
        ))}
      </div>
    </div>
  );
};

export default FAQSection;
