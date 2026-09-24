const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database/db');

const ALLOWED_ENTITY_TYPES = new Set(['customer', 'vehicle']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per file
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif', 'image/avif',
    'image/heic', 'image/heif'
]);

function isValidEntity(entityType, entityId) {
    if (!ALLOWED_ENTITY_TYPES.has(entityType) || !/^\d+$/.test(String(entityId || ''))) return false;
    const table = entityType === 'customer' ? 'customers' : 'vehicles';
    return Boolean(db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(Number(entityId)));
}

function safeStoredFilename(value) {
    const base = path.basename(String(value || 'file'));
    const cleaned = safeFilenamePart(base);
    return cleaned || `file-${Date.now()}`;
}

function safeFilenamePart(value) {
    return String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function customerDocumentFilename(entityId, originalName) {
    const customer = db.prepare('SELECT nome, cognome FROM customers WHERE id = ?').get(entityId);
    const extension = path.extname(originalName || '') || '.pdf';
    const fullName = safeFilenamePart([customer?.nome, customer?.cognome].filter(Boolean).join(' ')) || 'Cliente';
    return `${fullName} documenti${extension}`;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { entity_type, entity_id } = req.body;
        if (!isValidEntity(entity_type, entity_id)) return cb(new Error('Entita upload non valida'));
        const dir = path.join(__dirname, '..', 'uploads', entity_type, String(Number(entity_id)));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const { entity_type, entity_id } = req.body;
        if (!isValidEntity(entity_type, entity_id)) return cb(new Error('Entita upload non valida'));
        if (entity_type !== 'customer') return cb(null, `${Date.now()}-${safeStoredFilename(file.originalname)}`);
        const dir = path.join(__dirname, '..', 'uploads', entity_type, String(entity_id));
        const base = customerDocumentFilename(entity_id, file.originalname);
        const extension = path.extname(base);
        const stem = base.slice(0, -extension.length);
        let candidate = base;
        let number = 2;
        while (fs.existsSync(path.join(dir, candidate))) candidate = `${stem} (${number++})${extension}`;
        cb(null, candidate);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 20 },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new Error('Tipo di file non consentito'));
        }
        cb(null, true);
    }
});

// GET / - lista uploads filtrata
router.get('/', (req, res) => {
    try {
        const { entity_type, entity_id } = req.query;
        if (entity_type && !ALLOWED_ENTITY_TYPES.has(entity_type)) return res.status(400).json({ error: 'Tipo entita non valido' });
        if (entity_id && !/^\d+$/.test(String(entity_id))) return res.status(400).json({ error: 'ID entita non valido' });
        let query = 'SELECT * FROM uploads WHERE 1=1';
        const params = [];

        if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
        if (entity_id) { query += ' AND entity_id = ?'; params.push(entity_id); }
        
        query += ' ORDER BY created_at DESC';
        const uploads = db.prepare(query).all(...params);
        res.json(uploads);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / - upload file (singolo o multipli)
router.post('/', upload.array('file'), (req, res) => {
    try {
        if (!req.files?.length) return res.status(400).json({ error: 'Nessun file inviato' });
        
        const { entity_type, entity_id, original_name } = req.body;
        if (!isValidEntity(entity_type, entity_id)) {
            for (const file of req.files) { try { fs.unlinkSync(file.path); } catch (_) {} }
            return res.status(400).json({ error: 'Entita upload non valida' });
        }
        const ids = [];

        for (const file of req.files) {
            const readableName = entity_type === 'customer'
                ? customerDocumentFilename(entity_id, file.filename || file.originalname)
                : (original_name || file.originalname);
            const info = db.prepare(`
                INSERT INTO uploads (entity_type, entity_id, filename, original_name, mimetype, size)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(entity_type, entity_id, file.filename, readableName, file.mimetype, file.size);
            ids.push(info.lastInsertRowid);
        }

        res.status(201).json({ ids, message: `${req.files.length} file caricati con successo` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id - serve il file
router.get('/:id', (req, res) => {
    try {
        const fileRecord = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
        if (!fileRecord) return res.status(404).json({ error: 'File non trovato' });

        const filePath = path.join(__dirname, '..', 'uploads', fileRecord.entity_type, String(fileRecord.entity_id), path.basename(fileRecord.filename));
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File non trovato sul disco' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id - elimina record e file
router.delete('/:id', (req, res) => {
    try {
        const fileRecord = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
        if (!fileRecord) return res.status(404).json({ error: 'File non trovato' });

        const filePath = path.join(__dirname, '..', 'uploads', fileRecord.entity_type, String(fileRecord.entity_id), path.basename(fileRecord.filename));
        
        db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ message: 'File eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File troppo grande: massimo 20 MB per file' });
        return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
});

module.exports = router;
