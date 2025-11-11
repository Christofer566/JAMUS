import { ReactNode } from "react";

import Sidebar from "@/components/layout/Sidebar";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[#1B1C26]">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

