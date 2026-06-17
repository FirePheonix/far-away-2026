"use client";

import { useState } from "react";
import Navbar from "./components/Navbar";
import Preloader from "./components/Preloader";
import Home from "./Home";
import Footer from "./components/Footer";

export default function LandingPage() {
  const [loading, setLoading] = useState(true);

  return (
    <>
      {loading && <Preloader onComplete={() => setLoading(false)} />}
      {!loading && (
        <div className="min-h-screen bg-brand-bg text-brand-dark font-sans selection:bg-brand-dark selection:text-white overflow-x-hidden flex flex-col">
          <Navbar />
          <main className="flex-grow w-full">
            <Home />
          </main>
          <Footer />
        </div>
      )}
    </>
  );
}
