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
const mimeToExt = (mime: string): string => {
  if (mime.startsWith("image/")) return ".jpg"; // default fallback
  if (mime.startsWith("video/")) return ".mp4"; // default fallback
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

const isAllowed = (file: Express.Multer.File) => {
  // Prefer mimetype checks
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/")
  ) {
    return true;
  }
  // Fallback to extension list
  const ext = path.extname(file.originalname).toLowerCase();
  return allowedExt.has(ext);
};

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (isAllowed(file)) return cb(null, true);
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

/**
 * Usage (router):
 * router.post("/", auth, upload.array("media", 6), createReport);
 *
 * In your controller (with memoryStorage):
 * const files = (req.files || []) as Express.Multer.File[];
 * // If using Cloudinary's upload_stream, call stream.end(file.buffer)
 */

// import multer from "multer";
// import path from "path";
// import fs from "fs";

// const uploadDir = path.join(__dirname, "..", "uploads");
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir);
// }

// const storage = multer.diskStorage({
//   destination: function (_req, _file, cb) {
//     cb(null, uploadDir);
//   },
//   filename: function (_req, file, cb) {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     const ext = path.extname(file.originalname);
//     cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
//   },
// });

// const fileFilter = (
//   _req: any,
//   file: Express.Multer.File,
//   cb: multer.FileFilterCallback
// ) => {
//   const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
//   const extname = allowedTypes.test(
//     path.extname(file.originalname).toLowerCase()
//   );
//   const mimetype = allowedTypes.test(file.mimetype);

//   if (extname && mimetype) {
//     cb(null, true);
//   } else {
//     cb(new Error("Unsupported file type"));
//   }
// };

// const upload = multer({
//   storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//     fieldSize: 5 * 1024 * 1024,
//     fieldNameSize: 1024 * 1024,
//   },
//   fileFilter,
// });

// export default upload;
