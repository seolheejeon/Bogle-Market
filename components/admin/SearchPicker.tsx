"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 알림 발송/배너 연결/상품·이벤트 선택 등 "검색해서 하나 고르기" UI가 반복되길래
// 만든 공용 콤보박스. 무엇을 검색하는지는 몰라도 되도록 getId/getLabel 같은
// accessor만 넘겨받는다 — 상품 목록이든 이벤트 목록이든 그대로 재사용된다.
export interface SearchPickerProps<T> {
  items: T[] | null; // null이면 로딩 중
  value: T | null;
  onChange: (item: T | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string | undefined;
  renderIcon?: (item: T) => React.ReactNode;
  placeholder?: string;
  emptyText?: string;
}

export function SearchPicker<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  getSublabel,
  renderIcon,
  placeholder = "검색...",
  emptyText = "검색 결과가 없어요.",
}: SearchPickerProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (q === "") return items;
    return items.filter((item) => getLabel(item).toLowerCase().includes(q) || getSublabel?.(item)?.toLowerCase().includes(q));
  }, [items, query, getLabel, getSublabel]);

  function pick(item: T) {
    onChange(item);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOpen(true);
  }

  return (
    <div ref={rootRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2.5 rounded-[9px] border border-accent bg-accent-soft px-3 py-2.5">
          {renderIcon?.(value)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{getLabel(value)}</p>
            {getSublabel?.(value) && <p className="truncate text-[11px] text-text-muted">{getSublabel(value)}</p>}
          </div>
          <button type="button" onClick={clear} className="shrink-0 text-[11.5px] font-semibold text-accent-dark underline">
            변경
          </button>
        </div>
      ) : (
        <input
          className="w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && !value && (
        <div className="absolute z-10 mt-1 flex max-h-56 w-full flex-col gap-1 overflow-y-auto rounded-[9px] border border-border bg-bg-card p-1.5 shadow-lg">
          {items === null && <p className="px-2 py-1.5 text-[12px] text-text-muted">불러오는 중...</p>}
          {items !== null && results.length === 0 && <p className="px-2 py-1.5 text-[12px] text-text-muted">{emptyText}</p>}
          {results.map((item) => (
            <button
              key={getId(item)}
              type="button"
              onClick={() => pick(item)}
              className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-accent-soft"
            >
              {renderIcon?.(item)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{getLabel(item)}</p>
                {getSublabel?.(item) && <p className="truncate text-[11px] text-text-muted">{getSublabel(item)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
