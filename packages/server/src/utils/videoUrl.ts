/** Returns true if the URL cannot be loaded by other browsers in the room. */
export function isNonShareableVideoUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('filesystem:') ||
    trimmed.startsWith('data:')
  );
}

export function summarizeVideoUrl(url: string): string {
  if (url.startsWith('blob:')) return `blob:…(${url.length} chars)`;
  if (url.length > 120) return `${url.slice(0, 80)}…${url.slice(-30)}`;
  return url;
}
