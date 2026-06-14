import { useState } from "react";
import FadeIn from "./FadeIn";
import { Plus, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const faqs = [
  {
    question: "Do I need technical knowledge to work with you?",
    answer:
      "Not at all. We handle all the technical aspects. You just need to know your business goals.",
  },
  {
    question: "How long does it take to see results?",
    answer:
      "Typically, our clients start seeing measurable time savings within 2-4 weeks of implementation.",
  },
  {
    question: "What if the automation doesn't work for my business?",
    answer:
      "We start with a discovery phase to ensure viability. If we can't help, we'll tell you upfront.",
  },
  {
    question: "How much does it cost?",
    answer:
      "We offer project-based pricing tailored to your specific needs, starting with a clear ROI calculation.",
  },
  {
    question: "What happens after implementation?",
    answer:
      "We provide ongoing support and optimization to ensure your systems grow with your business.",
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
            Your questions{" "}
            <span className="italic text-brand-text/50">answered.</span>
          </h2>
          <p className="mt-6 text-brand-text max-w-md mx-auto text-sm">
            Everything you need to know about working with us. Still have
            questions? Book a free call and we'll walk you through it.
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
              <span className="font-medium text-brand-dark">
                {faq.question}
              </span>
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
