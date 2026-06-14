import assets from "./assets.json";

export interface CaseStudy {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  logoText: string;
  stats: {
    value: string;
    label: string;
  }[];
}

export interface NewsItem {
  id: string;
  title: string;
  category: string;
  date: string;
  description: string;
  image: string;
}
export const caseStudies: CaseStudy[] = [
  {
    id: "hamilton",
    title: "Hamilton",
    category: "Ecommerce",
    description:
      "A fast-growing e-commerce business specializing in home goods and lifestyle products.",
    image: assets.vercel.case_studies.hamilton,
    logoText: "Hamilton",
    stats: [
      { value: "55%", label: "Reduction in food waste" },
      { value: "90%", label: "On-time delivery rate" },
      { value: "35 days", label: "To full deployment" },
    ],
  },
  {
    id: "terra",
    title: "Terra",
    category: "Food & Beverage",
    description:
      "A sustainable food company delivering organic meal kits to health-conscious customers nationwide.",
    image: assets.vercel.case_studies.terra,
    logoText: "Terra",
    stats: [
      { value: "40%", label: "Increase in efficiency" },
      { value: "24/7", label: "Support coverage" },
      { value: "2 weeks", label: "Implementation time" },
    ],
  },
  {
    id: "savannah",
    title: "Savannah",
    category: "Marketing",
    description:
      "A boutique marketing agency helping small businesses build their digital presence and grow online.",
    image: assets.vercel.case_studies.savannah,
    logoText: "SAVANNAH",
    stats: [
      { value: "3x", label: "Lead generation" },
      { value: "60%", label: "Cost reduction" },
      { value: "100+", label: "Campaigns automated" },
    ],
  },
  {
    id: "snowflake",
    title: "Snowflake",
    category: "Software",
    description:
      "A SaaS company providing project management tools for remote teams across multiple industries.",
    image: assets.vercel.case_studies.snowflake,
    logoText: "Snowflake",
    stats: [
      { value: "85%", label: "Customer satisfaction" },
      { value: "0", label: "Downtime during migration" },
      { value: "1200+", label: "Hours saved monthly" },
    ],
  },
];

export const newsItems: NewsItem[] = [
  {
    id: "ai-trends-2025",
    title: "The Future of AI in 2025",
    category: "Industry Insights",
    date: "March 15, 2025",
    description:
      "Exploring the top trends that will define the next generation of artificial intelligence in business.",
    image: assets.unsplash.news.ai_trends_2025,
  },
  {
    id: "jane-expansion",
    title: "Jane Expands to Europe",
    category: "Company News",
    date: "February 28, 2025",
    description:
      "We are thrilled to announce our new headquarters in London to better serve our global clients.",
    image: assets.unsplash.news.jane_expansion,
  },
  {
    id: "automation-guide",
    title: "A Guide to Ethical Automation",
    category: "Thought Leadership",
    date: "January 10, 2025",
    description:
      "How to implement AI systems that respect privacy, transparency, and human agency.",
    image: assets.unsplash.news.automation_guide,
  },
  {
    id: "series-a-funding",
    title: "Securing Our Series A",
    category: "Milestones",
    date: "December 05, 2024",
    description:
      "Jane raises $15M to accelerate the development of our proprietary AI integration platform.",
    image: assets.unsplash.news.series_a_funding,
  },
];
