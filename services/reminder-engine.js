const cron = require('node-cron');
const { db } = require('../database/db');

function logReminders() {
    console.log('--- ESECUZIONE REMINDER ENGINE (08:00) ---');
    
    const today = new Date();
    
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // 1. Contratti che scadono nei prossimi 3 giorni
    const contracts = db.prepare(`
        SELECT id, numero_contratto, data_rientro_previsto 
        FROM contracts 
        WHERE data_rientro_previsto >= ? AND data_rientro_previsto <= ? AND stato IN ('in_corso')
    `).all(todayStr, threeDaysStr);

    contracts.forEach(c => {
        console.log(`[REMINDER ALTA PRIORITÀ] Contratto ${c.numero_contratto} in scadenza il ${c.data_rientro_previsto}`);
    });

    // 2. Veicoli con scadenze nei prossimi 30 giorni
    const scadenze = db.prepare(`
        SELECT vs.id, vs.tipo, vs.data_scadenza, v.targa
        FROM vehicles_scadenze vs
        JOIN vehicles v ON vs.vehicle_id = v.id
        WHERE vs.data_scadenza >= ? AND vs.data_scadenza <= ? AND vs.completata = 0
    `).all(todayStr, thirtyDaysStr);

    scadenze.forEach(s => {
        console.log(`[REMINDER MEDIA PRIORITÀ] Veicolo ${s.targa}: Scadenza ${s.tipo} il ${s.data_scadenza}`);
    });

    // 3. Manutenzioni non completate con data_prossima nei prossimi 30 giorni
    const maintenance = db.prepare(`
        SELECT m.id, m.tipo, m.data_prossima, v.targa
        FROM maintenance m
        JOIN vehicles v ON m.vehicle_id = v.id
        WHERE m.data_prossima >= ? AND m.data_prossima <= ? AND m.completato = 0
    `).all(todayStr, thirtyDaysStr);

    maintenance.forEach(m => {
         console.log(`[REMINDER MEDIA PRIORITÀ] Veicolo ${m.targa}: Manutenzione programmata (${m.tipo}) il ${m.data_prossima}`);
    });

    console.log('--- FINE REMINDER ENGINE ---');
}

function startReminderEngine() {
    // Esegui ogni giorno alle 08:00
    cron.schedule('0 8 * * *', () => {
        logReminders();
    });
    console.log('Reminder Engine avviato. Schedulato alle 08:00 ogni giorno.');
}

module.exports = { startReminderEngine };
