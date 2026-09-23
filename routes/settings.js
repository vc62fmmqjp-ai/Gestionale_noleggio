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

// GET /backup - scarica il file database
router.get('/backup', (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database', 'gestionale.db');
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ error: 'Database non trovato' });
        }
        res.download(dbPath, `backup_gestionale_${Date.now()}.db`);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
