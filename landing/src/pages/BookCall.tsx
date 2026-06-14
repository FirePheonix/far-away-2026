import { useEffect } from "react";
import { Star, Check, ArrowRight } from "lucide-react";
import FadeIn from "../components/FadeIn";

const BookCall = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg pt-32 pb-20">
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          {/* Left Column: Value Prop */}
          <div className="lg:col-span-5 pt-8">
            <FadeIn>
              <div className="flex items-center gap-1 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={14}
                    className="fill-[#D4C5A8] text-[#D4C5A8]"
                  />
                ))}
                <span className="text-xs font-medium text-brand-text/60 ml-2">
                  Trusted by 100+ businesses
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-serif text-brand-dark mb-6 leading-[1.1]">
                Let's clarify your <br />
                <span className="italic text-brand-text/40">AI strategy.</span>
              </h1>

              <p className="text-lg text-brand-text/80 mb-12 max-w-md leading-relaxed">
                Book a free 30-minute consultation. No sales pressure, just a
                clear assessment of where automation can save you time and
                money.
              </p>

              <div className="space-y-6 mb-12">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#EBE9E4] flex items-center justify-center shrink-0">
                    <Check size={18} className="text-brand-dark" />
                  </div>
                  <div>
                    <h3 className="font-medium text-brand-dark mb-1">
                      Identify Opportunities
                    </h3>
                    <p className="text-sm text-brand-text/70 max-w-xs">
                      We'll pinpoint specific workflows that are ripe for
                      automation.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#EBE9E4] flex items-center justify-center shrink-0">
                    <Check size={18} className="text-brand-dark" />
                  </div>
                  <div>
                    <h3 className="font-medium text-brand-dark mb-1">
                      ROI Assessment
                    </h3>
                    <p className="text-sm text-brand-text/70 max-w-xs">
                      Get a rough estimate of potential time and cost savings.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#EBE9E4] flex items-center justify-center shrink-0">
                    <Check size={18} className="text-brand-dark" />
                  </div>
                  <div>
                    <h3 className="font-medium text-brand-dark mb-1">
                      Implementation Roadmap
                    </h3>
                    <p className="text-sm text-brand-text/70 max-w-xs">
                      Understand exactly what the process looks like from start
                      to finish.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-brand-dark/5 max-w-md">
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=2574&auto=compress&fit=crop"
                    alt="Marcus Chen"
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium text-brand-dark">
                      Marcus Chen
                    </p>
                    <p className="text-xs text-brand-text/60">
                      Lead Consultant
                    </p>
                  </div>
                </div>
                <p className="text-sm text-brand-text/80 italic">
                  "We don't just sell software. We build partnerships. I'm
                  looking forward to learning about your business."
                </p>
              </div>
            </FadeIn>
          </div>

          {/* Right Column: Booking Interface */}
          <div className="lg:col-span-7">
            <FadeIn
              delay={0.2}
              className="bg-white rounded-[2.5rem] shadow-xl shadow-brand-dark/5 overflow-hidden border border-brand-dark/5"
            >
              <div className="p-8 md:p-12">
                <h3 className="text-2xl font-serif text-brand-dark mb-8">
                  Select a time
                </h3>

                {/* Calendar Mockup */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Date Picker Side */}
                  <div className="bg-[#F9F8F6] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <span className="font-medium text-brand-dark">
                        March 2025
                      </span>
                      <div className="flex gap-2">
                        <button
                          className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center transition-colors"
                          name="previous-month"
                        >
                          ←
                        </button>
                        <button
                          className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center transition-colors"
                          name="next-month"
                        >
                          →
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center text-sm mb-2">
                      <span className="text-brand-text/40 text-xs">S</span>
                      <span className="text-brand-text/40 text-xs">M</span>
                      <span className="text-brand-text/40 text-xs">T</span>
                      <span className="text-brand-text/40 text-xs">W</span>
                      <span className="text-brand-text/40 text-xs">T</span>
                      <span className="text-brand-text/40 text-xs">F</span>
                      <span className="text-brand-text/40 text-xs">S</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center text-sm">
                      {/* Mock Days */}
                      {[...Array(31)].map((_, i) => (
                        <button
                          key={i}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            i === 14
                              ? "bg-brand-dark text-white"
                              : "hover:bg-white text-brand-text/80"
                          }`}
                          name="day"
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Slots Side */}
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-brand-dark mb-2">
                      Available slots for Mar 15
                    </p>
                    {["09:00 AM", "10:30 AM", "01:00 PM", "03:30 PM"].map(
                      (time, i) => (
                        <button
                          key={i}
                          className="w-full py-3 px-4 rounded-xl border border-brand-dark/10 text-brand-dark text-sm font-medium hover:border-brand-dark hover:bg-brand-bg transition-all text-left flex justify-between group"
                          name="time"
                        >
                          {time}
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            Select
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {/* Form Fields (simplified) */}
                <div className="space-y-4 border-t border-brand-dark/5 pt-8">
                  <h4 className="font-medium text-brand-dark mb-4">
                    Your Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Name"
                      className="w-full bg-[#F9F8F6] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      className="w-full bg-[#F9F8F6] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none"
                    />
                  </div>
                  <textarea
                    placeholder="Anything specific you'd like to discuss?"
                    rows={3}
                    className="w-full bg-[#F9F8F6] border-0 rounded-xl px-4 py-3 text-brand-dark focus:ring-1 focus:ring-brand-dark/20 outline-none resize-none"
                  ></textarea>

                  <button
                    className="w-full bg-brand-dark text-white font-medium py-4 rounded-full hover:bg-black transition-all flex items-center justify-center gap-2 mt-4"
                    name="confirm-booking"
                  >
                    Confirm Booking <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookCall;
