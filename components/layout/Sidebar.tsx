import { ReactNode } from "react";

import SidebarLogo from "@/components/sidebar/SidebarLogo";
import SidebarNav from "@/components/sidebar/SidebarNav";
import SidebarProfile from "@/components/sidebar/SidebarProfile";
import SidebarFooter from "@/components/sidebar/SidebarFooter";
import SidebarStage from "@/components/sidebar/SidebarStage";

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
        "fixed left-0 top-0 h-screen w-[240px] bg-[#14151C] z-30",
        className,
      )}
    >
      {/* 스크롤 가능한 콘텐츠 영역 (Footer 높이만큼 하단 여백) */}
      <div className="h-full overflow-y-auto pt-4 px-5 pb-28">
        <SidebarLogo className="mb-3" />
        <SidebarProfile className="mb-4" />
        <SidebarNav className="mt-3" />
        <SidebarStage className="mt-4" />
        {children ? <div className="mt-4">{children}</div> : null}
      </div>

      {/* 하단 고정 Footer (절대 위치) */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#14151C] px-5 pb-4 pt-2">
        <SidebarFooter />
      </div>
    </aside>
  );
}
