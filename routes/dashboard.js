const express = require('express');
const router = express.Router();
const { db } = require('../database/db');

router.get('/', (req, res) => {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const monthStr = todayStr.substring(0, 7); // YYYY-MM

        // Fleet stats
        const fleetTotal = db.prepare('SELECT count(*) as cnt FROM vehicles').get().cnt;
        const fleetAvailable = db.prepare("SELECT count(*) as cnt FROM vehicles WHERE stato='disponibile'").get().cnt;
        const fleetRented = db.prepare("SELECT count(*) as cnt FROM vehicles WHERE stato='noleggiato'").get().cnt;
        const fleetMaint = db.prepare("SELECT count(*) as cnt FROM vehicles WHERE stato='manutenzione'").get().cnt;
        const fleetSostituzione = db.prepare("SELECT count(*) as cnt FROM vehicles WHERE stato='sostituzione'").get().cnt;

        // Today contracts.
        // partenze_da_fare -> prenotazioni con partenza oggi (da fare il check di uscita)
        // partenze_fatte    -> noleggi partiti oggi (check di uscita fatto)
        // rientri_da_fare   -> noleggi in corso con rientro previsto oggi (da fare il check-in)
        // rientri_fatti     -> contratti conclusi con arrivo oggi (check-in fatto)
        const todayMovements = (where, params) => db.prepare(`
            SELECT c.*, cu.nome, cu.cognome, v.targa,
                   (SELECT COALESCE(SUM(CASE WHEN p.origine IS NULL OR p.origine != 'contratto' THEN p.importo ELSE 0 END), 0)
                    FROM payments p WHERE p.contract_id = c.id) AS incassato
            FROM contracts c
            JOIN customers cu ON c.customer_id = cu.id
            JOIN vehicles v ON c.vehicle_id = v.id
            WHERE ${where}
        `).all(...params).map(row => ({ ...row, residuo: Math.max(0, Number(row.totale || 0) - Number(row.incassato || 0)) }));

        const partenzeDaFare = todayMovements("c.data_partenza = ? AND c.stato = 'prenotazione'", [todayStr]);
        const partenzeFatte = todayMovements("c.data_partenza = ? AND c.stato = 'in_corso'", [todayStr]);
        const rientriDaFare = todayMovements("c.data_rientro_previsto = ? AND c.stato = 'in_corso'", [todayStr]);
        const rientriFatti = todayMovements("c.data_arrivo = ? AND c.stato = 'concluso'", [todayStr]);

        // Scaduti: impegni non completati passati al giorno dopo.
        // Vengono spostati di giorno in giorno nella sezione "Scaduti" della dashboard.
        const partenzeScadute = todayMovements("c.data_partenza < ? AND c.stato = 'prenotazione'", [todayStr]);
        const rientriScaduti = todayMovements("c.data_rientro_previsto < ? AND c.stato = 'in_corso'", [todayStr]);

        // Active contracts
        const activeContracts = db.prepare("SELECT count(*) as cnt FROM contracts WHERE stato='in_corso'").get().cnt;

        // Monthly stats
        const monthlyIncome = db.prepare('SELECT SUM(importo) as tot FROM payments WHERE data_pagamento LIKE ?').get(`${monthStr}%`).tot || 0;
        const monthlyExpenses = db.prepare('SELECT SUM(importo) as tot FROM expenses WHERE data_spesa LIKE ?').get(`${monthStr}%`).tot || 0;
        const monthlyMargin = monthlyIncome - monthlyExpenses;

        // Monthly breakdown (last 6 months)
        const monthlyBreakdown = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = (d.getMonth() + 1).toString().padStart(2, '0');
            const prefix = `${y}-${m}`;
            
            const inc = db.prepare('SELECT SUM(importo) as tot FROM payments WHERE data_pagamento LIKE ?').get(`${prefix}%`).tot || 0;
            const exp = db.prepare('SELECT SUM(importo) as tot FROM expenses WHERE data_spesa LIKE ?').get(`${prefix}%`).tot || 0;
            
            monthlyBreakdown.push({ month: prefix, income: inc, expenses: exp });
        }

        // Upcoming reminders (simulate reminder route logic for next 10)
        const tenDaysStr = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const reminders = [];
        const scadenze = db.prepare(`
            SELECT vs.tipo, vs.data_scadenza, v.targa
            FROM vehicles_scadenze vs
            JOIN vehicles v ON vs.vehicle_id = v.id
            WHERE vs.data_scadenza >= ? AND vs.data_scadenza <= ? AND vs.completata = 0
            LIMIT 10
        `).all(todayStr, tenDaysStr);
        
        scadenze.forEach(s => {
            reminders.push({
                type: 'vehicle_deadline',
                message: `Scadenza ${s.tipo} - ${s.targa}`,
                date: s.data_scadenza
            });
        });

        // Impegni previsti per domani e dopodomani (partenze in prenotazione, rientri in corso).
        const addDaysISO = (base, days) => {
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
            return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        };
        const day1 = addDaysISO(today, 1);
        const day2 = addDaysISO(today, 2);
        const impegni = db.prepare(`
            SELECT c.data_partenza AS partenza, c.data_rientro_previsto AS rientro, c.numero_contratto, cu.nome, cu.cognome, v.targa
            FROM contracts c
            JOIN customers cu ON c.customer_id = cu.id
            JOIN vehicles v ON c.vehicle_id = v.id
            WHERE (c.stato = 'prenotazione' AND c.data_partenza IN (?, ?))
               OR (c.stato = 'in_corso' AND c.data_rientro_previsto IN (?, ?))
            ORDER BY COALESCE(c.data_rientro_previsto, c.data_partenza)
        `).all(day1, day2, day1, day2);

        impegni.forEach(c => {
            const cliente = [c.cognome, c.nome].filter(Boolean).join(' ');
            if (c.partenza && (c.partenza === day1 || c.partenza === day2)) {
                reminders.push({ type: 'partenza', message: `Partenza ${c.targa} - ${cliente}`, date: c.partenza });
            } else if (c.rientro) {
                reminders.push({ type: 'rientro', message: `Rientro ${c.targa} - ${cliente}`, date: c.rientro });
            }
        });

        reminders.sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            fleet: {
                total: fleetTotal,
                available: fleetAvailable,
                rented: fleetRented,
                maintenance: fleetMaint,
                sostituzione: fleetSostituzione
            },
            today_contracts_start: partenzeDaFare,
            today_contracts_end: rientriDaFare,
            partenze_da_fare: partenzeDaFare,
            partenze_fatte: partenzeFatte,
            rientri_da_fare: rientriDaFare,
            rientri_fatti: rientriFatti,
            partenze_scadute: partenzeScadute,
            rientri_scaduti: rientriScaduti,
            upcoming_reminders: reminders.slice(0, 15),
            monthly_income: monthlyIncome,
            monthly_expenses: monthlyExpenses,
            monthly_margin: monthlyMargin,
            active_contracts: activeContracts,
            monthly_breakdown: monthlyBreakdown
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
