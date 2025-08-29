import "multer";

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        // Cloudinary (multer-storage-cloudinary) adds these:
        path: string; // delivery URL
        filename: string; // public_id
        width?: number;
        height?: number;
        bytes?: number;
        format?: string; // "jpg", "png", etc.
      }
    }
  }
}
export {};
