import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../managers/RoomManager';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_VIDEO_UPLOAD_MB || '500', 10);

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/avi',
  'application/octet-stream', // some browsers send this for .mkv
]);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/') || ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

function getPublicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = req.get('host') || `localhost:${process.env.PORT || '3001'}`;
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

export const videoUploadRouter = Router();

videoUploadRouter.post(
  '/upload',
  upload.single('file'),
  (req: Request, res: Response) => {
    const { roomCode, userId } = req.body as { roomCode?: string; userId?: string };
    const file = req.file;

    console.log('[VideoUpload] Request', {
      roomCode,
      userId: userId?.slice(0, 8),
      hasFile: !!file,
      originalName: file?.originalname,
      size: file?.size,
    });

    if (!roomCode || !userId) {
      if (file) fs.unlink(file.path, () => {});
      res.status(400).json({ error: 'roomCode and userId are required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No video file provided' });
      return;
    }

    const room = roomManager.getRoomByCode(roomCode);
    if (!room) {
      fs.unlink(file.path, () => {});
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.hostId !== userId) {
      fs.unlink(file.path, () => {});
      res.status(403).json({ error: 'Only the host can upload videos' });
      return;
    }

    const publicUrl = `${getPublicBaseUrl(req)}/uploads/${file.filename}`;
    const name = file.originalname || 'Uploaded video';

    console.log('[VideoUpload] Success', {
      roomCode: room.code,
      filename: file.filename,
      publicUrl: publicUrl.slice(0, 80),
      sizeMB: (file.size / (1024 * 1024)).toFixed(2),
    });

    res.json({
      url: publicUrl,
      name,
      type: 'url' as const,
    });
  },
);

// Multer error handler
videoUploadRouter.use((err: Error, _req: Request, res: Response, next: (err?: Error) => void) => {
  if (err instanceof multer.MulterError) {
    console.error('[VideoUpload] Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File too large (max ${MAX_FILE_SIZE_MB}MB)` });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err) {
    console.error('[VideoUpload] Error:', err.message);
    res.status(400).json({ error: err.message });
    return;
  }
  next();
});
