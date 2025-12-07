import { ReactNode } from "react";

import Sidebar from "@/components/layout/Sidebar";
import { StageProvider } from "@/contexts/StageContext";
import { ToastProvider } from "@/contexts/ToastContext";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return (
    <StageProvider>
      <ToastProvider>
        <div className="flex min-h-screen bg-[#1B1C26]">
          <Sidebar />
          <main className="flex-1">{children}</main>
        </div>
      </ToastProvider>
    </StageProvider>
  );
}

