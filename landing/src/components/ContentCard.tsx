import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import FadeIn from "./FadeIn";

interface ContentCardProps {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  logoText?: string; // Optional, for case studies
  basePath: string;
  index: number;
}

const ContentCard: React.FC<ContentCardProps> = ({
  id,
  title,
  category,
  description,
  image,
  logoText,
  basePath,
  index,
}) => {
  return (
    <FadeIn delay={index * 0.1} className="group flex flex-col gap-6">
      {/* Image Card */}
      <Link to={`${basePath}/${id}`} className="block w-full">
        <div className="relative w-full aspect-[16/10] rounded-[2rem] overflow-hidden bg-gray-100">
          <img
            src={image}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {/* Overlay for Logo (Case Studies) */}
          {logoText && (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
              <span className="text-white font-serif text-3xl md:text-4xl font-medium tracking-tight drop-shadow-md">
                {logoText === "Hamilton" && "*"} {logoText}
              </span>
            </div>
          )}

          {/* Category Tag */}
          <div className="absolute top-6 right-6">
            <span className="bg-white/90 backdrop-blur-sm text-brand-dark text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full">
              {category}
            </span>
          </div>
        </div>
      </Link>

      {/* Text Content */}
      <div className="bg-[#F9F8F6] rounded-2xl p-6 md:p-8 flex items-end justify-between gap-4 group-hover:bg-[#F2F0ED] transition-colors duration-300">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-medium text-brand-dark">{title}</h3>
          <p className="text-brand-text/70 text-sm leading-relaxed max-w-sm">
            {description}
          </p>
        </div>

        <Link
          to={`${basePath}/${id}`}
          className="w-10 h-10 rounded-full bg-brand-dark text-white flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
        >
          <ArrowRight size={16} />
        </Link>
      </div>
    </FadeIn>
  );
};

export default ContentCard;
