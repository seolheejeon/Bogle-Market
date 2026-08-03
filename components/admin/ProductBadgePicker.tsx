import type { EventBadge } from "@/types";
import { EVENT_BADGE_LABEL } from "@/types";

const BADGES: EventBadge[] = ["NONE", "SALE", "HOT", "NEW", "RESERVE", "DEADLINE"];

// 상품 관리(카탈로그) 화면에서 쓰는 표시용 뱃지 선택기 — 순수 노출용 라벨이라
// 골라도 주문/마감 정책에는 아무 영향이 없다("특가"는 이벤트의 flashSale(1시간
// 특가)과는 이름만 같을 뿐 완전히 별개).
export function ProductBadgePicker({ value, onChange }: { value: EventBadge; onChange: (badge: EventBadge) => void }) {
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
