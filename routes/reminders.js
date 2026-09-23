const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

// GET / - tutti i reminder attivi
router.get('/', (req, res) => {
    try {
        const today = new Date();
        const threeDaysStr = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const thirtyDaysStr = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        const reminders = [];

        // 1. Contratti che scadono nei prossimi 3 giorni
        const contracts = db.prepare(`
            SELECT c.id, c.numero_contratto, c.data_rientro_previsto, cu.nome, cu.cognome, v.targa
            FROM contracts c
            JOIN customers cu ON c.customer_id = cu.id
            JOIN vehicles v ON c.vehicle_id = v.id
            WHERE c.data_rientro_previsto >= ? AND c.data_rientro_previsto <= ? AND c.stato = 'in_corso'
        `).all(todayStr, threeDaysStr);

        contracts.forEach(c => {
            reminders.push({
                type: 'contract_end',
                message: `Contratto ${c.numero_contratto} (${c.nome} ${c.cognome} - Targa: ${c.targa}) in scadenza`,
                date: c.data_rientro_previsto,
                urgency: 'high',
                entity_type: 'contract',
                entity_id: c.id
            });
        });

        // 2. Veicoli con scadenze nei prossimi 30 giorni
        const scadenze = db.prepare(`
            SELECT vs.id, vs.tipo, vs.data_scadenza, v.targa, v.id as vehicle_id
            FROM vehicles_scadenze vs
            JOIN vehicles v ON vs.vehicle_id = v.id
            WHERE vs.data_scadenza >= ? AND vs.data_scadenza <= ? AND vs.completata = 0
        `).all(todayStr, thirtyDaysStr);

        scadenze.forEach(s => {
            reminders.push({
                type: 'vehicle_deadline',
                message: `Scadenza ${s.tipo} per veicolo ${s.targa}`,
                date: s.data_scadenza,
                urgency: 'medium',
                entity_type: 'vehicle',
                entity_id: s.vehicle_id
            });
        });

        // 3. Manutenzioni non completate con data_prossima nei prossimi 30 giorni
        const maintenance = db.prepare(`
            SELECT m.id, m.tipo, m.data_prossima, v.targa, v.id as vehicle_id
            FROM maintenance m
            JOIN vehicles v ON m.vehicle_id = v.id
            WHERE m.data_prossima >= ? AND m.data_prossima <= ? AND m.completato = 0
        `).all(todayStr, thirtyDaysStr);

        maintenance.forEach(m => {
            reminders.push({
                type: 'maintenance_due',
                message: `Manutenzione (${m.tipo}) programmata per veicolo ${m.targa}`,
                date: m.data_prossima,
                urgency: 'medium',
                entity_type: 'vehicle',
                entity_id: m.vehicle_id
            });
        });

        // Sort by date ascending
        reminders.sort((a, b) => a.date.localeCompare(b.date));

        res.json(reminders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
