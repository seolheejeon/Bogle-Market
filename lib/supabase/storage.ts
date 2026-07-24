import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

const BUCKET = "product-photos";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// In mock mode there's no real backend to upload to, so the photo is kept as
// a data URL and persisted inline through the same localStorage-backed data
// layer as every other product field.
export async function uploadProductPhoto(file: File): Promise<string> {
  if (!isSupabaseConfigured) {
    return fileToDataUrl(file);
  }
  const supabase = getSupabaseBrowserClient()!;
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Uploads every file and returns their URLs in the same order as `files` —
// used when multiple photos are selected/dropped/pasted at once (e.g. to
// create one detail-description image block per file).
export async function uploadProductPhotos(files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => uploadProductPhoto(file)));
}
