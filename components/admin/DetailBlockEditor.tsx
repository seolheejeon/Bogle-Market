"use client";

import { useRef, useState } from "react";
import type { ProductDetailBlock } from "@/types";
import { uploadProductPhoto, uploadProductPhotos } from "@/lib/supabase/storage";
import { imageFilesFromDataTransfer, imageFilesFromClipboard } from "@/lib/file-drop";

const IMAGE_LAYOUT_LABEL: Record<number, string> = { 1: "사진 1열", 2: "사진 2열", 3: "사진 3열" };

export function DetailBlockEditor({ blocks, onChange }: { blocks: ProductDetailBlock[]; onChange: (blocks: ProductDetailBlock[]) => void }) {
  const columnImageInputRef = useRef<HTMLInputElement>(null);
  const [pendingColumns, setPendingColumns] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function update(i: number, block: ProductDetailBlock) {
    onChange(blocks.map((b, idx) => (idx === i ? block : b)));
  }
  function remove(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    reorder(i, j);
  }
  function reorder(from: number, to: number) {
    const next = blocks.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  // Dropping/pasting N photos anywhere in the editor still creates N separate
  // 1-column image blocks in upload order (throw a batch of photos in, get a
  // block per photo) — the explicit "+ 사진 2장/3장" buttons below are the only
  // way to create a multi-column block.
  async function addBulkImageBlocks(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadProductPhotos(files);
      onChange([...blocks, ...urls.map((url): ProductDetailBlock => ({ type: "images", urls: [url] }))]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  function openColumnPicker(columns: number) {
    setPendingColumns(columns);
    columnImageInputRef.current?.click();
  }

  async function addColumnImageBlock(files: File[], columns: number) {
    const chosen = files.slice(0, columns);
    setUploading(true);
    try {
      const urls = chosen.length > 0 ? await uploadProductPhotos(chosen) : [];
      while (urls.length < columns) urls.push("");
      onChange([...blocks, { type: "images", urls }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  return (
    <div>
      <div
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addBulkImageBlocks(imageFilesFromDataTransfer(e.dataTransfer));
        }}
        onPaste={(e) => addBulkImageBlocks(imageFilesFromClipboard(e.clipboardData))}
        className={`flex flex-col gap-2 rounded-lg p-1 outline-none ${dragOver ? "bg-accent-soft ring-2 ring-accent" : ""}`}
      >
        {blocks.map((block, i) => (
          <div
            key={i}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-start gap-2 rounded-lg border bg-bg-card p-2 transition-opacity ${dragIndex === i ? "border-accent opacity-40" : "border-border"}`}
          >
            <div className="flex cursor-grab flex-col items-center gap-0.5 pt-0.5 select-none active:cursor-grabbing">
              <span className="text-[13px] text-text-muted" title="드래그해서 순서 변경">
                ⠿
              </span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[11px] text-text-muted disabled:opacity-30">
                ▲
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="text-[11px] text-text-muted disabled:opacity-30">
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {block.type === "heading" && (
                <input
                  className="w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px] font-bold"
                  placeholder="제목"
                  value={block.text}
                  onChange={(e) => update(i, { type: "heading", text: e.target.value })}
                />
              )}
              {block.type === "text" && (
                <textarea
                  className="w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
                  rows={3}
                  placeholder="본문 내용"
                  value={block.text}
                  onChange={(e) => update(i, { type: "text", text: e.target.value })}
                />
              )}
              {block.type === "images" && <ImagesBlockEditor block={block} onChange={(b) => update(i, b)} />}
            </div>
            <button type="button" onClick={() => remove(i)} className="rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] leading-relaxed text-white">
              ×
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange([...blocks, { type: "heading", text: "" }])}
            className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted"
          >
            + 제목
          </button>
          <button
            type="button"
            onClick={() => onChange([...blocks, { type: "text", text: "" }])}
            className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted"
          >
            + 본문
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => openColumnPicker(n)}
              disabled={uploading}
              className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : `+ 사진 ${n}장`}
            </button>
          ))}
          <input
            ref={columnImageInputRef}
            type="file"
            accept="image/*"
            multiple={pendingColumns > 1}
            className="hidden"
            onChange={(e) => {
              addColumnImageBlock(Array.from(e.target.files ?? []), pendingColumns);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-text-muted">
        “+ 사진 N장”은 가로 N열로 나란히 보이는 블록을 만들어요. 편집기 안에 사진을 드래그하거나 Ctrl+V로 붙여넣으면 장수만큼 1열 블록이 만들어져요. 블록은 ⠿를 드래그하거나 ▲▼로 순서를 바꿀 수 있어요.
      </p>
    </div>
  );
}

function ImagesBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ProductDetailBlock, { type: "images" }>;
  onChange: (block: ProductDetailBlock) => void;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  async function handleFile(idx: number, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadingIdx(idx);
    try {
      const url = await uploadProductPhoto(file);
      const urls = block.urls.slice();
      urls[idx] = url;
      onChange({ type: "images", urls });
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploadingIdx(null);
    const input = inputRefs.current[idx];
    if (input) input.value = "";
  }

  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-semibold text-text-muted">{IMAGE_LAYOUT_LABEL[block.urls.length] ?? `사진 ${block.urls.length}열`}</p>
      <div className="flex gap-2">
        {block.urls.map((url, idx) => (
          <div key={idx} className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- source is Supabase Storage or a mock-mode data URI
              <img src={url} alt="" className="aspect-square w-full rounded-md object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border text-[10px] text-text-muted">없음</div>
            )}
            <button
              type="button"
              onClick={() => inputRefs.current[idx]?.click()}
              disabled={uploadingIdx === idx}
              className="w-full truncate rounded-[7px] border border-border px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
            >
              {uploadingIdx === idx ? "업로드 중" : url ? "변경" : "선택"}
            </button>
            <input
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(idx, e.target.files)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
