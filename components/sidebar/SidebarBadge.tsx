'use client';

import { ReactNode } from "react";

type SidebarBadgeProps = {
  type: "pro" | "earlybird";
  show?: boolean;
  className?: string;
  children?: ReactNode;
};

const BADGE_STYLES = {
  pro: {
    background: "bg-gradient-to-b from-[#F2C94C] to-[#FFD166]",
    textColor: "text-[#1A1A1A]",
    label: "Pro",
  },
  earlybird: {
    background: "bg-[#FF7B7B]",
    textColor: "text-[#1A1A1A]",
    label: "Early Bird",
  },
} as const;

function mergeClassNames(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

export default function SidebarBadge({
  type,
  show = true,
  className,
  children,
}: SidebarBadgeProps) {
  if (!show) {
    return null;
  }

  const style = BADGE_STYLES[type];

  return (
    <div className="relative inline-block">
      <span
        className={mergeClassNames(
          "inline-flex items-center rounded-full px-1 py-0.5 text-[10px] font-medium",
          style.background,
          style.textColor,
          className,
        )}
      >
        <span className="px-1.5">{children ?? style.label}</span>
      </span>

      {/* Tooltip placeholder for future implementation */}
      <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 text-xs text-white">
        <div className="rounded-md bg-black/80 px-2 py-1 shadow-lg shadow-black/40">
          준비 중입니다
        </div>
      </div>
    </div>
  );
}

