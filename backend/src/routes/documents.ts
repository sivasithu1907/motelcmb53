import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { canUploadDocuments, canViewDocuments } from '../middleware/permissions.js';
import { createAuditLog } from '../services/audit.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIRECTORY || './uploads/documents';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;

// Identity documents: JPEG, PNG and WebP only. PDF is not accepted.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// File signature (magic bytes) validation for identity document images.
// This prevents accepting an executable file renamed as .jpg etc.
const FILE_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header; WebP bytes at offset 8 also checked
};

function validateFileSignature(filePath: string, claimedMime: string): boolean {
  try {
    const sigs = FILE_SIGNATURES[claimedMime];
    if (!sigs) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return sigs.some((sig) => sig.every((byte, i) => buf[i] === byte));
  } catch {
    return false;
  }
}

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
documentsRouter.post('/guests/:guestId', canUploadDocuments, upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Path traversal protection: stored filename is random (no user input)
    // and upload dir is resolved to an absolute path at startup.
    const { guestId } = req.params;
    const guestIdStr = Array.isArray(guestId) ? guestId[0] : guestId;

    // Reject non-alphanumeric guestId to prevent path injection
    if (!/^[a-z0-9_-]+$/i.test(guestIdStr)) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'Invalid guest ID' });
      return;
    }

    const side = req.body.side as string;

    if (!['front', 'back'].includes(side)) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'side must be front or back' });
      return;
    }

    // Validate file signature (magic bytes) to prevent malicious files renamed as images
    if (!validateFileSignature(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      res.status(422).json({ error: 'File content does not match the declared image type. Only JPEG, PNG and WebP images are accepted.' });
      return;
    }

    const guest = await prisma.guest.findUnique({ where: { id: guestIdStr } });
    if (!guest) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Guest not found' });
      return;
    }

    // Organization gate: document must belong to a guest in user's org
    if (guest.organizationId !== req.user!.organizationId && req.user!.role !== 'SuperAdmin') {
      fs.unlinkSync(req.file.path);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Remove existing document for this side
    const existing = await prisma.guestDocument.findFirst({
      where: { guestId: guestIdStr, side },
    });

    if (existing) {
      const oldPath = path.join(UPLOAD_DIR, existing.storedFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await prisma.guestDocument.delete({ where: { id: existing.id } });
    }

    const doc = await prisma.guestDocument.create({
      data: {
        guestId: guestIdStr,
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
      newValue: { guestId: guestIdStr, side, filename: req.file.originalname },
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
documentsRouter.get('/:id', canViewDocuments, async (req, res, next) => {
  try {
    const doc = await prisma.guestDocument.findUnique({
      where: { id: req.params.id },
      include: { guest: { select: { organizationId: true } } },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Organization gate
    if (doc.guest.organizationId !== req.user!.organizationId && req.user!.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Access denied' });
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
