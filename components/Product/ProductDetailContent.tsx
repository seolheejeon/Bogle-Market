import type { ProductDetailBlock } from "@/types";

const GRID_COLS_CLASS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };
const TEXT_SIZE_CLASS: Record<NonNullable<Extract<ProductDetailBlock, { type: "text" }>["size"]>, string> = {
  sm: "text-[13.5px]",
  md: "text-[15px]",
  lg: "text-[17px]",
  xl: "text-[21px]",
};

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
            const sizeClass = TEXT_SIZE_CLASS[block.size ?? "sm"];
            return (
              <p
                key={i}
                className={`leading-relaxed whitespace-pre-line ${sizeClass} ${block.bold ? "font-bold" : ""} ${block.color ? "" : "text-text-muted"}`}
                style={block.color ? { color: block.color } : undefined}
              >
                {block.text}
              </p>
            );
          }
          if (block.type === "video") {
            return <video key={i} src={block.src} controls playsInline className="w-full rounded-xl bg-black" />;
          }
          // A 1열 block keeps its natural height (full-width, uncropped) like
          // before; 2~3열 get a shared square aspect so the row lines up evenly.
          // columns is independent of how many photos are in the block — a
          // ragged last row (e.g. 5 photos at 2열) is expected and fine.
          const multiColumn = block.columns > 1;
          return (
            <div key={i} className={`grid gap-1.5 ${GRID_COLS_CLASS[block.columns] ?? "grid-cols-1"}`}>
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
