'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Music, Search } from "lucide-react";

type SidebarNavProps = {
  className?: string;
};

const NAV_ITEMS = [
  { label: "Feed", href: "/", icon: Home },
  { label: "JAMUS", href: "/jamus", icon: Music },
  { label: "My JAM", href: "/my-jam", icon: Heart },
  { label: "Discover", href: "/discover", icon: Search },
] as const;

function mergeClassNames(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SidebarNav({ className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className={mergeClassNames("space-y-3", className)}>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname || '', item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={mergeClassNames(
              "relative flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium shadow-none transition-all duration-300",
              active
                ? "bg-[#1E1F2B] text-[#F7F8FB]"
                : "text-[#A0A0A0] hover:bg-[#1E1F2B]/60 hover:text-[#F7F8FB] hover:shadow-[0_0_8px_#3DDF85]",
            )}
          >
            <span
              className={mergeClassNames(
                "absolute -left-5 h-9 w-1 rounded-full bg-[#5B8DEF] transition-opacity duration-300",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

