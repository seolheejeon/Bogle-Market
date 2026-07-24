"use client";

import { useRef, useState } from "react";
import { uploadProductPhoto } from "@/lib/supabase/storage";
import { ProductPhoto } from "@/components/ProductPhoto";

export function PhotoUploader({ photos, onChange }: { photos: string[]; onChange: (photos: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        uploaded.push(await uploadProductPhoto(file));
      } catch (e) {
        alert(e instanceof Error ? e.message : "사진 업로드에 실패했어요.");
      }
    }
    onChange([...photos, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((photo, i) => (
        <div key={i} className="relative h-14 w-14 overflow-hidden rounded-lg border border-border">
          <ProductPhoto photo={photo} className="flex h-full w-full items-center justify-center bg-accent-soft text-2xl" />
          <button
            type="button"
            onClick={() => removeAt(i)}
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
        className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-text-muted disabled:opacity-50"
      >
        {uploading ? "업로드 중" : "+ 사진"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}
