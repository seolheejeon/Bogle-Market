"use client";

import { useRef, useState } from "react";
import type { ProductDetailBlock } from "@/types";
import { uploadProductPhotos, uploadProductPhoto, uploadProductFile } from "@/lib/supabase/storage";
import { imageFilesFromDataTransfer, imageFilesFromClipboard } from "@/lib/file-drop";
import { ProductPhoto } from "@/components/ProductPhoto";
import { ProductDetailContent } from "@/components/Product/ProductDetailContent";

const LAYOUT_LABEL: Record<1 | 2 | 3, string> = { 1: "1열", 2: "2열", 3: "3열" };

type TextBlock = Extract<ProductDetailBlock, { type: "text" }>;
const TEXT_SIZE_OPTIONS: { value: NonNullable<TextBlock["size"]>; label: string }[] = [
  { value: "sm", label: "작게" },
  { value: "md", label: "보통" },
  { value: "lg", label: "크게" },
  { value: "xl", label: "아주 크게" },
];
// "기본"은 색을 아예 안 지정하는(undefined) 선택지 — 라이트/다크 모드 양쪽에서
// 알아서 읽기 좋은 기본 텍스트색을 쓰게 두고, 나머지는 고정 hex를 강조용으로.
const COLOR_PRESETS: { label: string; value: string | undefined }[] = [
  { label: "기본", value: undefined },
  { label: "진하게", value: "#1a1a1a" },
  { label: "브랜드", value: "#c9532f" },
  { label: "강조", value: "#dc2626" },
  { label: "파랑", value: "#2563eb" },
];

