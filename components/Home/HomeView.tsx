"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { listEvents } from "@/lib/data";
import type { EventType, MarketEvent } from "@/types";
import { EVENT_TYPE_LABEL } from "@/types";
import { formatCountdownShort, formatDeadlineShort, formatPrice } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { ProductGridCard } from "@/components/ProductGridCard";
import { ProductPhoto } from "@/components/ProductPhoto";

function nearestOfType(events: MarketEvent[], type: EventType) {
  return events
    .filter((e) => e.type === type)
    .slice()
    .sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime())[0];
}

export function HomeView() {
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  const flash = events?.find((e) => e.isFlash);
  const door = events ? nearestOfType(events, "DOOR") : undefined;
  const group = events ? nearestOfType(events, "GROUP_BUY") : undefined;

  const heroSlides = useMemo(() => {
    const slides: { key: string; eyebrow: string; badge: string; eventId: string; product: MarketEvent["products"][number] }[] = [];
    if (flash?.products[0]) slides.push({ key: "flash", eyebrow: "지금 특가로 만나보세요", badge: "🔥 1시간 특가", eventId: flash.id, product: flash.products[0] });
    if (door?.products[0]) slides.push({ key: "door", eyebrow: "집에서 즐기는 신선한 한 끼", badge: "이번 회차 PICK", eventId: door.id, product: door.products[0] });
    if (group?.products[0]) slides.push({ key: "group", eyebrow: "현지에서 직접 사다드려요", badge: group.title, eventId: group.id, product: group.products[0] });
    return slides;
  }, [flash, door, group]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    // Depending on heroIndex (not just heroSlides.length) restarts this timer
    // whenever the slide changes for any reason — auto tick, dot click, or a
    // manual swipe/drag — so the next auto-advance always waits a full
    // interval from the last change instead of firing early.
    const id = setInterval(() => setHeroIndex((i) => (i + 1) % heroSlides.length), 4500);
    return () => clearInterval(id);
  }, [heroSlides.length, heroIndex]);

  const deadlineItems = useMemo(() => {
    const items: { badgeType: EventType; eventId: string; product: MarketEvent["products"][number]; deadlineAt: string }[] = [];
    if (door?.products[0]) items.push({ badgeType: "DOOR", eventId: door.id, product: door.products[0], deadlineAt: door.deadlineAt });
    if (group?.products[0]) items.push({ badgeType: "GROUP_BUY", eventId: group.id, product: group.products[0], deadlineAt: group.deadlineAt });
    if (flash?.products[0]) items.push({ badgeType: flash.type, eventId: flash.id, product: flash.products[0], deadlineAt: flash.deadlineAt });
    return items.sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
  }, [door, group, flash]);

  const popular = useMemo(() => {
    if (!events) return [];
    return events.flatMap((e) => e.products).slice(0, 4);
  }, [events]);

  // Pointer Events unify mobile touch swipe and desktop mouse drag in one
  // handler set. `moved` distinguishes a drag from a tap so the hero's Link
  // navigation only fires on an actual tap/click.
  const heroDrag = useRef({ startX: 0, startY: 0, dragging: false, moved: false });

  function goToHero(next: number) {
    const len = heroSlides.length;
    setHeroIndex(((next % len) + len) % len);
  }

  function handleHeroPointerDown(e: React.PointerEvent<HTMLElement>) {
    heroDrag.current = { startX: e.clientX, startY: e.clientY, dragging: true, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleHeroPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = heroDrag.current;
    if (!drag.dragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) drag.moved = true;
  }

  function handleHeroPointerUp(e: React.PointerEvent<HTMLElement>) {
    const drag = heroDrag.current;
    if (!drag.dragging) return;
    drag.dragging = false;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      drag.moved = true;
      goToHero(heroIndex + (dx < 0 ? 1 : -1));
    }
  }

  function handleHeroClick(e: React.MouseEvent) {
    if (heroDrag.current.moved) e.preventDefault();
  }

  if (!events) {
    return <div className="p-4 text-sm text-text-muted">불러오는 중...</div>;
  }

  return (
    <div className="p-4">
      {heroSlides.length > 0 && (
        <Link
          href={`/product/${heroSlides[heroIndex].product.id}`}
          onClick={handleHeroClick}
          onPointerDown={handleHeroPointerDown}
          onPointerMove={handleHeroPointerMove}
          onPointerUp={handleHeroPointerUp}
          onPointerCancel={handleHeroPointerUp}
          className="flex touch-pan-y items-stretch gap-3 overflow-hidden rounded-2xl p-4 select-none active:cursor-grabbing sm:cursor-grab"
          style={{ background: "linear-gradient(135deg, var(--accent-soft), #d7f3e3)" }}
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
            <p className="text-[13px] font-semibold text-accent-dark">{heroSlides[heroIndex].eyebrow}</p>
            <span className="mt-2 inline-block w-fit rounded-full bg-bg-card px-2.5 py-1 text-[11px] font-extrabold text-accent-dark">
              {heroSlides[heroIndex].badge}
            </span>
            <p className="mt-2.5 line-clamp-2 text-[18px] font-extrabold text-text">{heroSlides[heroIndex].product.name}</p>
            <p className="mt-1.5 text-[18px] font-extrabold text-accent-dark">{formatPrice(heroSlides[heroIndex].product.price)}</p>
            <span className="mt-2.5 inline-flex w-fit rounded-lg bg-accent px-3 py-2 text-[13px] font-bold text-white">지금 주문하기 ›</span>
            {heroSlides.length > 1 && (
              <div className="mt-3.5 flex gap-1.5">
                {heroSlides.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.preventDefault();
                      setHeroIndex(i);
                    }}
                    className={`h-1.5 rounded-full transition-all ${i === heroIndex ? "w-4 bg-accent" : "w-1.5 bg-[var(--badge-parcel-bg)]"}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div
            className="relative flex w-[45%] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/50"
            onDragStart={(e) => e.preventDefault()}
          >
            <ProductPhoto
              photo={heroSlides[heroIndex].product.photos?.[0] ?? heroSlides[heroIndex].product.emoji}
              fit="contain"
              className="flex h-full w-full items-center justify-center text-[104px] leading-none drop-shadow-sm"
            />
          </div>
        </Link>
      )}

      {deadlineItems.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-[12.5px] font-bold text-text-muted">⏰ 마감 임박 상품</p>
          <div className="flex gap-2.5 overflow-x-auto">
            {deadlineItems.map((item) => (
              <Link key={item.product.id} href={`/product/${item.product.id}`} className="w-[122px] shrink-0 rounded-xl border border-border p-2.5">
                <span className="rounded-md bg-[var(--badge-door-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--badge-door-fg)]">
                  {EVENT_TYPE_LABEL[item.badgeType]}
                </span>
                <ProductPhoto
                  photo={item.product.photos?.[0] ?? item.product.emoji}
                  className="mt-1.5 flex aspect-square items-center justify-center rounded-lg bg-accent-soft text-[38px] leading-none"
                />
                <p className="mt-1.5 mb-0.5 truncate text-[11.5px] font-semibold">{item.product.name}</p>
                <p className="text-[10.5px] text-text-muted">{formatDeadlineShort(item.deadlineAt)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-text-muted">
                  ⏰ <Countdown targetIso={item.deadlineAt} format={formatCountdownShort} urgentClassName="text-red-500 font-bold" />
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="mt-5">
          <p className="mb-2 text-[12.5px] font-bold text-text-muted">🔥 인기상품</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
            {popular.map((p, i) => (
              <ProductGridCard key={p.id} product={p} rankBadge={`BEST ${i + 1}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
