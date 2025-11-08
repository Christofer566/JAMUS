'use client';

import { useEffect, useMemo, useState } from "react";

import SidebarBadge from "@/components/sidebar/SidebarBadge";
import StageProgress from "@/components/sidebar/StageProgress";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase";

type SidebarProfileProps = {
  className?: string;
};

type StageId = "Beginner" | "Mid" | "Free";

type ProfileRecord = {
  nickname: string | null;
  stage: string | null;
  stage_progress: number | null;
  has_pro_badge: boolean | null;
  has_early_bird_badge: boolean | null;
};

function mergeClassNames(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function SidebarProfile({ className }: SidebarProfileProps) {
  const { user, loading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    let isMounted = true;

    const fetchProfile = async () => {
      setProfileLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "nickname, stage, stage_progress, has_pro_badge, has_early_bird_badge",
        )
        .eq("id", user.id)
        .single();

      if (!isMounted) return;

      if (error) {
        console.error("Failed to load profile:", error);
        setProfile(null);
      } else {
        setProfile(data as ProfileRecord);
      }
      setProfileLoading(false);
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [supabase, user?.id]);

  const displayName = useMemo(() => {
    if (profile?.nickname && profile.nickname.trim()) {
      return profile.nickname.trim();
    }

    if (loading || profileLoading) {
      return "프로필 불러오는 중…";
    }

    return (
      (user?.user_metadata?.name as string | undefined)?.trim() ||
      user?.email ||
      "Guest"
    );
  }, [loading, profile?.nickname, profileLoading, user]);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const currentStage = useMemo<StageId>(() => {
    const value = profile?.stage;
    if (!value) {
      return "Beginner";
    }

    const normalized = value.toLowerCase();
    if (normalized === "beginner") return "Beginner";
    if (normalized === "mid") return "Mid";
    if (normalized === "free") return "Free";
    return "Beginner";
  }, [profile?.stage]);

  const stageProgress = useMemo(() => {
    const value = profile?.stage_progress;
    if (typeof value === "number" && !Number.isNaN(value)) {
      return Math.max(0, Math.min(value, 100));
    }
    return 0;
  }, [profile?.stage_progress]);

  const hasProBadge = Boolean(profile?.has_pro_badge);
  const hasEarlyBirdBadge = Boolean(profile?.has_early_bird_badge);

  return (
    <div
      className={mergeClassNames(
        "flex flex-col items-center gap-3 text-center transition-all duration-300 hover:[text-shadow:0_0_12px_rgba(61,223,133,0.4)]",
        className,
      )}
    >
      <div
        className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#2A2B39] text-lg font-semibold uppercase text-[#F7F8FB] transition-all duration-300 [box-shadow:0_0_20px_rgba(61,223,133,0.2)] hover:[box-shadow:0_0_32px_rgba(61,223,133,0.4)]"
      >
        <span>{initials || "JJ"}</span>
      </div>

      <div className="text-sm font-medium leading-5 text-[#F7F8FB]">
        {displayName}
      </div>

      <div className="flex items-center gap-2">
        <SidebarBadge type="pro" show={hasProBadge} />
        <SidebarBadge type="earlybird" show={hasEarlyBirdBadge} />
      </div>

      <StageProgress
        className="mt-4"
        currentStage={currentStage}
        progress={stageProgress}
      />
    </div>
  );
}

