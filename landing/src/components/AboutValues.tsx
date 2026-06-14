import FadeIn from "./FadeIn";

const values = [
  {
    title: "Clarity First",
    description:
      "We speak plain English, not tech jargon. If you don't understand it, we haven't done our job.",
  },
  {
    title: "Results Matter",
    description:
      "We don't build cool demos. We build systems that save time, reduce costs, and drive growth.",
  },
  {
    title: "Human Centric",
    description:
      "AI should empower your team, not replace them. We design with the end-user in mind.",
  },
  {
    title: "Long-term Partners",
    description:
      "We're not just here for the setup. We stick around to ensure your systems evolve with you.",
  },
];

const AboutValues = () => {
  return (
    <div className="py-24 border-t border-brand-dark/5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24">
        <FadeIn>
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-6">
            Our <span className="italic text-brand-text/50">Values</span>
          </h2>
          <p className="text-brand-text max-w-md">
            These core principles guide every decision we make and every system
            we build.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 gap-12">
          {values.map((value, idx) => (
            <FadeIn key={idx} delay={idx * 0.1} className="group">
              <h3 className="text-xl font-medium text-brand-dark mb-2 group-hover:text-brand-text/60 transition-colors">
                {value.title}
              </h3>
              <p className="text-brand-text/70 leading-relaxed max-w-sm">
                {value.description}
              </p>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AboutValues;
