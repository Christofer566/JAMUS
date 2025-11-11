import { ReactNode } from "react";

import SidebarLogo from "@/components/sidebar/SidebarLogo";
import SidebarNav from "@/components/sidebar/SidebarNav";
import SidebarProfile from "@/components/sidebar/SidebarProfile";
import SidebarFooter from "@/components/sidebar/SidebarFooter";

type SidebarProps = {
  className?: string;
  children?: ReactNode;
};

function mergeClassNames(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export default function Sidebar({ className, children }: SidebarProps) {
  return (
    <aside
      className={mergeClassNames(
        "flex h-screen w-[240px] flex-col bg-[#14151C] pt-6 px-5",
        className,
      )}
    >
      <SidebarLogo className="mb-6" />
      <SidebarProfile className="mb-10" />

      <SidebarNav className="mt-10" />

      <SidebarFooter className="mt-auto" />

      {children ? <div className="mt-6">{children}</div> : null}
    </aside>
  );
}
