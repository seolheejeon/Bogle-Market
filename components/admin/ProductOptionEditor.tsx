"use client";

import type { ProductOptionGroup, ProductOptionValue } from "@/types";

// 새 그룹/값도 실제 uuid를 미리 만들어서 넘긴다 — lib/data.ts의
// saveOptionGroupsForProduct가 "이 id가 이미 DB에 있으면 수정, 없으면 삽입"
// 방식(upsert)으로 저장하므로, 화면에서부터 최종 id를 들고 있어야 나중에
// 이 옵션값을 가리키는 event_option_stock 등과 계속 같은 id로 연결된다.
function makeValue(sortOrder: number): ProductOptionValue {
  return { id: crypto.randomUUID(), name: "", priceDelta: 0, hasStock: false, sortOrder };
}
function makeGroup(sortOrder: number): ProductOptionGroup {
  return { id: crypto.randomUUID(), name: "", required: true, multi: false, sortOrder, values: [makeValue(0)] };
}

// 색상/사이즈/중량/추가옵션처럼 상품마다 다른 옵션 그룹을 자유롭게 추가·삭제·
// 순서변경할 수 있는 에디터 — 상품 관리 화면(CatalogProductForm)에 붙는다.
export function ProductOptionEditor({ groups, onChange }: { groups: ProductOptionGroup[]; onChange: (groups: ProductOptionGroup[]) => void }) {
  function updateGroup(index: number, patch: Partial<ProductOptionGroup>) {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }
  function moveGroup(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= groups.length) return;
    const next = groups.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((g, i) => ({ ...g, sortOrder: i })));
  }

  function updateValue(groupIndex: number, valueIndex: number, patch: Partial<ProductOptionValue>) {
    const g = groups[groupIndex];
    updateGroup(groupIndex, { values: g.values.map((v, i) => (i === valueIndex ? { ...v, ...patch } : v)) });
  }
  function removeValue(groupIndex: number, valueIndex: number) {
    const g = groups[groupIndex];
    updateGroup(groupIndex, { values: g.values.filter((_, i) => i !== valueIndex) });
  }
  function moveValue(groupIndex: number, valueIndex: number, dir: -1 | 1) {
    const g = groups[groupIndex];
    const target = valueIndex + dir;
    if (target < 0 || target >= g.values.length) return;
    const next = g.values.slice();
    [next[valueIndex], next[target]] = [next[target], next[valueIndex]];
    updateGroup(groupIndex, { values: next.map((v, i) => ({ ...v, sortOrder: i })) });
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, gi) => (
        <div key={g.id} className="rounded-[9px] border border-border p-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            <input
              className="min-w-0 flex-1 rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px] font-semibold"
              placeholder="옵션 그룹명 (예: 색상)"
              value={g.name}
              onChange={(e) => updateGroup(gi, { name: e.target.value })}
            />
            <button type="button" onClick={() => moveGroup(gi, -1)} disabled={gi === 0} className="rounded-[6px] border border-border px-1.5 py-1 text-[11px] disabled:opacity-30">
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveGroup(gi, 1)}
              disabled={gi === groups.length - 1}
              className="rounded-[6px] border border-border px-1.5 py-1 text-[11px] disabled:opacity-30"
            >
              ↓
            </button>
            <button type="button" onClick={() => removeGroup(gi)} className="rounded-[6px] border border-border px-2 py-1 text-[11px] font-semibold text-red-600">
              그룹삭제
            </button>
          </div>
          <div className="mb-2 flex gap-3 text-[12px] font-semibold text-text-muted">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={g.required} onChange={(e) => updateGroup(gi, { required: e.target.checked })} />
              필수
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={g.multi} onChange={(e) => updateGroup(gi, { multi: e.target.checked })} />
              중복선택
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            {g.values.map((v, vi) => (
              <div key={v.id} className="flex flex-wrap items-center gap-1.5 rounded-[7px] bg-bg-sunken p-1.5">
                <input
                  className="w-24 flex-1 rounded-[6px] border border-border bg-bg-card px-2 py-1 text-[12.5px]"
                  placeholder="값 (예: 빨강)"
                  value={v.name}
                  onChange={(e) => updateValue(gi, vi, { name: e.target.value })}
                />
                <input
                  className="w-20 rounded-[6px] border border-border bg-bg-card px-2 py-1 text-[12.5px]"
                  type="number"
                  placeholder="가격조정"
                  value={v.priceDelta}
                  onChange={(e) => updateValue(gi, vi, { priceDelta: Number(e.target.value) || 0 })}
                />
                <label className="flex items-center gap-1 text-[11.5px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={v.hasStock}
                    onChange={(e) => updateValue(gi, vi, { hasStock: e.target.checked, defaultStock: e.target.checked ? (v.defaultStock ?? 0) : undefined })}
                  />
                  재고관리
                </label>
                {v.hasStock && (
                  <input
                    className="w-16 rounded-[6px] border border-border bg-bg-card px-2 py-1 text-[12.5px]"
                    type="number"
                    min={0}
                    placeholder="기본재고"
                    value={v.defaultStock ?? 0}
                    onChange={(e) => updateValue(gi, vi, { defaultStock: Math.max(0, Number(e.target.value) || 0) })}
                  />
                )}
                <button type="button" onClick={() => moveValue(gi, vi, -1)} disabled={vi === 0} className="rounded-[6px] border border-border px-1 py-0.5 text-[10px] disabled:opacity-30">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveValue(gi, vi, 1)}
                  disabled={vi === g.values.length - 1}
                  className="rounded-[6px] border border-border px-1 py-0.5 text-[10px] disabled:opacity-30"
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeValue(gi, vi)} className="rounded-[6px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateGroup(gi, { values: [...g.values, makeValue(g.values.length)] })}
              className="self-start rounded-[6px] border border-dashed border-accent px-2 py-1 text-[11.5px] font-semibold text-accent"
            >
              + 값 추가
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...groups, makeGroup(groups.length)])}
        className="self-start rounded-[8px] border border-dashed border-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent"
      >
        + 옵션 그룹 추가
      </button>
    </div>
  );
}
