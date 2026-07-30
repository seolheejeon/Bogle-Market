import type { ProductDetailBlock } from "@/types";

const GRID_COLS_CLASS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

// Renders an ordered list of detail blocks (heading / text / images), same
// shape whether the blocks are dummy placeholder content or, later, content
// authored by an admin. An "images" block lays its photos out side by side in
// as many columns as it has photos (1~3) — e.g. a 3-photo block renders as a
// 3-column row, letting admins mix single full-width shots with side-by-side
// comparison rows the way a smart-store detail page would.
export function ProductDetailContent({ blocks }: { blocks: ProductDetailBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <section className="mt-6 border-t border-border pt-5">
      <p className="mb-3 text-[12.5px] font-bold text-text-muted">상세설명</p>
      <div className="flex flex-col gap-4">
        {blocks.map((block, i) => {
          if (block.type === "heading") {
            return (
              <h3 key={i} className="text-[15px] font-extrabold">
                {block.text}
              </h3>
            );
          }
          if (block.type === "text") {
            return (
              <p key={i} className="text-[13.5px] leading-relaxed whitespace-pre-line text-text-muted">
                {block.text}
              </p>
            );
          }
          // A single photo keeps its natural height (full-width, uncropped) like
          // before; 2~3 photos side by side get a shared square aspect so the row
          // lines up evenly.
          const multiColumn = block.urls.length > 1;
          return (
            <div key={i} className={`grid gap-1.5 ${GRID_COLS_CLASS[block.urls.length] ?? "grid-cols-1"}`}>
              {block.urls.map((url, j) =>
                url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- source domain isn't known ahead of time (admin uploads later)
                  <img
                    key={j}
                    src={url}
                    alt=""
                    loading="lazy"
                    className={`w-full rounded-xl object-cover ${multiColumn ? "aspect-square" : ""}`}
                  />
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
