import type { EventBadge } from "@/types";
import { EVENT_BADGE_LABEL } from "@/types";

const BADGES: EventBadge[] = ["NONE", "SALE", "HOT", "NEW", "RESERVE", "DEADLINE"];

// 이벤트 등록/수정 화면에서 공용으로 쓰는 뱃지 선택기. "특가"를 고르면
// lib/order-policy.ts의 마감 정책(STRICT_DEADLINE)에도 그대로 반영된다(별도
// 처리 없이 event.badge 하나만 보고 판단하므로) — 나머지는 순수 노출용.
export function EventBadgePicker({ value, onChange }: { value: EventBadge; onChange: (badge: EventBadge) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BADGES.map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          className={`rounded-full border px-2.5 py-1.5 text-[12px] font-semibold ${
            value === b ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
          }`}
        >
          {EVENT_BADGE_LABEL[b]}
        </button>
      ))}
    </div>
  );
}
