const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const { buildSafeUpdate } = require('../utils/safe-update');

const CUSTOMER_UPDATE_FIELDS = ['nome','cognome','codice_fiscale','partita_iva','telefono','email','indirizzo','data_nascita','luogo_nascita','doc_tipo','doc_categoria','doc_numero','doc_rilasciato_da','doc_rilasciato_il','doc_scadenza','patente_categoria','patente_numero','patente_rilasciata_da','patente_rilasciata_il','patente_scadenza','note'];
const CUSTOMER_DEADLINE_UPDATE_FIELDS = ['tipo','descrizione','data_scadenza','importo','completata','note'];

// Helper parameters
function getBindArray(obj) {
    return Object.values(obj).map(v => v === '' ? null : v);
}

// GET / - lista clienti
router.get('/', (req, res) => {
    try {
        const q = req.query.q;
        // Situazione contabile per cliente: totale dei noleggi (escluso le auto
        // sostitutive, senza valori economici) meno quanto realmente incassato.
        // saldo > 0 -> il cliente deve dei soldi; saldo < 0 -> ha credito.
        let query = `
            SELECT c.*,
                   COALESCE(tot.totale, 0) - COALESCE(pag.incassato, 0) AS saldo,
                   COALESCE(tot.totale, 0) - COALESCE(pag.incassato, 0) > 0 AS ha_debito
            FROM customers c
            LEFT JOIN (
                SELECT customer_id, SUM(totale) AS totale
                FROM contracts
                WHERE stato IN ('in_corso', 'concluso')
                  AND (tipo_impegno IS NULL OR tipo_impegno != 'sostitutiva')
                GROUP BY customer_id
            ) tot ON tot.customer_id = c.id
            LEFT JOIN (
                SELECT customer_id, COALESCE(SUM(CASE WHEN p.origine IS NULL OR p.origine != 'contratto' THEN p.importo ELSE 0 END), 0) AS incassato
                FROM payments p
                JOIN contracts co ON co.id = p.contract_id
                GROUP BY customer_id
            ) pag ON pag.customer_id = c.id
        `;
        let params = [];

        if (q) {
            query += ' WHERE c.nome LIKE ? OR c.cognome LIKE ? OR c.codice_fiscale LIKE ? OR c.telefono LIKE ?';
            const likeQ = `%${q}%`;
            params = [likeQ, likeQ, likeQ, likeQ];
        }
        query += ' ORDER BY c.cognome, c.nome';
        
        const customers = db.prepare(query).all(...params);
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id - dettaglio cliente
router.get('/:id', (req, res) => {
    try {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
        if (!customer) return res.status(404).json({ error: 'Cliente non trovato' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / - crea cliente
router.post('/', (req, res) => {
    try {
        const { nome, cognome, codice_fiscale, partita_iva, telefono, email, indirizzo, data_nascita, luogo_nascita, doc_tipo, doc_categoria, doc_numero, doc_rilasciato_da, doc_rilasciato_il, doc_scadenza, patente_categoria, patente_numero, patente_rilasciata_da, patente_rilasciata_il, patente_scadenza, note } = req.body;
        
        if (!nome || !cognome) {
            return res.status(400).json({ error: 'Nome e cognome sono obbligatori' });
        }

        const stmt = db.prepare(`
            INSERT INTO customers (nome, cognome, codice_fiscale, partita_iva, telefono, email, indirizzo, data_nascita, luogo_nascita, doc_tipo, doc_categoria, doc_numero, doc_rilasciato_da, doc_rilasciato_il, doc_scadenza, patente_categoria, patente_numero, patente_rilasciata_da, patente_rilasciata_il, patente_scadenza, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const info = stmt.run(nome, cognome, codice_fiscale, partita_iva, telefono, email, indirizzo, data_nascita, luogo_nascita, doc_tipo, doc_categoria, doc_numero, doc_rilasciato_da, doc_rilasciato_il, doc_scadenza, patente_categoria, patente_numero, patente_rilasciata_da, patente_rilasciata_il, patente_scadenza, note);
        
        res.status(201).json({ id: info.lastInsertRowid, message: 'Cliente creato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id - aggiorna cliente
router.put('/:id', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, CUSTOMER_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido da aggiornare' });

        const query = `UPDATE customers SET ${updateFields} WHERE id = ?`;
        const params = [...values, req.params.id];
        
        const info = db.prepare(query).run(...params);
        if (info.changes === 0) return res.status(404).json({ error: 'Cliente non trovato' });
        
        res.json({ message: 'Cliente aggiornato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id - elimina cliente
router.delete('/:id', (req, res) => {
    try {
        // Preserva lo storico: un cliente collegato a contratti o allegati non va cancellato.
        const contracts = db.prepare('SELECT count(*) as cnt FROM contracts WHERE customer_id = ?').get(req.params.id).cnt;
        const uploads = db.prepare("SELECT count(*) as cnt FROM uploads WHERE entity_type = 'customer' AND entity_id = ?").get(req.params.id).cnt;
        if (contracts > 0 || uploads > 0) {
            return res.status(400).json({ error: 'Impossibile eliminare: il cliente ha uno storico o degli allegati. Puoi invece modificarne i dati.' });
        }
        
        const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Cliente non trovato' });
        
        res.json({ message: 'Cliente eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/contracts
router.get('/:id/contracts', (req, res) => {
    try {
        const contracts = db.prepare(`
            SELECT c.*, v.targa, v.marca, v.modello,
                   (SELECT COALESCE(SUM(importo), 0) FROM payments p
                    WHERE p.contract_id = c.id AND (p.origine IS NULL OR p.origine != 'contratto')) AS incassato
            FROM contracts c
            LEFT JOIN vehicles v ON c.vehicle_id = v.id
            WHERE c.customer_id = ?
            ORDER BY c.data_partenza DESC
        `).all(req.params.id).map(row => ({ ...row, residuo: Math.max(0, Number(row.totale || 0) - Number(row.incassato || 0)) }));
        res.json(contracts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/scadenze - scadenzario fiscale del cliente
router.get('/:id/scadenze', (req, res) => {
    try {
        const scadenze = db.prepare(`
            SELECT * FROM customer_scadenze
            WHERE customer_id = ?
            ORDER BY completata ASC, data_scadenza ASC, id DESC
        `).all(req.params.id);
        res.json(scadenze);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/scadenze - nuova scadenza fiscale
router.post('/:id/scadenze', (req, res) => {
    try {
        const { tipo, descrizione, data_scadenza, importo, note } = req.body;
        if (!data_scadenza) return res.status(400).json({ error: 'La data di scadenza è obbligatoria' });
        const info = db.prepare(`
            INSERT INTO customer_scadenze (customer_id, tipo, descrizione, data_scadenza, importo, note)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.params.id, tipo || 'altro', descrizione || null, data_scadenza, importo || null, note || null);
        res.status(201).json({ id: info.lastInsertRowid, message: 'Scadenza aggiunta' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/scadenze/:sid - aggiorna / segna completata
router.put('/:id/scadenze/:sid', (req, res) => {
    try {
        const { clause: updateFields, values } = buildSafeUpdate(req.body, CUSTOMER_DEADLINE_UPDATE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido da aggiornare' });
        const info = db.prepare(`UPDATE customer_scadenze SET ${updateFields} WHERE id = ? AND customer_id = ?`).run(...values, req.params.sid, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'Scadenza non trovata' });
        res.json({ message: 'Scadenza aggiornata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id/scadenze/:sid
router.delete('/:id/scadenze/:sid', (req, res) => {
    try {
        const info = db.prepare('DELETE FROM customer_scadenze WHERE id = ?').run(req.params.sid);
        if (info.changes === 0) return res.status(404).json({ error: 'Scadenza non trovata' });
        res.json({ message: 'Scadenza eliminata' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/finances
router.get('/:id/finances', (req, res) => {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as contracts_count,
                SUM(totale) as total_spent,
                MAX(data_partenza) as last_contract_date
            FROM contracts
            WHERE customer_id = ? AND stato != 'prenotazione'
        `).get(req.params.id);
        
        res.json({
            contracts_count: stats.contracts_count || 0,
            total_spent: stats.total_spent || 0,
            last_contract_date: stats.last_contract_date || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
