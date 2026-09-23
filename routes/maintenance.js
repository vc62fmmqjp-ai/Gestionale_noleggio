const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

function maintenanceDescription(data) {
    return ['Manutenzione', data.tipo, data.descrizione].filter(Boolean).join(': ');
}

function syncMaintenanceExpense(maintenance) {
    const cost = Number(maintenance.costo) || 0;
    const existing = db.prepare('SELECT id FROM expenses WHERE maintenance_id = ?').get(maintenance.id);
    if (cost <= 0) {
        if (existing) db.prepare('DELETE FROM expenses WHERE id = ?').run(existing.id);
        return;
    }
    const values = [maintenance.vehicle_id, maintenance.data, 'manutenzione', maintenanceDescription(maintenance), cost, maintenance.officina || null, maintenance.note || null, maintenance.id];
    if (existing) {
        db.prepare('UPDATE expenses SET vehicle_id = ?, data_spesa = ?, tipo = ?, descrizione = ?, importo = ?, officina = ?, note = ? WHERE maintenance_id = ?').run(...values);
    } else {
        db.prepare('INSERT INTO expenses (vehicle_id, data_spesa, tipo, descrizione, importo, officina, note, maintenance_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(...values);
    }
}

// GET /
router.get('/', (req, res) => {
    try {
        const { vehicle_id } = req.query;
        let query = `
            SELECT m.*, v.targa, v.marca, v.modello
            FROM maintenance m
            JOIN vehicles v ON m.vehicle_id = v.id
        `;
        const params = [];
        if (vehicle_id) {
            query += ' WHERE m.vehicle_id = ?';
            params.push(vehicle_id);
        }
        query += ' ORDER BY m.data DESC';
        const maint = db.prepare(query).all(...params);
        res.json(maint);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /upcoming
router.get('/upcoming', (req, res) => {
    try {
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);
        
        const todayStr = today.toISOString().split('T')[0];
        const endStr = thirtyDaysFromNow.toISOString().split('T')[0];

        const maint = db.prepare(`
            SELECT m.*, v.targa, 'manutenzione' as table_type 
            FROM maintenance m
            JOIN vehicles v ON m.vehicle_id = v.id
            WHERE m.data_prossima >= ? AND m.data_prossima <= ? AND m.completato = 0
        `).all(todayStr, endStr);

        const scadenze = db.prepare(`
            SELECT s.id, s.vehicle_id, s.tipo, s.data_scadenza as data_prossima, s.note, v.targa, 'scadenza' as table_type
            FROM vehicles_scadenze s
            JOIN vehicles v ON s.vehicle_id = v.id
            WHERE s.data_scadenza >= ? AND s.data_scadenza <= ? AND s.completata = 0
        `).all(todayStr, endStr);

        const result = [...maint, ...scadenze].sort((a, b) => a.data_prossima.localeCompare(b.data_prossima));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /
router.post('/', (req, res) => {
    try {
        const { vehicle_id, tipo, descrizione, data, data_prossima, km, km_prossimo, costo, officina, completato, note } = req.body;
        const info = db.prepare(`
            INSERT INTO maintenance (vehicle_id, tipo, descrizione, data, data_prossima, km, km_prossimo, costo, officina, completato, note) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(vehicle_id, tipo, descrizione, data, data_prossima, km, km_prossimo, costo, officina, completato || 0, note);
        
        const maintenance = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(info.lastInsertRowid);
        syncMaintenanceExpense(maintenance);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Manutenzione creata e spesa aggiornata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id
router.put('/:id', (req, res) => {
    try {
        const updateFields = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo' });
        
        const params = [...Object.values(req.body), req.params.id];
        const info = db.prepare(`UPDATE maintenance SET ${updateFields} WHERE id = ?`).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovata' });
        const maintenance = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(req.params.id);
        syncMaintenanceExpense(maintenance);
        res.json({ message: 'Manutenzione e spesa aggiornata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM expenses WHERE maintenance_id = ?').run(req.params.id);
        const info = db.prepare('DELETE FROM maintenance WHERE id = ?').run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovata' });
        res.json({ message: 'Manutenzione eliminata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
