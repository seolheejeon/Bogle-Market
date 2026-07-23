import type { ProductDetailBlock } from "@/types";

// Renders an ordered list of detail blocks (heading / text / image), same
// shape whether the blocks are dummy placeholder content or, later, content
// authored by an admin.
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
          return (
            // eslint-disable-next-line @next/next/no-img-element -- source domain isn't known ahead of time (admin uploads later)
            <img key={i} src={block.url} alt={block.alt ?? ""} loading="lazy" className="w-full rounded-xl object-cover" />
          );
        })}
      </div>
    </section>
  );
}
