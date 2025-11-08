import Link from "next/link";

type SidebarLogoProps = {
  className?: string;
};

export default function SidebarLogo({ className }: SidebarLogoProps) {
  return (
    <Link
      href="/"
      className={[
        "inline-flex items-center justify-center text-[28px] font-bold text-[#F7F8FB]",
        "transition-all duration-300",
        "hover:[text-shadow:0_0_20px_#3DDF85]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ fontFamily: "Inter, sans-serif" }}
      aria-label="JAMUS 홈으로 이동"
    >
      JAMUS
    </Link>
  );
}

