// A product photo slot holds either a real uploaded photo (Supabase Storage
// URL, or a data: URL in mock mode) or a plain emoji placeholder string.
export function isPhotoUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}

export function ProductPhoto({ photo, className }: { photo: string; className?: string }) {
  if (isPhotoUrl(photo)) {
    return (
      <div className={`overflow-hidden ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- source is Supabase Storage or a mock-mode data URI, not a known static domain */}
        <img src={photo} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return <div className={className}>{photo}</div>;
}
