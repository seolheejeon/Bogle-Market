"use client";

import { useRef, useState } from "react";
import { uploadProductPhotos } from "@/lib/supabase/storage";
import { ProductPhoto } from "@/components/ProductPhoto";
import { imageFilesFromDataTransfer, imageFilesFromClipboard } from "@/lib/file-drop";

export function PhotoUploader({ photos, onChange }: { photos: string[]; onChange: (photos: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadProductPhotos(files);
      onChange([...photos, ...uploaded]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
    }
    setUploading(false);
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= photos.length) return;
    const next = photos.slice();
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
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
          addFiles(imageFilesFromDataTransfer(e.dataTransfer));
        }}
        onPaste={(e) => addFiles(imageFilesFromClipboard(e.clipboardData))}
        className={`flex flex-wrap gap-2 rounded-lg p-1 outline-none ${dragOver ? "bg-accent-soft ring-2 ring-accent" : ""}`}
      >
        {photos.map((photo, i) => (
          <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-border">
            <ProductPhoto photo={photo} className="flex h-full w-full items-center justify-center bg-accent-soft text-2xl" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white"
            >
              ×
            </button>
            {photos.length > 1 && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/50 py-0.5 opacity-0 group-hover:opacity-100">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-[10px] leading-none text-white disabled:opacity-30">
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === photos.length - 1}
                  className="px-1 text-[10px] leading-none text-white disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-text-muted disabled:opacity-50"
        >
          {uploading ? "업로드 중" : "+ 사진"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-1 text-[10.5px] text-text-muted">여러 장 선택, 드래그, 또는 Ctrl+V로 붙여넣기할 수 있어요.</p>
    </div>
  );
}
