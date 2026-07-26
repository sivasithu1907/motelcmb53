import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canWrite } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIRECTORY || './uploads/documents';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => {
    // Use random filename to prevent path traversal and enumeration
    const id = createId();
    cb(null, `doc_${id}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WebP images are allowed'));
    }
  },
});

// Upload document
documentsRouter.post('/guests/:guestId', canWrite, upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { guestId } = req.params;
    const side = req.body.side as string;

    if (!['front', 'back'].includes(side)) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'side must be front or back' });
      return;
    }

    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Guest not found' });
      return;
    }

    // Remove existing document for this side
    const existing = await prisma.guestDocument.findFirst({
      where: { guestId, side },
    });

    if (existing) {
      const oldPath = path.join(UPLOAD_DIR, existing.storedFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await prisma.guestDocument.delete({ where: { id: existing.id } });
    }

    const doc = await prisma.guestDocument.create({
      data: {
        guestId,
        side,
        originalFilename: req.file.originalname,
        storedFilename: path.basename(req.file.path),
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        storagePath: req.file.path,
        uploadedById: req.user!.id,
      },
    });

    await createAuditLog(req.user, req, {
      action: 'DOCUMENT_UPLOADED',
      entityType: 'GuestDocument',
      entityId: doc.id,
      newValue: { guestId, side, filename: req.file.originalname },
    });

    res.status(201).json({
      id: doc.id,
      side: doc.side,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      uploadedAt: doc.uploadedAt,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

// View document (authenticated, with audit trail)
documentsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const doc = await prisma.guestDocument.findUnique({ where: { id: req.params.id } });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (!fs.existsSync(doc.storagePath)) {
      res.status(404).json({ error: 'Document file not found' });
      return;
    }

    await createAuditLog(req.user, req, {
      action: 'DOCUMENT_VIEWED',
      entityType: 'GuestDocument',
      entityId: doc.id,
      newValue: { guestId: doc.guestId, side: doc.side },
    });

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalFilename}"`);
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(doc.storagePath).pipe(res);
  } catch (err) {
    next(err);
  }
});
