"use client";

import { useRef, useState } from "react";
import type { ProductDetailBlock } from "@/types";
import { uploadProductPhoto, uploadProductPhotos } from "@/lib/supabase/storage";
import { imageFilesFromDataTransfer, imageFilesFromClipboard } from "@/lib/file-drop";

export function DetailBlockEditor({ blocks, onChange }: { blocks: ProductDetailBlock[]; onChange: (blocks: ProductDetailBlock[]) => void }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function update(i: number, block: ProductDetailBlock) {
    onChange(blocks.map((b, idx) => (idx === i ? block : b)));
  }
  function remove(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  // Selecting/dropping/pasting N images creates N image blocks in upload
  // order, instead of one empty block that then needs its own file picker —
  // e.g. picking 10 photos at once yields 10 filled-in blocks immediately.
  async function addImageBlocks(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadProductPhotos(files);
      onChange([...blocks, ...urls.map((url): ProductDetailBlock => ({ type: "image", url }))]);
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
          addImageBlocks(imageFilesFromDataTransfer(e.dataTransfer));
        }}
        onPaste={(e) => addImageBlocks(imageFilesFromClipboard(e.clipboardData))}
        className={`flex flex-col gap-2 rounded-lg p-1 outline-none ${dragOver ? "bg-accent-soft ring-2 ring-accent" : ""}`}
      >
        {blocks.map((block, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-bg-card p-2">
            <div className="flex flex-col gap-0.5 pt-0.5">
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
              {block.type === "image" && <ImageBlockEditor block={block} onChange={(b) => update(i, b)} />}
            </div>
            <button type="button" onClick={() => remove(i)} className="rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] leading-relaxed text-white">
              ×
            </button>
          </div>
        ))}
        <div className="flex gap-1.5">
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
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "+ 사진"}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addImageBlocks(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-text-muted">사진은 여러 장 한 번에 선택하면 그 순서대로 블록이 만들어져요. 드래그하거나 Ctrl+V로 붙여넣어도 돼요.</p>
    </div>
  );
}

function ImageBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ProductDetailBlock, { type: "image" }>;
  onChange: (block: ProductDetailBlock) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductPhoto(file);
      onChange({ type: "image", url, alt: block.alt });
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      {block.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- source is Supabase Storage or a mock-mode data URI
        <img src={block.url} alt="" className="h-14 w-14 rounded-md object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-text-muted">없음</div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-[7px] border border-border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
      >
        {uploading ? "업로드 중" : block.url ? "사진 변경" : "사진 선택"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />
    </div>
  );
}
