/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import assets from "../data/assets.json";

const services = [
  {
    id: "01",
    title: "Capture",
    description:
      "Capture requests from voice or text and preserve context from meetings, notes, and tasks in one timeline.",
    image: assets.vercel.services.discover,
  },
  {
    id: "02",
    title: "Understand",
    description:
      "Clawvio translates natural language into structured actions with clear intent, dependencies, and output.",
    image: assets.vercel.services.build,
  },
  {
    id: "03",
    title: "Execute",
    description:
      "Run workflows across Gmail, Calendar, Meet, Sheets, Docs, Slack, GitHub, and Notion from one command surface.",
    image: assets.vercel.services.deploy,
  },
  {
    id: "04",
    title: "Learn",
    description:
      "Every run becomes reusable knowledge so your personal and team knowledge base compounds over time.",
    image: assets.vercel.services.optimise,
  },
];

const Services = () => {
  const activeServiceState = useState(0);
  const activeService = activeServiceState[0];
  const setActiveService = activeServiceState[1];

  return (
    <div className="w-full py-24">
      <div className="flex flex-col items-center text-center mb-20">
        <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6">
          Platform
        </span>
        <h2 className="text-4xl md:text-6xl font-serif text-brand-dark mb-6">
          One conversation, {" "}
          <span className="text-brand-text/40 italic">real execution</span>{" "}
          across your stack.
        </h2>
        <p className="text-brand-text max-w-xl">
          Clawvio connects your tools, executes workflows, and keeps a living
          memory of decisions so work moves forward without context loss.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-start">
        <div className="lg:col-span-5 flex flex-col gap-2">
          {services.map((service, index) => (
            <div
              key={service.id}
              onMouseEnter={() => setActiveService(index)}
              className="group cursor-pointer py-4 relative"
            >
              <div className="flex items-baseline gap-4">
                <span
                  className={`text-5xl md:text-6xl font-serif transition-colors duration-500 ${
                    activeService === index
                      ? "text-brand-dark"
                      : "text-brand-text/20 group-hover:text-brand-text/40"
                  }`}
                >
                  {service.title}
                </span>
                <span
                  className={`text-sm font-medium transition-colors duration-500 ${
                    activeService === index
                      ? "text-brand-dark"
                      : "text-brand-text/20"
                  }`}
                >
                  {service.id}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-7 relative h-[500px] md:h-[600px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeService}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col"
            >
              <div className="w-full h-[400px] rounded-[2rem] overflow-hidden mb-8 relative">
                <img
                  src={services[activeService].image}
                  alt={services[activeService].title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/5" />
              </div>

              <div className="pl-2">
                <h3 className="text-xl font-medium text-brand-dark mb-2">
                  {services[activeService].title}
                </h3>
                <p className="text-brand-text mb-4 max-w-md">
                  {services[activeService].description}
                </p>
                <Link
                  href="/book-call"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand-dark hover:gap-3 transition-all"
                >
                  See it in your workflow <ArrowRight size={16} />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Services;
