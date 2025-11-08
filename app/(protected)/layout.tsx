import { ReactNode } from "react";

import Sidebar from "@/components/layout/Sidebar";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return (
    <div className="min-h-screen bg-[#1B1C26]">
      <Sidebar />
      <main className="ml-[240px] min-h-screen">{children}</main>
    </div>
  );
}

