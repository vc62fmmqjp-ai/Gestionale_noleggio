const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../database/db');
const { pickAllowedFields, buildSafeUpdate } = require('../utils/safe-update');

const CONTRACT_WRITE_FIELDS = [
    'numero_contratto','customer_id','vehicle_id','filiale_partenza','filiale_rientro','data_partenza','ora_partenza',
    'data_rientro_previsto','ora_rientro_previsto','data_arrivo','ora_arrivo','data_scadenza_pagamento','km_partenza','km_arrivo',
    'carburante_partenza','carburante_arrivo','giorni_tariffa','importo_giorno','giorni_max','extra_giorno','km_inclusi','extra_km',
    'ritardo_consentito','carburante_costo','franchigia_rca_noleggiatore','franchigia_rca_cliente','franchigia_kasko_noleggiatore',
    'franchigia_kasko_cliente','franchigia_furto_noleggiatore','franchigia_furto_cliente','kasko_inclusa','kasko_prezzo',
    'secondo_conducente_nome','secondo_conducente_doc_tipo','secondo_conducente_doc_numero','secondo_conducente_doc_categoria',
    'secondo_conducente_doc_rilasciato_da','secondo_conducente_doc_rilasciato_il','secondo_conducente_doc_scadenza',
    'optionals','note','stato','imponibile','iva','totale','deposito_cauzionale','dettagli_assegno','pdf_filename','tipo_impegno','prolungamento_di'
];

const contractsDir = path.join(__dirname, '..', 'contratti');

function ensureContractsDir() {
    if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir, { recursive: true });
    }
}

