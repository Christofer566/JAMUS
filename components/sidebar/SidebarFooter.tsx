'use client';

import { useCallback } from "react";
import { LogOut, Settings } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";

type SidebarFooterProps = {
  className?: string;
};

function mergeClassNames(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

export default function SidebarFooter({ className }: SidebarFooterProps) {
  const { signOut, loading } = useAuth();

  const handleSettings = useCallback(() => {
    alert("준비 중입니다");
  }, []);

  const handleLogout = useCallback(() => {
    if (loading) return;
    signOut();
  }, [loading, signOut]);

  return (
    <div className={mergeClassNames("space-y-2", className)}>
      <button
        type="button"
        onClick={handleSettings}
        className="flex h-9 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium text-[#A0A0A0] transition-all duration-300 hover:bg-[#1E1F2B]/60 hover:text-[#F7F8FB] hover:shadow-[0_0_8px_#3DDF85]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E1F2B]/40 text-[#F7F8FB]">
          <Settings className="h-4 w-4" strokeWidth={2} />
        </span>
        Settings
      </button>

      <button
        type="button"
        onClick={handleLogout}
        className="flex h-9 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium text-[#A0A0A0] transition-all duration-300 hover:bg-[#1E1F2B]/60 hover:text-[#F7F8FB] hover:shadow-[0_0_8px_#3DDF85]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E1F2B]/40 text-[#F7F8FB]">
          <LogOut className="h-4 w-4" strokeWidth={2} />
        </span>
        Logout
      </button>
    </div>
  );
}

