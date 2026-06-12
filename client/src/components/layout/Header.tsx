import { Command, Server } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { StatusResponse } from "@/lib/schemas/landing";

type HeaderProps = {
  status: StatusResponse | null;
  error?: string;
};

export function Header({ status, error }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-900 text-white shadow-sm">
            <Command className="h-4 w-4" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-slate-900">
            Workspace Assistant
          </span>
        </div>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#demo" className="hover:text-slate-900 transition-colors">Live Demo</a>
            <a href="#docs" className="hover:text-slate-900 transition-colors">Documentation</a>
          </nav>
          <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">System Status</span>
          </div>
          <StatusPill status={status} error={error} />
        </div>
      </div>
    </header>
  );
}