function sanitizeFilenamePart(value) {
    return String(value || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function shortItalianDate(value) {
    const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 'senza data';
    return `${match[3]}.${match[2]}.${match[1].slice(-2)}`;
}

function basePdfFilename(contract) {
    const fullName = sanitizeFilenamePart([contract.nome, contract.cognome].filter(Boolean).join(' ')) || 'Cliente';
    return `${fullName} ${shortItalianDate(contract.data_partenza)}.pdf`;
}

function uniquePdfFilename(contract) {
    ensureContractsDir();
    const base = basePdfFilename(contract);
    const current = contract.pdf_filename ? path.basename(contract.pdf_filename) : null;
    if (current === base) return base;

    const stem = base.replace(/\.pdf$/i, '');
    let candidate = base;
    let counter = 2;

    while (true) {
        const usedByAnotherContract = db.prepare(
            'SELECT id FROM contracts WHERE pdf_filename = ? AND id != ? LIMIT 1'
        ).get(candidate, contract.id);
        const fileExists = fs.existsSync(path.join(contractsDir, candidate));
        const isOwnOldFile = current === candidate;
        if (!usedByAnotherContract && (!fileExists || isOwnOldFile)) return candidate;
        candidate = `${stem} (${counter}).pdf`;
        counter += 1;
    }
}

function safeStoredPdfPath(filename) {
    if (!filename) return null;
    const safeName = path.basename(filename);
    return path.join(contractsDir, safeName);
}

// Helper per auto-generare numero contratto
function generateContractNumber() {
    const year = new Date().getFullYear();
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'next_contract_number'").get();
    let num = setting ? parseInt(setting.value) : 1;
    const nextNum = num + 1;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'next_contract_number'").run(nextNum.toString());
    
    return `ACB-${year}-${num.toString().padStart(4, '0')}`;
}

// Un contratto "sostitutiva" e' l'auto ceduta in sostituzione a un cliente
// (es. vettura in riparazione): la vettura risulta impegnata ma non vengono
// richiesti documenti e pagamenti.
function isSostitutiva(data) {
    return (data.tipo_impegno || 'noleggio') === 'sostitutiva';
}

// Ogni volta che un contratto va in corso la vettura assume lo stato coerente
// con il tipo di impegno: 'noleggiato' per un noleggio, 'sostituzione' per
// un'auto sostitutiva.
function activeVehicleState(data) {
    return isSostitutiva(data) ? 'sostituzione' : 'noleggiato';
}

// Contratto generato da "Prolunga": e' il proseguo diretto del contratto dato.
function findFollowingContract(contractId) {
    return db.prepare('SELECT * FROM contracts WHERE prolungamento_di = ? ORDER BY id DESC LIMIT 1').get(contractId);
}

// Tutta la catena di prolungamenti collegata a un contratto, in ordine:
// [contratto originale, eventuali prosecuzioni intermedie, ... fino all'ultima].
// Serve per chiudere al rientro tutti i contratti collegati e per mostrare
// il promemoria di firma del nuovo contratto.
function getProlungaChain(contractId) {
    const starter = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!starter) return [];
    const seen = new Set([Number(starter.id)]);
    const antecedenti = [];
    let cursor = starter;
    while (cursor.prolungamento_di && !seen.has(Number(cursor.prolungamento_di))) {
        const prev = db.prepare('SELECT * FROM contracts WHERE id = ?').get(cursor.prolungamento_di);
        if (!prev) break;
        seen.add(Number(prev.id));
        antecedenti.push(prev);
        cursor = prev;
    }
    antecedenti.reverse();
    const prosecuzioni = [];
    const childStmt = db.prepare('SELECT * FROM contracts WHERE prolungamento_di = ? ORDER BY id');
    let frontier = [Number(starter.id)];
    while (frontier.length) {
        const next = [];
        for (const fid of frontier) {
            for (const child of childStmt.all(fid)) {
                if (seen.has(Number(child.id))) continue;
                seen.add(Number(child.id));
                prosecuzioni.push(child);
                next.push(Number(child.id));
            }
        }
        frontier = next;
    }
    return [...antecedenti, starter, ...prosecuzioni];
}

function hasActiveProlungamento(contract) {
    return contract && contract.prolungamento_di && !['annullato', 'concluso'].includes(contract.stato);
}

// GET / - lista contratti
router.get('/', (req, res) => {
    try {
        const { stato, customer_id, vehicle_id, from, to } = req.query;
        let query = `
            SELECT c.*, cu.nome, cu.cognome, v.targa, v.marca, v.modello 
            FROM contracts c
            LEFT JOIN customers cu ON c.customer_id = cu.id
            LEFT JOIN vehicles v ON c.vehicle_id = v.id
            WHERE 1=1
        `;
        const params = [];

        if (stato) { query += ' AND c.stato = ?'; params.push(stato); }
        if (customer_id) { query += ' AND c.customer_id = ?'; params.push(customer_id); }
        if (vehicle_id) { query += ' AND c.vehicle_id = ?'; params.push(vehicle_id); }
        if (from) { query += ' AND c.data_partenza >= ?'; params.push(from); }
        if (to) { query += ' AND c.data_partenza <= ?'; params.push(to); }

        query += ' ORDER BY c.data_partenza DESC, c.id DESC';
        const contracts = db.prepare(query).all(...params);
        res.json(contracts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id - dettaglio
router.get('/:id(\\d+)', (req, res) => {
    try {
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contratto non trovato' });
        
        contract.customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(contract.customer_id);
        contract.vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(contract.vehicle_id);
        contract.incassato = Number(db.prepare("SELECT COALESCE(SUM(importo), 0) AS tot FROM payments WHERE contract_id = ? AND (origine IS NULL OR origine != 'contratto')").get(contract.id).tot) || 0;
        contract.residuo = Math.max(0, roundMoney(Number(contract.totale || 0) - Number(contract.incassato)));
        contract.prolungato_da = contract.prolungamento_di
            ? db.prepare('SELECT id, numero_contratto, data_rientro_previsto FROM contracts WHERE id = ?').get(contract.prolungamento_di) || null
            : null;
        contract.prolungato_in = findFollowingContract(contract.id) || null;
        contract.catena_prolungamento = getProlungaChain(contract.id).map(x => ({
            id: x.id,
            numero_contratto: x.numero_contratto,
            stato: x.stato,
            data_partenza: x.data_partenza,
            data_rientro_previsto: x.data_rientro_previsto,
            ora_rientro_previsto: x.ora_rientro_previsto,
            prolungamento_di: x.prolungamento_di
        }));
        
        res.json(contract);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function settingNumber(key, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    const value = parseFloat(row?.value);
    return Number.isFinite(value) ? value : fallback;
}

// Le tariffe inserite nel gestionale sono prezzi FINALI, gia comprensivi di IVA.
// L'imponibile e l'IVA vengono quindi scorporati dal totale, non aggiunti sopra.
function calculateTotals(data) {
    const giorni = parseFloat(data.giorni_tariffa) || 1;
    const importoGiorno = parseFloat(data.importo_giorno) || 0;
    const kasko = Number(data.kasko_inclusa) === 1 ? (parseFloat(data.kasko_prezzo) || 0) : 0;
    const ivaRate = settingNumber('iva_rate', 22);
    const totale = roundMoney((giorni * importoGiorno) + kasko);
    const imponibile = roundMoney(totale / (1 + ivaRate / 100));
    const iva = roundMoney(totale - imponibile);
    return { imponibile, iva, totale };
}

function removeLegacyAutomaticPayment(contractId) {
    db.prepare("DELETE FROM payments WHERE contract_id = ? AND origine = 'contratto'").run(contractId);
}

function updateVehicleStartingKm(vehicleId, km) {
    if (km === undefined || km === null || km === '' || !Number.isFinite(Number(km))) return;
    // Non riduce mai il contachilometri per errore, ma conserva il valore più alto registrato.
    db.prepare('UPDATE vehicles SET km_attuali = CASE WHEN km_attuali IS NULL OR ? > km_attuali THEN ? ELSE km_attuali END WHERE id = ?')
        .run(Number(km), Number(km), vehicleId);
}

// Con il servizio Kasko/Rinuncia rivalsa attivo, tutte le franchigie cliente
// mostrate nel contratto passano ai valori configurati per la Kasko (500 EUR di default).
function applyKaskoFranchises(data) {
    const active = Number(data.kasko_inclusa) === 1;
    data.franchigia_rca_noleggiatore = settingNumber('franchigia_rca_noleggiatore_default', 0);
    data.franchigia_kasko_noleggiatore = settingNumber('franchigia_kasko_noleggiatore_default', 0);
    data.franchigia_furto_noleggiatore = settingNumber('franchigia_furto_noleggiatore_default', 0);
    data.franchigia_rca_cliente = settingNumber(active ? 'franchigia_rca_cliente_kasko' : 'franchigia_rca_cliente_default', active ? 500 : 2500);
    data.franchigia_kasko_cliente = settingNumber(active ? 'franchigia_kasko_cliente_kasko' : 'franchigia_kasko_cliente_default', active ? 500 : 2500);
    data.franchigia_furto_cliente = settingNumber(active ? 'franchigia_furto_cliente_kasko' : 'franchigia_furto_cliente_default', active ? 500 : 2500);
    return data;
}

function validateContractReferences(data) {
    if (!data.customer_id || !db.prepare('SELECT id FROM customers WHERE id = ?').get(data.customer_id)) {
        return 'Cliente non valido';
    }
    if (!data.vehicle_id || !db.prepare('SELECT id FROM vehicles WHERE id = ?').get(data.vehicle_id)) {
        return 'Veicolo non valido';
    }
    return null;
}

function normalizeTime(value, fallback) {
    const text = String(value || fallback || '').trim();
    return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : fallback;
}

function buildDateTime(date, time, fallbackTime) {
    if (!date) return null;
    return `${String(date).slice(0, 10)} ${normalizeTime(time, fallbackTime)}`;
}

function rentalDays(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
    const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`);
    const diff = Math.ceil((end - start) / 86400000);
    return Number.isFinite(diff) && diff >= 1 ? diff : 1;
}

function validateRentalInterval(data) {
    if (!data.data_partenza || !data.ora_partenza || !data.data_rientro_previsto || !data.ora_rientro_previsto) {
        return 'Inserisci data e ora di partenza e rientro';
    }
    const start = buildDateTime(data.data_partenza, data.ora_partenza, '00:00');
    const end = buildDateTime(data.data_rientro_previsto, data.ora_rientro_previsto, '23:59');
    if (end <= start) return 'Il rientro deve essere successivo alla partenza';
    return null;
}

function findVehicleConflict(data, excludeId = null) {
    if (!['prenotazione', 'in_corso'].includes(data.stato || 'prenotazione')) return null;
    const start = buildDateTime(data.data_partenza, data.ora_partenza, '00:00');
    const end = buildDateTime(data.data_rientro_previsto, data.ora_rientro_previsto, '23:59');
    let query = `
        SELECT c.id, c.numero_contratto, c.data_partenza, c.ora_partenza,
               c.data_rientro_previsto, c.ora_rientro_previsto, c.stato,
               cu.nome, cu.cognome
        FROM contracts c
        LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.vehicle_id = ?
          AND c.stato IN ('prenotazione', 'in_corso')
          AND datetime(c.data_partenza || ' ' || COALESCE(NULLIF(c.ora_partenza, ''), '00:00')) < datetime(?)
          AND datetime(c.data_rientro_previsto || ' ' || COALESCE(NULLIF(c.ora_rientro_previsto, ''), '23:59')) > datetime(?)
    `;
    const params = [data.vehicle_id, end, start];
    if (excludeId) {
        query += ' AND c.id != ?';
        params.push(excludeId);
    }
    query += ' ORDER BY c.data_partenza, c.ora_partenza LIMIT 1';
    return db.prepare(query).get(...params);
}

function conflictMessage(conflict) {
    const cliente = [conflict?.cognome, conflict?.nome].filter(Boolean).join(' ');
    const riferimento = conflict?.numero_contratto || `prenotazione #${conflict?.id}`;
    return `Veicolo già occupato: ${riferimento}${cliente ? ` · ${cliente}` : ''}, dal ${conflict?.data_partenza} ${conflict?.ora_partenza || '00:00'} al ${conflict?.data_rientro_previsto} ${conflict?.ora_rientro_previsto || '23:59'}`;
}

// GET /availability - verifica disponibilita per intervallo preciso.
// Le vetture in manutenzione, noleggiate o in sostituzione non sono mai nei risultati.
router.get('/availability', (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end || String(end) <= String(start)) {
            return res.status(400).json({ error: 'Intervallo di disponibilità non valido' });
        }

        const vehicles = db.prepare("SELECT * FROM vehicles WHERE stato = 'disponibile' ORDER BY marca, modello, targa").all();
        const findConflict = db.prepare(`
            SELECT c.id, c.numero_contratto, c.stato, c.data_partenza, c.ora_partenza,
                   c.data_rientro_previsto, c.ora_rientro_previsto, cu.nome, cu.cognome
            FROM contracts c
            LEFT JOIN customers cu ON cu.id = c.customer_id
            WHERE c.vehicle_id = ?
              AND c.stato IN ('prenotazione', 'in_corso')
              AND datetime(c.data_partenza || ' ' || COALESCE(NULLIF(c.ora_partenza, ''), '00:00')) < datetime(?)
              AND datetime(c.data_rientro_previsto || ' ' || COALESCE(NULLIF(c.ora_rientro_previsto, ''), '23:59')) > datetime(?)
            ORDER BY c.data_partenza, c.ora_partenza
            LIMIT 1
        `);

        const result = vehicles.map(vehicle => {
            const conflict = findConflict.get(vehicle.id, String(end).replace('T', ' '), String(start).replace('T', ' '));
            return { ...vehicle, available: !conflict, conflict: conflict || null };
        });

        res.json({
            start,
            end,
            available: result.filter(v => v.available),
            occupied: result.filter(v => !v.available)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST / - crea contratto
router.post('/', (req, res) => {
    try {
        const data = pickAllowedFields(req.body, CONTRACT_WRITE_FIELDS);
        const validationError = validateContractReferences(data);
        if (validationError) return res.status(400).json({ error: validationError });
        data.stato = data.stato || 'prenotazione';

        const intervalError = validateRentalInterval(data);
        if (intervalError) return res.status(400).json({ error: intervalError });
        const conflict = findVehicleConflict(data);
        if (conflict) return res.status(409).json({ error: conflictMessage(conflict), conflict });

        // L'auto sostitutiva non e' un contratto commerciale: niente numero, niente
        // costi e nessuna Kasko. E' solo l'impegno del veicolo verso il cliente.
        if (isSostitutiva(data)) {
            data.numero_contratto = null;
            data.imponibile = 0;
            data.iva = 0;
            data.totale = 0;
            data.deposito_cauzionale = 0;
            data.kasko_inclusa = 0;
            data.kasko_prezzo = 0;
            data.giorni_tariffa = null;
            data.importo_giorno = null;
        } else {
            if (!data.numero_contratto && ['in_corso', 'concluso'].includes(data.stato)) data.numero_contratto = generateContractNumber();
            Object.assign(data, calculateTotals(data));
            applyKaskoFranchises(data);
        }

        const createContract = db.transaction(() => {
            if (data.stato === 'in_corso') {
                db.prepare('UPDATE vehicles SET stato = ? WHERE id = ?').run(activeVehicleState(data), data.vehicle_id);
            }
            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = keys.map(() => '?').join(', ');
            return db.prepare(`INSERT INTO contracts (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
        });

        const info = createContract();
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(info.lastInsertRowid);
        removeLegacyAutomaticPayment(contract.id);
        updateVehicleStartingKm(contract.vehicle_id, data.km_partenza);
        res.status(201).json({ id: info.lastInsertRowid, numero_contratto: data.numero_contratto, message: 'Contratto creato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id - aggiorna
router.put('/:id', (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Contratto non trovato' });

        const data = pickAllowedFields(req.body, CONTRACT_WRITE_FIELDS);
        const merged = { ...existing, ...data };
        const validationError = validateContractReferences(merged);
        if (validationError) return res.status(400).json({ error: validationError });

        const intervalError = validateRentalInterval(merged);
        if (intervalError) return res.status(400).json({ error: intervalError });
        const conflict = findVehicleConflict(merged, req.params.id);
        if (conflict) return res.status(409).json({ error: conflictMessage(conflict), conflict });

        const mergedIsSostitutiva = isSostitutiva(merged);
        if (mergedIsSostitutiva) {
            data.numero_contratto = null;
            data.imponibile = 0;
            data.iva = 0;
            data.totale = 0;
            data.deposito_cauzionale = 0;
            data.kasko_inclusa = 0;
            data.kasko_prezzo = 0;
            data.giorni_tariffa = null;
            data.importo_giorno = null;
        } else {
            if (!merged.numero_contratto && ['in_corso', 'concluso'].includes(merged.stato)) {
                data.numero_contratto = generateContractNumber();
                merged.numero_contratto = data.numero_contratto;
            }
            Object.assign(data, calculateTotals(merged));
            // Calcola e salva le franchigie coerenti con l'opzione Kasko.
            const franchiseData = applyKaskoFranchises({ ...merged, ...data });
            data.franchigia_rca_noleggiatore = franchiseData.franchigia_rca_noleggiatore;
            data.franchigia_rca_cliente = franchiseData.franchigia_rca_cliente;
            data.franchigia_kasko_noleggiatore = franchiseData.franchigia_kasko_noleggiatore;
            data.franchigia_kasko_cliente = franchiseData.franchigia_kasko_cliente;
            data.franchigia_furto_noleggiatore = franchiseData.franchigia_furto_noleggiatore;
            data.franchigia_furto_cliente = franchiseData.franchigia_furto_cliente;
        }
        const { clause: updateFields, values: updateValues } = buildSafeUpdate(data, CONTRACT_WRITE_FIELDS);
        if (!updateFields) return res.status(400).json({ error: 'Nessun campo valido' });

        const updateContract = db.transaction(() => {
            if (existing.stato === 'in_corso' && (merged.stato !== 'in_corso' || String(existing.vehicle_id) !== String(merged.vehicle_id))) {
                // Libera la vettura solo se nessun ALTRO contratto attivo la tiene occupata.
                const otherActive = db.prepare("SELECT count(*) as cnt FROM contracts WHERE vehicle_id = ? AND stato = 'in_corso' AND id != ?").get(existing.vehicle_id, existing.id).cnt;
                if (otherActive === 0) {
                    db.prepare("UPDATE vehicles SET stato = 'disponibile' WHERE id = ?").run(existing.vehicle_id);
                }
            }
            if (merged.stato === 'in_corso') {
                db.prepare('UPDATE vehicles SET stato = ? WHERE id = ?').run(activeVehicleState(merged), merged.vehicle_id);
            }
            const params = [...updateValues, req.params.id];
            return db.prepare(`UPDATE contracts SET ${updateFields} WHERE id = ?`).run(...params);
        });

        updateContract();
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        removeLegacyAutomaticPayment(contract.id);
        updateVehicleStartingKm(contract.vehicle_id, data.km_partenza);
        res.json({ message: 'Contratto aggiornato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id
router.delete('/:id', (req, res) => {
    try {
        const contract = db.prepare('SELECT vehicle_id, stato, pdf_filename FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Non trovato' });

        if (contract.stato === 'in_corso') {
            // Libera la vettura solo se non c'e' un altro contratto attivo a occuparla.
            const otherActive = db.prepare("SELECT count(*) as cnt FROM contracts WHERE vehicle_id = ? AND stato = 'in_corso' AND id != ?").get(contract.vehicle_id, req.params.id).cnt;
            if (otherActive === 0) {
                db.prepare("UPDATE vehicles SET stato = 'disponibile' WHERE id = ?").run(contract.vehicle_id);
            }
        }

        if (contract.pdf_filename) {
            const pdfPath = safeStoredPdfPath(contract.pdf_filename);
            if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        }

        db.prepare('DELETE FROM payments WHERE contract_id = ?').run(req.params.id);
        db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
        
        res.json({ message: 'Contratto eliminato' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/pdf-data
// Prepara i dati per il PDF basato sul modello compilabile.
// Se la prenotazione non ha ancora un numero, il numero viene assegnato qui:
// la semplice prenotazione non consuma quindi numerazione finche non si prepara il contratto.
router.post('/:id/pdf-data', (req, res) => {
    try {
        let contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contratto non trovato' });

        // Le auto sostitutive non hanno numero contratto ne PDF commerciale.
        if (!isSostitutiva(contract) && !contract.numero_contratto) {
            const assignNumber = db.transaction(() => {
                const fresh = db.prepare('SELECT numero_contratto FROM contracts WHERE id = ?').get(req.params.id);
                if (fresh?.numero_contratto) return fresh.numero_contratto;
                const numero = generateContractNumber();
                db.prepare('UPDATE contracts SET numero_contratto = ? WHERE id = ?').run(numero, req.params.id);
                return numero;
            });
            contract.numero_contratto = assignNumber();
        }

        // Ricalcolo per garantire che vecchie prenotazioni usino la nuova logica IVA compresa e Kasko.
        const recalculated = { ...contract, ...calculateTotals(contract) };
        applyKaskoFranchises(recalculated);
        db.prepare(`
            UPDATE contracts SET imponibile = ?, iva = ?, totale = ?,
                franchigia_rca_noleggiatore = ?, franchigia_rca_cliente = ?,
                franchigia_kasko_noleggiatore = ?, franchigia_kasko_cliente = ?,
                franchigia_furto_noleggiatore = ?, franchigia_furto_cliente = ?
            WHERE id = ?
        `).run(
            recalculated.imponibile, recalculated.iva, recalculated.totale,
            recalculated.franchigia_rca_noleggiatore, recalculated.franchigia_rca_cliente,
            recalculated.franchigia_kasko_noleggiatore, recalculated.franchigia_kasko_cliente,
            recalculated.franchigia_furto_noleggiatore, recalculated.franchigia_furto_cliente,
            req.params.id
        );

        contract = { ...recalculated };
        contract.customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(contract.customer_id) || {};
        contract.vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(contract.vehicle_id) || {};
        contract.prolungato_da = contract.prolungamento_di
            ? db.prepare('SELECT id, numero_contratto, data_rientro_previsto FROM contracts WHERE id = ?').get(contract.prolungamento_di) || null
            : null;
        contract.prolungato_in = findFollowingContract(contract.id) || null;
        res.json(contract);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/pdf-file - salva il PDF generato dal browser direttamente sul server.
// Il nome viene deciso dal server usando cliente + data di inizio noleggio.
router.post('/:id/pdf-file', express.raw({ type: 'application/pdf', limit: '15mb' }), (req, res) => {
    try {
        const contract = db.prepare(`
            SELECT c.*, cu.nome, cu.cognome
            FROM contracts c
            LEFT JOIN customers cu ON cu.id = c.customer_id
            WHERE c.id = ?
        `).get(req.params.id);

        if (!contract) return res.status(404).json({ error: 'Contratto non trovato' });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            return res.status(400).json({ error: 'PDF non ricevuto' });
        }

        ensureContractsDir();
        const filename = uniquePdfFilename(contract);
        const filePath = safeStoredPdfPath(filename);

        // Se nome cliente o data di partenza sono cambiati, elimina la vecchia copia
        // associata a questo stesso contratto prima di salvare la nuova.
        if (contract.pdf_filename && contract.pdf_filename !== filename) {
            const oldPath = safeStoredPdfPath(contract.pdf_filename);
            if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        fs.writeFileSync(filePath, req.body);
        db.prepare('UPDATE contracts SET pdf_filename = ? WHERE id = ?').run(filename, req.params.id);

        res.json({
            message: 'Contratto salvato sul server',
            filename,
            url: `/api/contracts/${req.params.id}/pdf-file`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /:id/pdf-file - apre la copia gia salvata sul server.
router.get('/:id/pdf-file', (req, res) => {
    try {
        const contract = db.prepare('SELECT pdf_filename FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contratto non trovato' });
        if (!contract.pdf_filename) return res.status(404).json({ error: 'PDF non ancora generato' });

        const filePath = safeStoredPdfPath(contract.pdf_filename);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File PDF non trovato sul server' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(contract.pdf_filename)}`
        );
        res.sendFile(filePath);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vecchio endpoint mantenuto solo per dare un messaggio chiaro a eventuali vecchie copie del frontend.
router.post('/:id/pdf', (req, res) => {
    res.status(410).json({ error: 'Generatore PDF aggiornato: ricarica la pagina del gestionale e riprova.' });
});

// PUT /:id/checkin
// Il rientro chiude TUTTA la catena di prolungamenti collegata al contratto:
// i contratti originali e gli intermedi (gia' terminati nel periodo) vengono
// chiusi con la loro data di rientro prevista, mentre l'ultimo contratto attivo
// riceve i dati di arrivo inseriti. La vettura torna disponibile solo se nessun
// altro contratto attivo (anche non collegato) la tiene occupata.
router.put('/:id/checkin', (req, res) => {
    try {
        const { km_arrivo, carburante_arrivo, data_arrivo, ora_arrivo, note } = req.body;
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contratto non trovato' });

        const chain = getProlungaChain(req.params.id);
        const attivi = chain.filter(x => x.stato === 'in_corso');
        const ultimoAttivo = attivi[attivi.length - 1] || contract;

        const chiusiIds = [];
        const closeAll = db.transaction(() => {
            for (const item of attivi) {
                const isLast = Number(item.id) === Number(ultimoAttivo.id);
                let itemNote = isLast ? note : item.note;
                if (!isLast) {
                    const suffix = `Chiuso automaticamente al rientro insieme al contratto ${contract.numero_contratto || '#' + contract.id}`;
                    itemNote = itemNote ? `${itemNote}\n${suffix}` : suffix;
                }
                db.prepare(`
                    UPDATE contracts
                    SET km_arrivo = ?, carburante_arrivo = ?, data_arrivo = ?, ora_arrivo = ?,
                        note = ?, stato = 'concluso'
                    WHERE id = ?
                `).run(
                    isLast ? km_arrivo : null,
                    isLast ? carburante_arrivo : null,
                    isLast ? data_arrivo : item.data_rientro_previsto,
                    isLast ? ora_arrivo : (item.ora_rientro_previsto || '23:59'),
                    itemNote,
                    item.id
                );
                chiusiIds.push(item.id);
            }
        });
        closeAll();

        // La vettura diventa disponibile solo se non restano contratti attivi ad occuparla.
        const otherActive = db.prepare("SELECT count(*) as cnt FROM contracts WHERE vehicle_id = ? AND stato = 'in_corso' AND id NOT IN (" + (chiusiIds.map(() => '?').join(', ') || 'NULL') + ")").get(...[contract.vehicle_id, ...chiusiIds]).cnt;
        const freed = otherActive === 0;
        if (km_arrivo) {
            if (freed) {
                db.prepare("UPDATE vehicles SET km_attuali = ?, stato = 'disponibile' WHERE id = ?")
                  .run(km_arrivo, contract.vehicle_id);
            } else {
                db.prepare('UPDATE vehicles SET km_attuali = CASE WHEN km_attuali IS NULL OR ? > km_attuali THEN ? ELSE km_attuali END WHERE id = ?')
                  .run(km_arrivo, km_arrivo, contract.vehicle_id);
            }
        } else if (freed) {
            db.prepare("UPDATE vehicles SET stato = 'disponibile' WHERE id = ?")
              .run(contract.vehicle_id);
        }

        const response = { message: 'Check-in completato', chiusi: chiusiIds };
        // Promemoria post-check-in: i contratti di prolungamento ancora da firmare
        // (quelli non chiusi in questo rientro) vanno fatti firmare al cliente.
        const daFirmare = chain.filter(x => hasActiveProlungamento(x) && !chiusiIds.includes(Number(x.id)));
        if (daFirmare.length) {
            const principale = daFirmare[0];
            response.reminder_prolungamento = {
                contratto_id: principale.id,
                numero_contratto: principale.numero_contratto,
                stato: principale.stato,
                cliente: null,
                fino_al: `${principale.data_rientro_previsto} ${principale.ora_rientro_previsto || '23:59'}`.trim(),
                condizioni_uguali: true,
                contratti: daFirmare.map(x => ({
                    id: x.id,
                    numero_contratto: x.numero_contratto,
                    stato: x.stato,
                    fino_al: `${x.data_rientro_previsto} ${x.ora_rientro_previsto || '23:59'}`.trim()
                }))
            };
        }
        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /:id/prolong  e  POST /:id/renew
// Estende un noleggio in corso: genera un nuovo contratto consecutivo intestato
// allo stesso cliente con le stesse condizioni del contratto originale.
// Il nuovo contratto parte esattamente dal rientro previsto del contratto attuale
// e indica prolungamento_di = id del contratto precedente, cosi al rientro della
// vettura compare il promemoria di far firmare il nuovo contratto.
function extendContract(req, res) {
    try {
        const oldC = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
        if (!oldC) return res.status(404).json({ error: 'Contratto non trovato' });
        if (oldC.stato !== 'in_corso') {
            return res.status(400).json({ error: 'Puoi prolungare solo un noleggio in corso' });
        }

        const data_rientro_previsto = String(req.body.data_rientro_previsto || '').slice(0, 10);
        const ora_rientro_previsto = normalizeTime(req.body.ora_rientro_previsto, oldC.ora_rientro_previsto || '18:00');
        if (!data_rientro_previsto) {
            return res.status(400).json({ error: 'Indica fino a quando si prolunga il noleggio' });
        }

        const oldEnd = buildDateTime(oldC.data_rientro_previsto, oldC.ora_rientro_previsto, '23:59');
        const newEnd = buildDateTime(data_rientro_previsto, ora_rientro_previsto, '18:00');
        if (!oldEnd || !newEnd || newEnd <= oldEnd) {
            return res.status(400).json({ error: 'La nuova data di rientro deve essere successiva a quella attuale' });
        }

        // Copia il vecchio contratto conservando tutte le condizioni.
        const data = { ...oldC };
        delete data.id;
        data.numero_contratto = generateContractNumber();
        data.pdf_filename = null;
        data.prolungamento_di = oldC.id;
        data.data_partenza = oldC.data_rientro_previsto;
        data.ora_partenza = oldC.ora_rientro_previsto || '';
        data.data_rientro_previsto = data_rientro_previsto;
        data.ora_rientro_previsto = ora_rientro_previsto;
        data.data_scadenza_pagamento = data_rientro_previsto;
        // Parte esattamente dove finisce il vecchio contratto.
        data.km_partenza = null;
        data.carburante_partenza = null;
        data.giorni_tariffa = Math.max(1,
            Math.ceil((new Date(`${data_rientro_previsto}T00:00:00`) - new Date(`${oldC.data_rientro_previsto}T00:00:00`)) / 86400000)
        );
        data.stato = 'in_corso';
        data.created_at = new Date().toISOString();

        const intervalError = validateRentalInterval(data);
        if (intervalError) return res.status(400).json({ error: intervalError });
        const conflict = findVehicleConflict(data);
        if (conflict) return res.status(409).json({ error: conflictMessage(conflict), conflict });

        // Ricalcola imponibile, IVA e totale sui nuovi giorni tariffa.
        Object.assign(data, calculateTotals(data));
        applyKaskoFranchises(data);

        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');
        const info = db.prepare(`INSERT INTO contracts (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);

        // La vettura resta occupata: nessun cambiamento di stato necessario.
        const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(info.lastInsertRowid);
        removeLegacyAutomaticPayment(contract.id);

        res.status(201).json({
            id: info.lastInsertRowid,
            numero_contratto: contract.numero_contratto,
            message: 'Noleggio prolungato: nuovo contratto generato con le stesse condizioni'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

router.post('/:id/prolong', extendContract);
router.post('/:id/renew', extendContract);

module.exports = router;