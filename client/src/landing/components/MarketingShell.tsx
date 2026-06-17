"use client";

import type { ReactNode } from "react";
import Footer from "./Footer";
import Navbar from "./Navbar";

interface MarketingShellProps {
  children: ReactNode;
}

export default function MarketingShell({ children }: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-dark font-sans selection:bg-brand-dark selection:text-white overflow-x-hidden flex flex-col">
      <Navbar />
      <main className="flex-grow w-full pt-32">{children}</main>
      <Footer />
    </div>
  );
}
