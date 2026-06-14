import FadeIn from "./FadeIn";
import assets from "../data/assets.json";

const team = [
  {
    name: "Marcus Chen",
    role: "Lead AI Consultant",
    image: assets.vercel.team.marcus,
  },
  {
    name: "Amira Hassan",
    role: "Automation Specialist",
    image: assets.vercel.team.amira,
  },
  {
    name: "David Park",
    role: "Implementation Engineer",
    image: assets.vercel.team.david,
  },
  {
    name: "Elena Martinez",
    role: "Client Success Manager",
    image: assets.vercel.team.elena,
  },
];

const TeamSection = () => {
  return (
    <div className="py-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
        <FadeIn>
          <span className="bg-[#EBE9E4] text-brand-dark text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wide mb-6 inline-block">
            Meet the team
          </span>
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark">
            You're in{" "}
            <span className="italic text-brand-text/50">experienced</span>{" "}
            hands.
          </h2>
        </FadeIn>
        <FadeIn delay={0.1} className="max-w-xs text-sm text-brand-text/70">
          No layers of management. You work directly with the specialists who
          understand your business and build your automation from start to
          finish.
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {team.map((member, idx) => (
          <FadeIn
            key={idx}
            delay={idx * 0.1}
            className="group relative aspect-[3/4] rounded-2xl overflow-hidden"
          >
            <img
              src={member.image}
              alt={member.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 scale-110 group-hover:scale-125"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />

            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <h3 className="text-lg font-medium">{member.name}</h3>
              <p className="text-xs text-white/70">{member.role}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
};

export default TeamSection;
