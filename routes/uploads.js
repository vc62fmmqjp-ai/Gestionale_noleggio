const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database/db');

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
        const dir = path.join(__dirname, '..', 'uploads', entity_type, String(entity_id));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const { entity_type, entity_id } = req.body;
        if (entity_type !== 'customer') return cb(null, `${Date.now()}-${file.originalname}`);
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

const upload = multer({ storage });

// GET / - lista uploads filtrata
router.get('/', (req, res) => {
    try {
        const { entity_type, entity_id } = req.query;
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

        const filePath = path.join(__dirname, '..', 'uploads', fileRecord.entity_type, String(fileRecord.entity_id), fileRecord.filename);
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

        const filePath = path.join(__dirname, '..', 'uploads', fileRecord.entity_type, String(fileRecord.entity_id), fileRecord.filename);
        
        db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ message: 'File eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
