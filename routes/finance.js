const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { buildSafeUpdate } = require('../utils/safe-update');

const PAYMENT_UPDATE_FIELDS = ['contract_id','vehicle_id','data_pagamento','importo','metodo','note'];
const EXPENSE_UPDATE_FIELDS = ['vehicle_id','data_spesa','tipo','descrizione','importo','officina','note'];

// GET /summary
router.get('/summary', (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear().toString();
        
        const incomeQuery = db.prepare(`SELECT SUM(importo) as total FROM payments WHERE substr(data_pagamento, 1, 4) = ?`).get(year);
        const expenseQuery = db.prepare(`SELECT SUM(importo) as total FROM expenses WHERE substr(data_spesa, 1, 4) = ?`).get(year);
        
        const total_income = incomeQuery.total || 0;
        const total_expenses = expenseQuery.total || 0;
        
        const monthly_breakdown = [];
        for (let i = 1; i <= 12; i++) {
            const monthStr = i.toString().padStart(2, '0');
            const likeStr = `${year}-${monthStr}%`;
            
            const mi = db.prepare(`SELECT SUM(importo) as total FROM payments WHERE data_pagamento LIKE ?`).get(likeStr).total || 0;
            const me = db.prepare(`SELECT SUM(importo) as total FROM expenses WHERE data_spesa LIKE ?`).get(likeStr).total || 0;
            
            monthly_breakdown.push({
                month: monthStr,
                income: mi,
                expenses: me
            });
        }
        
        res.json({
            total_income,
            total_expenses,
            margin: total_income - total_expenses,
            monthly_breakdown
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /due - scadenzario: importo del contratto, somme ricevute e residuo.
router.get('/due', (req, res) => {
    try {
        const due = db.prepare(`
            SELECT c.id AS contract_id, c.numero_contratto, c.data_partenza,
                   COALESCE(NULLIF(c.data_scadenza_pagamento, ''), c.data_partenza) AS data_scadenza,
                   c.totale, c.vehicle_id, cu.nome, cu.cognome, v.targa,
                   COALESCE(SUM(CASE WHEN p.origine IS NULL OR p.origine != 'contratto' THEN p.importo ELSE 0 END), 0) AS incassato
            FROM contracts c
            LEFT JOIN customers cu ON cu.id = c.customer_id
            LEFT JOIN vehicles v ON v.id = c.vehicle_id
            LEFT JOIN payments p ON p.contract_id = c.id
            WHERE c.stato != 'annullato' AND c.totale > 0
            GROUP BY c.id
            HAVING c.totale - incassato > 0.004
            ORDER BY data_scadenza ASC, c.id DESC
        `).all().map(row => ({ ...row, residuo: Math.max(0, Number(row.totale) - Number(row.incassato)) }));
        res.json(due);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /vehicle/:id
router.get('/vehicle/:id', (req, res) => {
    try {
        const vid = req.params.id;
        const vehicle = db.prepare('SELECT id, targa, marca, modello FROM vehicles WHERE id = ?').get(vid);
        if (!vehicle) return res.status(404).json({ error: 'Veicolo non trovato' });
        const total_income = db.prepare('SELECT SUM(importo) as t FROM payments WHERE vehicle_id = ?').get(vid).t || 0;
        const total_expenses = db.prepare('SELECT SUM(importo) as t FROM expenses WHERE vehicle_id = ?').get(vid).t || 0;
        
        res.json({
            vehicle_id: vid,
            vehicle,
            total_income,
            total_expenses,
            margin: total_income - total_expenses,
            payments: db.prepare('SELECT p.*, c.numero_contratto, cu.nome, cu.cognome FROM payments p LEFT JOIN contracts c ON p.contract_id = c.id LEFT JOIN customers cu ON c.customer_id = cu.id WHERE p.vehicle_id = ? ORDER BY p.data_pagamento DESC').all(vid),
            expenses: db.prepare('SELECT * FROM expenses WHERE vehicle_id = ? ORDER BY data_spesa DESC').all(vid)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /payments
router.get('/payments', (req, res) => {
    try {
        const { contract_id, from, to } = req.query;
        let query = `
            SELECT p.*, c.numero_contratto, cu.nome, cu.cognome, v.targa
            FROM payments p
            LEFT JOIN contracts c ON p.contract_id = c.id
            LEFT JOIN customers cu ON c.customer_id = cu.id
            LEFT JOIN vehicles v ON p.vehicle_id = v.id
            WHERE 1=1
        `;
        const params = [];

        if (contract_id) { query += ' AND p.contract_id = ?'; params.push(contract_id); }
        if (from) { query += ' AND p.data_pagamento >= ?'; params.push(from); }
        if (to) { query += ' AND p.data_pagamento <= ?'; params.push(to); }
        
        query += ' ORDER BY p.data_pagamento DESC';
        const payments = db.prepare(query).all(...params);
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /payments
router.get('/payments/:id', (req, res) => {
    try {
        const payment = db.prepare(`
            SELECT p.*, c.numero_contratto, cu.nome, cu.cognome, v.targa
            FROM payments p
            LEFT JOIN contracts c ON p.contract_id = c.id
            LEFT JOIN customers cu ON c.customer_id = cu.id
            LEFT JOIN vehicles v ON p.vehicle_id = v.id
            WHERE p.id = ?
        `).get(req.params.id);
        if (!payment) return res.status(404).json({ error: 'Pagamento non trovato' });
        res.json(payment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/payments', (req, res) => {
    try {
        const { contract_id, vehicle_id, data_pagamento, importo, metodo, note } = req.body;
        const info = db.prepare(`INSERT INTO payments (contract_id, vehicle_id, data_pagamento, importo, metodo, note) VALUES (?, ?, ?, ?, ?, ?)`)
                       .run(contract_id || null, vehicle_id || null, data_pagamento, importo, metodo, note);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Pagamento registrato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /payments/:id
router.put('/payments/:id', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, PAYMENT_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido' });
        
        const params = [...values, req.params.id];
        const info = db.prepare(`UPDATE payments SET ${updateFields} WHERE id = ?`).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovato' });
        res.json({ message: 'Pagamento aggiornato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /payments/:id
router.delete('/payments/:id', (req, res) => {
    try {
        const info = db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovato' });
        res.json({ message: 'Pagamento eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /expenses
router.get('/expenses', (req, res) => {
    try {
        const { vehicle_id, tipo, from, to } = req.query;
        let query = `
            SELECT e.*, v.targa, v.marca, v.modello
            FROM expenses e
            LEFT JOIN vehicles v ON e.vehicle_id = v.id
            WHERE 1=1
        `;
        const params = [];
        
        if (vehicle_id) { query += ' AND e.vehicle_id = ?'; params.push(vehicle_id); }
        if (tipo) { query += ' AND e.tipo = ?'; params.push(tipo); }
        if (from) { query += ' AND e.data_spesa >= ?'; params.push(from); }
        if (to) { query += ' AND e.data_spesa <= ?'; params.push(to); }
        
        query += ' ORDER BY e.data_spesa DESC';
        const expenses = db.prepare(query).all(...params);
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /expenses
router.get('/expenses/:id', (req, res) => {
    try {
        const expense = db.prepare(`
            SELECT e.*, v.targa, v.marca, v.modello
            FROM expenses e
            LEFT JOIN vehicles v ON e.vehicle_id = v.id
            WHERE e.id = ?
        `).get(req.params.id);
        if (!expense) return res.status(404).json({ error: 'Spesa non trovata' });
        res.json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/expenses', (req, res) => {
    try {
        const { vehicle_id, data_spesa, tipo, descrizione, importo, officina, note } = req.body;
        const info = db.prepare(`INSERT INTO expenses (vehicle_id, data_spesa, tipo, descrizione, importo, officina, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                       .run(vehicle_id || null, data_spesa, tipo, descrizione, importo, officina, note);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Spesa registrata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /expenses/:id
router.put('/expenses/:id', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, EXPENSE_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido' });
        
        const params = [...values, req.params.id];
        const info = db.prepare(`UPDATE expenses SET ${updateFields} WHERE id = ?`).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovata' });
        res.json({ message: 'Spesa aggiornata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /expenses/:id
router.delete('/expenses/:id', (req, res) => {
    try {
        const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Non trovata' });
        res.json({ message: 'Spesa eliminata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /export/csv
router.get('/export/csv', (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear().toString();
        const payments = db.prepare(`SELECT data_pagamento as Data, 'Entrata' as Tipo, importo as Importo, metodo as Metodo, note as Note FROM payments WHERE substr(data_pagamento, 1, 4) = ?`).all(year);
        const expenses = db.prepare(`SELECT data_spesa as Data, 'Uscita' as Tipo, importo as Importo, tipo as Metodo, note as Note FROM expenses WHERE substr(data_spesa, 1, 4) = ?`).all(year);
        
        const all = [...payments, ...expenses].sort((a, b) => a.Data.localeCompare(b.Data));
        
        let csv = 'Data,Tipo,Importo,Metodo/Categoria,Note\n';
        all.forEach(r => {
            csv += `${r.Data},${r.Tipo},${r.Importo},"${r.Metodo || ''}","${r.Note || ''}"\n`;
        });
        
        res.header('Content-Type', 'text/csv');
        res.attachment(`Export_Finanze_${year}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
