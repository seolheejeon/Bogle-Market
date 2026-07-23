"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

interface CountdownProps {
  targetIso: string;
  className?: string;
  format?: (targetIso: string) => string;
  urgentClassName?: string;
  urgentThresholdMs?: number;
}

export function Countdown({ targetIso, className, format = formatCountdown, urgentClassName, urgentThresholdMs = 60 * 60 * 1000 }: CountdownProps) {
  const [label, setLabel] = useState(() => format(targetIso));
  const [urgent, setUrgent] = useState(() => new Date(targetIso).getTime() - Date.now() < urgentThresholdMs);

  useEffect(() => {
    const tick = () => {
      setLabel(format(targetIso));
      setUrgent(new Date(targetIso).getTime() - Date.now() < urgentThresholdMs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso, format, urgentThresholdMs]);

  return <span className={urgent && urgentClassName ? `${className ?? ""} ${urgentClassName}`.trim() : className}>{label}</span>;
}
