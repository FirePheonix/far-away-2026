import { Command } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 py-12">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2 text-slate-900 font-semibold">
          <Command className="h-5 w-5" />
          <span>Workspace Assistant</span>
        </div>
        <p className="text-slate-500 text-sm">© 2026 Workspace Assistant. All rights reserved.</p>
      </div>
    </footer>
  );
}
