"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

export function Countdown({ targetIso, className }: { targetIso: string; className?: string }) {
  const [label, setLabel] = useState(() => formatCountdown(targetIso));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatCountdown(targetIso)), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return <span className={className}>{label}</span>;
}
