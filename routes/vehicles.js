const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { buildSafeUpdate } = require('../utils/safe-update');

const VEHICLE_UPDATE_FIELDS = ['targa','marca','modello','versione','alimentazione','nr_posti','portata_utile','colore','anno','km_attuali','stato','note'];
const VEHICLE_DEADLINE_UPDATE_FIELDS = ['tipo','data_scadenza','note','completata'];

// GET / - lista veicoli
router.get('/', (req, res) => {
    try {
        const { stato, search } = req.query;
        let query = 'SELECT * FROM vehicles WHERE 1=1';
        const params = [];

        if (stato) {
            query += ' AND stato = ?';
            params.push(stato);
        }

        if (search) {
            query += ' AND (targa LIKE ? OR marca LIKE ? OR modello LIKE ?)';
            const likeS = `%${search}%`;
            params.push(likeS, likeS, likeS);
        }

        const vehicles = db.prepare(query).all(...params);
        res.json(vehicles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id - dettaglio veicolo
router.get('/:id', (req, res) => {
    try {
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
        if (!vehicle) return res.status(404).json({ error: 'Veicolo non trovato' });
        res.json(vehicle);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / - crea veicolo
router.post('/', (req, res) => {
    try {
        const { targa, marca, modello, versione, alimentazione, nr_posti, portata_utile, colore, anno, km_attuali, stato, note } = req.body;
        
        if (!targa) return res.status(400).json({ error: 'Targa obbligatoria' });

        const stmt = db.prepare(`
            INSERT INTO vehicles (targa, marca, modello, versione, alimentazione, nr_posti, portata_utile, colore, anno, km_attuali, stato, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(targa, marca, modello, versione, alimentazione, nr_posti, portata_utile, colore, anno, km_attuali || 0, stato || 'disponibile', note);
        
        res.status(201).json({ id: info.lastInsertRowid, message: 'Veicolo creato' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Targa già esistente' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id - aggiorna veicolo
router.put('/:id', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, VEHICLE_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido da aggiornare' });

        const query = `UPDATE vehicles SET ${updateFields} WHERE id = ?`;
        const params = [...values, req.params.id];
        
        const info = db.prepare(query).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Veicolo non trovato' });
        
        res.json({ message: 'Veicolo aggiornato' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Targa già esistente' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id - elimina veicolo
router.delete('/:id', (req, res) => {
    try {
        const linked = {
            contracts: db.prepare('SELECT count(*) as cnt FROM contracts WHERE vehicle_id = ?').get(req.params.id).cnt,
            maintenance: db.prepare('SELECT count(*) as cnt FROM maintenance WHERE vehicle_id = ?').get(req.params.id).cnt,
            deadlines: db.prepare('SELECT count(*) as cnt FROM vehicles_scadenze WHERE vehicle_id = ?').get(req.params.id).cnt,
            payments: db.prepare('SELECT count(*) as cnt FROM payments WHERE vehicle_id = ?').get(req.params.id).cnt,
            expenses: db.prepare('SELECT count(*) as cnt FROM expenses WHERE vehicle_id = ?').get(req.params.id).cnt,
            uploads: db.prepare("SELECT count(*) as cnt FROM uploads WHERE entity_type = 'vehicle' AND entity_id = ?").get(req.params.id).cnt
        };
        if (Object.values(linked).some(count => count > 0)) {
            return res.status(400).json({ error: 'Impossibile eliminare: il veicolo ha uno storico, movimenti o allegati. Puoi impostarlo come fuori servizio.' });
        }
        
        const info = db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Veicolo non trovato' });
        
        res.json({ message: 'Veicolo eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/contracts
router.get('/:id/contracts', (req, res) => {
    try {
        const contracts = db.prepare(`
            SELECT c.*, cu.nome, cu.cognome
            FROM contracts c
            LEFT JOIN customers cu ON c.customer_id = cu.id
            WHERE c.vehicle_id = ?
            ORDER BY c.data_partenza DESC
        `).all(req.params.id);
        res.json(contracts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/finances
router.get('/:id/finances', (req, res) => {
    try {
        const income = db.prepare('SELECT SUM(importo) as total FROM payments WHERE vehicle_id = ?').get(req.params.id).total || 0;
        const expenses = db.prepare('SELECT SUM(importo) as total FROM expenses WHERE vehicle_id = ?').get(req.params.id).total || 0;
        const contracts_count = db.prepare('SELECT count(*) as cnt FROM contracts WHERE vehicle_id = ?').get(req.params.id).cnt;
        
        res.json({
            total_income: income,
            total_expenses: expenses,
            margin: income - expenses,
            contracts_count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/maintenance
router.get('/:id/maintenance', (req, res) => {
    try {
        const maints = db.prepare('SELECT * FROM maintenance WHERE vehicle_id = ? ORDER BY data DESC').all(req.params.id);
        res.json(maints);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/scadenze
router.get('/:id/scadenze', (req, res) => {
    try {
        const scadenze = db.prepare('SELECT * FROM vehicles_scadenze WHERE vehicle_id = ? ORDER BY data_scadenza ASC').all(req.params.id);
        res.json(scadenze);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/scadenze
router.post('/:id/scadenze', (req, res) => {
    try {
        const { tipo, data_scadenza, note } = req.body;
        const info = db.prepare('INSERT INTO vehicles_scadenze (vehicle_id, tipo, data_scadenza, note) VALUES (?, ?, ?, ?)')
                       .run(req.params.id, tipo, data_scadenza, note);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Scadenza aggiunta' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/scadenze/:sid
router.put('/:id/scadenze/:sid', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, VEHICLE_DEADLINE_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido' });
        
        const params = [...values, req.params.sid, req.params.id];
        const info = db.prepare(`UPDATE vehicles_scadenze SET ${updateFields} WHERE id = ? AND vehicle_id = ?`).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Scadenza non trovata' });
        res.json({ message: 'Scadenza aggiornata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id/scadenze/:sid
router.delete('/:id/scadenze/:sid', (req, res) => {
    try {
        const info = db.prepare('DELETE FROM vehicles_scadenze WHERE id = ? AND vehicle_id = ?').run(req.params.sid, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Scadenza non trovata' });
        res.json({ message: 'Scadenza eliminata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
