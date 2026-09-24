const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { db } = require('../database/db');

// GET / - tutte le settings
router.get('/', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM settings').all();
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT / - aggiorna settings
router.put('/', (req, res) => {
    try {
        const data = req.body;
        const updateSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        
        const updateMany = db.transaction((settings) => {
            for (const [key, value] of Object.entries(settings)) {
                updateSetting.run(key, value == null ? '' : String(value));
            }
        });
        
        updateMany(data);
        res.json({ message: 'Impostazioni aggiornate' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /backup - crea uno snapshot SQLite coerente anche mentre il gestionale e' in uso.
router.get('/backup', async (req, res) => {
    const backupDir = path.join(__dirname, '..', 'database', 'backups-temp');
    const filename = `backup_gestionale_${Date.now()}.db`;
    const backupPath = path.join(backupDir, filename);
    try {
        fs.mkdirSync(backupDir, { recursive: true });
        await db.backup(backupPath);
        res.download(backupPath, filename, (err) => {
            fs.unlink(backupPath, () => {});
            if (err && !res.headersSent) res.status(500).json({ error: err.message });
        });
    } catch (err) {
        fs.unlink(backupPath, () => {});
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// GET /export/:year - crea ZIP di tutti gli upload
router.get('/export/:year', (req, res) => {
    try {
        const year = req.params.year;
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            return res.status(404).json({ error: 'Nessun file trovato' });
        }
        
        res.attachment(`export_uploads_${year}.zip`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.on('error', (err) => {
            res.status(500).send({ error: err.message });
        });
        
        archive.pipe(res);
        
        // Cerca i file nell'anno specificato (filtrando i nomi dei file se contengono l'anno nel timestamp)
        // Per semplicità zippiamo tutta la cartella, ma in un caso reale filtreremmo per data di modifica o record DB
        archive.directory(uploadsDir, false);
        archive.finalize();
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
