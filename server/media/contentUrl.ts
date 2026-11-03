// The only supported HTTP composition remains the loopback PostgreSQL preview.
// Emit a stable application reference; never expose storage keys or capabilities.
export const mediaContentUrl = (assetId: string) => `http://127.0.0.1:4001/api/media/${assetId}/content`;
