"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/release-lock";

interface ReleaseCountdownProps {
  until: number;
  onExpire?: () => void;
}

export function ReleaseCountdown({ until, onExpire }: ReleaseCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remain = Math.max(0, until - now);

  useEffect(() => {
    if (remain <= 0) onExpire?.();
  }, [remain, onExpire]);

  return <span suppressHydrationWarning>{formatCountdown(remain / 1000)}</span>;
}
