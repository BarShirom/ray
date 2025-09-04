import { Router } from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
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
        const done = cb; // normalize cb
        const ok = /^image\/|^video\//.test(file.mimetype);
        return ok
            ? done(null, true)
            : done(new Error("Only images/videos allowed"), false);
    },
    limits: { fileSize: 25 * 1024 * 1024 },
});
// POST /api/upload/media
router.post("/media", upload.array("media", 5), (req, res) => {
    const files = req.files ?? [];
    const items = files.map((f) => ({
        url: f.path, // Cloudinary delivery URL (multer-storage-cloudinary sets this)
        public_id: f.filename, // Cloudinary public_id
        format: f.format,
        type: f.mimetype,
        width: f.width,
        height: f.height,
        bytes: f.bytes,
    }));
    res.json({ items });
});
export default router;
