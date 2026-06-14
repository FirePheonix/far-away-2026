/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { motion } from "framer-motion";
import IntroLogos from "./IntroLogos";

const IntroVisual = () => {
  const cards = [
    {
      id: 1,
      video: "/1.mp4",
      title: "Clawvio captures context, not just notes.",
      description:
        "From client calls to internal standups, clawvio turns raw conversation into clear, usable context.",
    },
    {
      id: 2,
      video: "/2.mp4",
      title: "Every conversation becomes clear next steps.",
      description:
        "clawvio extracts owners, deadlines, and priorities so your team always knows what to do next.",
    },
    {
      id: 3,
      video: "/3.mp4",
      title: "Move from insights to execution faster.",
      description:
        "clawvio connects ideas to real workflows so decisions turn into shipped outcomes, not forgotten threads.",
    },
  ];

  return (
    <div className="w-full space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[1180px] mx-auto relative aspect-[16/9] rounded-[2.5rem] overflow-hidden border border-black/10 shadow-[0_20px_50px_rgba(22,18,11,0.18)]"
      >
        <div className="relative w-full h-full bg-[#0f0f0f] border border-white/20">
          <video
            src="/hero-vid.mp4"
            className="w-full h-full object-cover object-center"
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-black/10" />
        </div>
      </motion.div>

      {/* <IntroLogos /> */}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="w-full grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {cards.map((card) => (
          <article
            key={card.id}
            className="bg-[#efefef] rounded-2xl px-8 pt-8 pb-10 min-h-[540px] flex flex-col items-center text-center"
          >
            <div className="w-full max-w-[380px] h-[290px] rounded-xl overflow-hidden mb-10">
              <video
                src={card.video}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>

            <h3 className="text-[42px] leading-[1.05] font-semibold text-black mb-6 tracking-[-0.02em]">
              {card.title}
            </h3>

            <p className="text-[18px] leading-[1.25] text-[#6f7780] max-w-[360px]">
              {card.description}
            </p>
          </article>
        ))}
      </motion.div>
    </div>
  );
};

export default IntroVisual;
