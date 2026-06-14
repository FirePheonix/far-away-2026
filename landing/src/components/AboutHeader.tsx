import FadeIn from "./FadeIn";

const AboutHeader = () => {
  return (
    <div className="w-full pt-32 pb-20 text-center">
      <FadeIn>
        <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
          Our Story
        </span>
        <h1 className="text-5xl md:text-7xl lg:text-[6rem] leading-[1.1] font-serif text-brand-dark tracking-tight mb-8">
          We are <span className="italic text-brand-text/40">Jane.</span>
        </h1>
        <p className="text-lg md:text-xl text-brand-text/80 max-w-2xl mx-auto leading-relaxed">
          We believe that AI shouldn't be complicated. We started Jane to help
          businesses bridge the gap between complex technology and real-world
          results.
        </p>
      </FadeIn>
    </div>
  );
};

export default AboutHeader;
