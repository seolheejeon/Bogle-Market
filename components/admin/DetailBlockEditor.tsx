"use client";

import { useRef, useState } from "react";
import type { ProductDetailBlock } from "@/types";
import { uploadProductPhotos } from "@/lib/supabase/storage";
import { imageFilesFromDataTransfer, imageFilesFromClipboard } from "@/lib/file-drop";
import { ProductPhoto } from "@/components/ProductPhoto";

const LAYOUT_LABEL: Record<1 | 2 | 3, string> = { 1: "1열", 2: "2열", 3: "3열" };

export function DetailBlockEditor({ blocks, onChange }: { blocks: ProductDetailBlock[]; onChange: (blocks: ProductDetailBlock[]) => void }) {
  const photoInputRef = useRef<HTMLInputElement>(null);
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

  // 몇 장을 고르든 항상 사진 블록 하나로 묶는다 — 레이아웃(1/2/3열)은 블록
  // 안에서 따로 고르는 값이라 장수와 무관하며, 나중에 사진을 더 추가해도
  // 같은 블록 안에서 관리된다.
  async function addPhotoBlock(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadProductPhotos(files);
      onChange([...blocks, { type: "images", urls, columns: 1 }]);
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
          addPhotoBlock(imageFilesFromDataTransfer(e.dataTransfer));
        }}
        onPaste={(e) => addPhotoBlock(imageFilesFromClipboard(e.clipboardData))}
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
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploading}
            className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "+ 사진"}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addPhotoBlock(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mt-1 text-[10.5px] text-text-muted">
        “+ 사진”으로 여러 장을 한 번에 올리면 사진 블록 하나가 만들어져요. 블록 안에서 1/2/3열 레이아웃을 고르고 사진을 자유롭게 추가·삭제·순서
        변경할 수 있어요. 편집기 안에 사진을 드래그하거나 Ctrl+V로 붙여넣어도 새 사진 블록이 만들어져요. 블록 순서는 ⠿를 드래그하거나 ▲▼로 바꿀 수
        있어요.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function addMore(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadProductPhotos(files);
      onChange({ ...block, urls: [...block.urls, ...uploaded] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  function removeAt(idx: number) {
    onChange({ ...block, urls: block.urls.filter((_, i) => i !== idx) });
  }

  function reorderPhoto(from: number, to: number) {
    const next = block.urls.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...block, urls: next });
  }

  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange({ ...block, columns: n })}
            className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
              block.columns === n ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted"
            }`}
          >
            {LAYOUT_LABEL[n]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {block.urls.map((url, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== idx) reorderPhoto(dragIndex, idx);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`group relative h-16 w-16 cursor-grab overflow-hidden rounded-lg border transition-opacity active:cursor-grabbing ${
              dragIndex === idx ? "border-accent opacity-40" : "border-border"
            }`}
          >
            <ProductPhoto photo={url} className="flex h-full w-full items-center justify-center bg-accent-soft text-2xl" />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-text-muted disabled:opacity-50"
        >
          {uploading ? "업로드 중" : "+ 추가"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addMore(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