// 스마트스토어 상세편집기처럼 블록(제목/본문 대신 서식 있는 텍스트, 사진,
// 동영상)을 자유롭게 쌓고 드래그로 순서를 바꾸는 편집기. 새 블록 종류(배너,
// 유튜브, 버튼 등)를 추가하려면 types/index.ts의 ProductDetailBlock 유니온에
// 멤버를 하나 추가하고, 여기 렌더링 분기와 "+ 버튼" 하나씩만 더하면 된다.
export function DetailBlockEditor({ blocks, onChange }: { blocks: ProductDetailBlock[]; onChange: (blocks: ProductDetailBlock[]) => void }) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  // 블록 사이사이의 "+ 여기에 추가" 지점에서 사진을 고를 때 쓰는 별도 input —
  // 어느 위치에 끼워 넣을지(insertMenuAt)를 같이 기억해뒀다가 onChange에서 그
  // 인덱스에 바로 삽입한다(맨 아래 "+ 사진" 버튼과 동일한 input을 같이 쓰면
  // "끝에 추가"와 "여기에 추가"가 서로 섞일 수 있어 분리했다).
  const insertPhotoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // 블록 목록 맨 위(0)부터 각 블록 바로 앞자리까지, 어느 "+ 여기에 추가" 메뉴가
  // 펼쳐져 있는지 — 한 번에 하나만 열리고, 선택하면 자동으로 닫힌다.
  const [insertMenuAt, setInsertMenuAt] = useState<number | null>(null);

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

  // 한 번에 여러 장을 올려도 한 블록에 몰아넣지 않고 사진 한 장당 블록 하나씩
  // 순서대로 추가한다 — 그래야 그 사이사이에 텍스트를 끼워 넣을 수 있고,
  // 원하는 사진끼리만 나중에 "합치기"로 2열/3열 묶음을 만들 수 있다(전체를
  // 한 블록으로 묶어 열 하나만 고르는 방식이 아님). GIF도 image/* MIME이라
  // 그대로 여기로 들어와 똑같이 업로드되고, <img>가 애니메이션을 그대로
  // 재생하므로 별도 처리가 필요 없다.
  async function addPhotoBlock(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadProductPhotos(files);
      const newBlocks: ProductDetailBlock[] = urls.map((url) => ({ type: "images", urls: [url], columns: 1 }));
      onChange([...blocks, ...newBlocks]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  // 사진 블록끼리만 서로 합치거나(최대 3장까지, 옆에 나란히 보여줄 열도 그
  // 수에 맞춰 자동으로 잡아준다) 다시 낱장으로 나눌 수 있다 — "1열/2열/3열을
  // 몇 장짜리 블록 하나가 아니라 내가 원하는 사진끼리 직접 골라 정한다"는
  // 요청을 이 두 동작으로 구현했다.
  function mergeWithPrevious(i: number) {
    const prev = blocks[i - 1];
    const cur = blocks[i];
    if (!prev || prev.type !== "images" || cur.type !== "images") return;
    const mergedUrls = [...prev.urls, ...cur.urls].slice(0, 3);
    const merged: ProductDetailBlock = { type: "images", urls: mergedUrls, columns: Math.min(3, mergedUrls.length) as 1 | 2 | 3 };
    const next = blocks.slice();
    next.splice(i - 1, 2, merged);
    onChange(next);
  }
  function splitRow(i: number) {
    const block = blocks[i];
    if (block.type !== "images" || block.urls.length <= 1) return;
    const split: ProductDetailBlock[] = block.urls.map((url) => ({ type: "images", urls: [url], columns: 1 }));
    const next = blocks.slice();
    next.splice(i, 1, ...split);
    onChange(next);
  }

  // 예전엔 새 블록이 항상 맨 아래에만 추가돼서, 중간에 끼워 넣으려면 맨
  // 아래에 만든 뒤 드래그로 끌어올려야 했다 — 블록이 몇 개만 돼도 매번
  // 오래 걸린다는 피드백을 받아, 블록과 블록 사이 어디든 바로 삽입할 수
  // 있는 "+ 여기에 추가" 지점을 각 블록 앞자리마다 두었다.
  function insertTextAt(index: number) {
    const next = blocks.slice();
    next.splice(index, 0, { type: "text", text: "", size: "sm" });
    onChange(next);
    setInsertMenuAt(null);
  }
  function insertVideoAt(index: number) {
    const next = blocks.slice();
    next.splice(index, 0, { type: "video", src: "" });
    onChange(next);
    setInsertMenuAt(null);
  }
  async function insertPhotosAt(index: number, files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadProductPhotos(files);
      const newBlocks: ProductDetailBlock[] = urls.map((url) => ({ type: "images", urls: [url], columns: 1 }));
      const next = blocks.slice();
      next.splice(index, 0, ...newBlocks);
      onChange(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
    setInsertMenuAt(null);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11.5px] font-bold text-text-muted">블록 편집</p>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`rounded-[7px] border px-2.5 py-1 text-[11.5px] font-semibold ${showPreview ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"}`}
        >
          {showPreview ? "미리보기 끄기" : "미리보기"}
        </button>
      </div>

      {showPreview ? (
        <div className="rounded-lg border border-border p-3">
          {blocks.length === 0 ? <p className="text-[12px] text-text-muted">아직 블록이 없어요.</p> : <ProductDetailContent blocks={blocks} />}
        </div>
      ) : (
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
            <div key={i}>
              <InsertPoint
                open={insertMenuAt === i}
                uploading={uploading}
                onToggle={() => setInsertMenuAt(insertMenuAt === i ? null : i)}
                onText={() => insertTextAt(i)}
                onPhoto={() => {
                  setInsertMenuAt(i);
                  insertPhotoInputRef.current?.click();
                }}
                onVideo={() => insertVideoAt(i)}
              />
              <div
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
                    placeholder="제목 (예전 블록 — 새로 만들려면 아래 '+ 텍스트'를 쓰세요)"
                    value={block.text}
                    onChange={(e) => update(i, { type: "heading", text: e.target.value })}
                  />
                )}
                {block.type === "text" && <TextBlockEditor block={block} onChange={(b) => update(i, b)} />}
                {block.type === "images" && (
                  <div>
                    {(() => {
                      const prev = blocks[i - 1];
                      const canMerge = i > 0 && prev?.type === "images" && prev.urls.length + block.urls.length <= 3;
                      const canSplit = block.urls.length > 1;
                      if (!canMerge && !canSplit) return null;
                      return (
                        <div className="mb-1.5 flex gap-1.5">
                          {canMerge && (
                            <button
                              type="button"
                              onClick={() => mergeWithPrevious(i)}
                              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10.5px] font-semibold text-text-muted"
                            >
                              ▲ 이전 사진과 합치기
                            </button>
                          )}
                          {canSplit && (
                            <button
                              type="button"
                              onClick={() => splitRow(i)}
                              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10.5px] font-semibold text-text-muted"
                            >
                              낱장으로 나누기
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    <ImagesBlockEditor block={block} onChange={(b) => update(i, b)} />
                  </div>
                )}
                {block.type === "video" && <VideoBlockEditor block={block} onChange={(b) => update(i, b)} />}
              </div>
                <button type="button" onClick={() => remove(i)} className="rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] leading-relaxed text-white">
                  ×
                </button>
              </div>
            </div>
          ))}
          <input
            ref={insertPhotoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (insertMenuAt !== null) insertPhotosAt(insertMenuAt, Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChange([...blocks, { type: "text", text: "", size: "sm" }])}
              className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted"
            >
              + 텍스트
            </button>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "+ 사진"}
            </button>
            <button
              type="button"
              onClick={() => onChange([...blocks, { type: "video", src: "" }])}
              className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted"
            >
              + 동영상
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
      )}
      <p className="mt-1 text-[10.5px] text-text-muted">
        블록과 블록 사이에 있는 점선 "+"를 누르면 바로 그 자리에 텍스트/사진/동영상을 끼워 넣을 수 있어요(맨 아래로 내려가서 추가한 뒤 끌어올릴
        필요 없음). "+ 사진"으로 여러 장을 한 번에 올려도 한 장당 블록 하나씩 따로 추가돼요(GIF도 그대로 올릴 수 있어요). 나란히 보여주고 싶은
        사진끼리는 "이전 사진과 합치기"로 최대 3장까지 한 줄로 묶고, 묶은 블록 안에서 1/2/3열 레이아웃을 고르면 돼요(다시 "낱장으로 나누기"로
        되돌릴 수 있어요). 편집기 안에 사진을 드래그하거나 Ctrl+V로 붙여넣으면 맨 끝에 같은 방식으로 추가돼요. 블록 순서는 ⠿를 드래그하거나
        ▲▼로 바꿀 수 있어요. 저장 전에 "미리보기"로 실제로 보일 모습을 확인해보세요.
      </p>
    </div>
  );
}

// 블록과 블록 사이(그리고 맨 위)에 놓이는 얇은 삽입 지점 — 평소엔 가운데
// "+"만 보이다가 누르면 텍스트/사진/동영상 미니 버튼이 그 자리에서 펼쳐진다.
// 맨 아래 "+ 텍스트/+ 사진/+ 동영상"과 달리 여기서 고르면 바로 이 지점에
// 끼워 넣힌다(끝까지 스크롤해서 추가한 뒤 드래그로 끌어올릴 필요가 없어짐).
function InsertPoint({
  open,
  uploading,
  onToggle,
  onText,
  onPhoto,
  onVideo,
}: {
  open: boolean;
  uploading: boolean;
  onToggle: () => void;
  onText: () => void;
  onPhoto: () => void;
  onVideo: () => void;
}) {
  if (!open) {
    return (
      <div className="group flex items-center gap-2 py-0.5">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          onClick={onToggle}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-[12px] leading-none text-text-muted"
          title="여기에 추가"
        >
          +
        </button>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return (
    <div className="my-1 flex flex-wrap items-center gap-1.5 rounded-[7px] border border-dashed border-accent bg-accent-soft/40 p-1.5">
      <span className="text-[10.5px] font-semibold text-text-muted">여기에 추가:</span>
      <button type="button" onClick={onText} className="rounded-full border border-border bg-bg-card px-2 py-0.5 text-[11px] font-semibold text-text-muted">
        텍스트
      </button>
      <button type="button" onClick={onPhoto} disabled={uploading} className="rounded-full border border-border bg-bg-card px-2 py-0.5 text-[11px] font-semibold text-text-muted disabled:opacity-50">
        {uploading ? "업로드 중..." : "사진"}
      </button>
      <button type="button" onClick={onVideo} className="rounded-full border border-border bg-bg-card px-2 py-0.5 text-[11px] font-semibold text-text-muted">
        동영상
      </button>
      <button type="button" onClick={onToggle} className="ml-auto text-[11px] text-text-muted">
        취소
      </button>
    </div>
  );
}

function TextBlockEditor({ block, onChange }: { block: TextBlock; onChange: (block: ProductDetailBlock) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        className="w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
        rows={3}
        placeholder="텍스트 내용"
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {TEXT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...block, size: opt.value })}
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                (block.size ?? "sm") === opt.value ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...block, bold: !block.bold })}
          className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${
            block.bold ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"
          }`}
        >
          굵게
        </button>
        <div className="flex items-center gap-1">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onClick={() => onChange({ ...block, color: c.value })}
              className={`h-5 w-5 rounded-full border-2 ${(block.color ?? undefined) === c.value ? "border-accent" : "border-border"}`}
              style={{ backgroundColor: c.value ?? "var(--text-muted)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoBlockEditor({ block, onChange }: { block: Extract<ProductDetailBlock, { type: "video" }>; onChange: (block: ProductDetailBlock) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">(block.src ? "url" : "upload");
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductFile(file);
      onChange({ ...block, src: url });
    } catch (e) {
      alert(e instanceof Error ? e.message : "동영상 업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${mode === "upload" ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"}`}
        >
          파일 업로드
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${mode === "url" ? "border-accent bg-accent-soft text-accent-dark" : "border-border text-text-muted"}`}
        >
          URL 입력
        </button>
      </div>
      {mode === "upload" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-[7px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : block.src ? "다른 파일로 교체" : "동영상 파일 선택"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <input
          className="w-full rounded-[7px] border border-border bg-bg-card px-2 py-1.5 text-[13px]"
          placeholder="https://... (mp4 등 동영상 파일 직접 링크)"
          value={block.src}
          onChange={(e) => onChange({ ...block, src: e.target.value })}
        />
      )}
      {block.src && (
        <video src={block.src} controls playsInline className="mt-1 max-h-40 w-full rounded-lg bg-black" />
      )}
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
  // 특정 한 장을 "교체"할 때는 그 인덱스를 여기 담아두고, 같은 hidden input의
  // onChange에서 addMore 대신 이 인덱스 자리만 바꿔치기한다.
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function addMore(files: File[]) {
    if (files.length === 0) return;
    const room = Math.max(0, 3 - block.urls.length);
    if (room === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadProductPhotos(files.slice(0, room));
      onChange({ ...block, urls: [...block.urls, ...uploaded] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  async function replaceAt(idx: number, file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductPhoto(file);
      onChange({ ...block, urls: block.urls.map((u, i) => (i === idx ? url : u)) });
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
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
            <button
              type="button"
              onClick={() => {
                setReplaceIndex(idx);
                replaceInputRef.current?.click();
              }}
              className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9px] font-semibold text-white"
            >
              교체
            </button>
          </div>
        ))}
        {block.urls.length < 3 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-text-muted disabled:opacity-50"
          >
            {uploading ? "업로드 중" : "+ 추가"}
          </button>
        )}
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
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (replaceIndex !== null) replaceAt(replaceIndex, e.target.files?.[0]);
            setReplaceIndex(null);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
