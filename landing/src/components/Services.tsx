import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import assets from "../data/assets.json";

const services = [
  {
    id: "01",
    title: "Discover",
    description:
      "We analyze your workflows and identify where automation creates the most value for your business.",
    image: assets.vercel.services.discover,
  },
  {
    id: "02",
    title: "Build",
    description:
      "Our engineers design custom AI agents and integration pipelines tailored to your specific stack.",
    image: assets.vercel.services.build,
  },
  {
    id: "03",
    title: "Deploy",
    description:
      "We seamlessly integrate the solutions into your live environment with zero downtime.",
    image: assets.vercel.services.deploy,
  },
  {
    id: "04",
    title: "Optimise",
    description:
      "Continuous monitoring and refinement ensure your AI systems evolve with your business needs.",
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
          Services
        </span>
        <h2 className="text-4xl md:text-6xl font-serif text-brand-dark mb-6">
          We handle{" "}
          <span className="text-brand-text/40 italic">everything</span> so you
          don't have to.
        </h2>
        <p className="text-brand-text max-w-xl">
          From identifying opportunities to building systems and training your
          team—we manage the entire process while you focus on running your
          business.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-start">
        {/* Left Navigation */}
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

        {/* Right Content & Image */}
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
              {/* Image Card */}
              <div className="w-full h-[400px] rounded-[2rem] overflow-hidden mb-8 relative">
                <img
                  src={services[activeService].image}
                  alt={services[activeService].title}
                  className="w-full h-full object-cover"
                />
                {/* Subtle overlay for depth */}
                <div className="absolute inset-0 bg-black/5" />
              </div>

              {/* Content Below Image */}
              <div className="pl-2">
                <h3 className="text-xl font-medium text-brand-dark mb-2">
                  {services[activeService].title}
                </h3>
                <p className="text-brand-text mb-4 max-w-md">
                  {services[activeService].description}
                </p>
                <Link
                  to="/book-call"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand-dark hover:gap-3 transition-all"
                >
                  Book a free call <ArrowRight size={16} />
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
