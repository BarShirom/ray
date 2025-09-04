import multer from "multer";
import path from "path";
import fs from "fs";
/**
 * If you upload to a 3rd-party (e.g., Cloudinary) in the controller using upload_stream,
 * prefer memory storage. If you want to persist to /uploads on disk, set this to true.
 */
const USE_DISK_STORAGE = false;
// Ensure the upload directory exists (only needed for disk storage)
const uploadDir = path.join(__dirname, "..", "uploads");
if (USE_DISK_STORAGE) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
// Optional: derive a sensible extension from mimetype when the original has no ext
const mimeToExt = (mime) => {
    if (mime.startsWith("image/"))
        return ".jpg"; // default fallback
    if (mime.startsWith("video/"))
        return ".mp4"; // default fallback
    return "";
};
const storage = USE_DISK_STORAGE
    ? multer.diskStorage({
        destination: function (_req, _file, cb) {
            cb(null, uploadDir);
        },
        filename: function (_req, file, cb) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const ext = path.extname(file.originalname) || mimeToExt(file.mimetype);
            cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
    })
    : multer.memoryStorage();
const allowedExt = new Set([
    ".jpeg",
    ".jpg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".mp4",
    ".mov",
    ".avi",
    ".webm",
    ".mkv",
]);
const isAllowed = (file) => {
    // Prefer mimetype checks
    if (file.mimetype.startsWith("image/") ||
        file.mimetype.startsWith("video/")) {
        return true;
    }
    // Fallback to extension list
    const ext = path.extname(file.originalname).toLowerCase();
    return allowedExt.has(ext);
};
const fileFilter = (_req, file, cb) => {
    if (isAllowed(file))
        return cb(null, true);
    cb(new Error("Unsupported file type"));
};
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file (matches client hint)
        files: 6, // up to 6 media files per request
        fieldSize: 5 * 1024 * 1024,
        fieldNameSize: 1024 * 1024,
    },
});
export default upload;
