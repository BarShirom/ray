import { Router, type Request, type Response } from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";

const router = Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "ray/reports",
    resource_type: "auto", // images or videos
    overwrite: false,
  }),
});

// 🔧 Robust fix: normalize the callback signature once (works across TS/@types glitches)
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const done = cb as unknown as (err: any, accept: boolean) => void; // normalize cb
    const ok = /^image\/|^video\//.test(file.mimetype);
    return ok
      ? done(null, true)
      : done(new Error("Only images/videos allowed"), false);
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

export interface UploadedItem {
  url: string;
  public_id: string;
  format?: string;
  type: string;
  width?: number;
  height?: number;
  bytes?: number;
}

// POST /api/upload/media
router.post(
  "/media",
  upload.array("media", 5),
  (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) ?? [];

    const items: UploadedItem[] = files.map((f) => ({
      url: (f as any).path, // Cloudinary delivery URL (multer-storage-cloudinary sets this)
      public_id: (f as any).filename, // Cloudinary public_id
      format: (f as any).format,
      type: f.mimetype,
      width: (f as any).width,
      height: (f as any).height,
      bytes: (f as any).bytes,
    }));

    res.json({ items });
  }
);

export default router;
