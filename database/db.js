const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'gestionale.db');
const db = new Database(dbPath);

function initDatabase() {
    // Settings
    db.exec(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        key TEXT UNIQUE,
        value TEXT
    )`);

    // Vehicles
    db.exec(`CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        targa TEXT UNIQUE NOT NULL,
        marca TEXT,
        modello TEXT,
        versione TEXT,
        alimentazione TEXT,
        nr_posti INTEGER,
        portata_utile TEXT,
        colore TEXT,
        anno INTEGER,
        km_attuali INTEGER DEFAULT 0,
        stato TEXT DEFAULT 'disponibile',
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Vehicles Scadenze
    db.exec(`CREATE TABLE IF NOT EXISTS vehicles_scadenze (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER,
        tipo TEXT,
        data_scadenza TEXT,
        note TEXT,
        completata INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    )`);

    // Customers
    db.exec(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        codice_fiscale TEXT,
        partita_iva TEXT,
        telefono TEXT,
        email TEXT,
        indirizzo TEXT,
        data_nascita TEXT,
        luogo_nascita TEXT,
        doc_tipo TEXT DEFAULT 'carta_identita',
        doc_categoria TEXT,
        doc_numero TEXT,
        doc_rilasciato_da TEXT,
        doc_rilasciato_il TEXT,
        doc_scadenza TEXT,
        patente_categoria TEXT,
        patente_numero TEXT,
        patente_rilasciata_da TEXT,
        patente_rilasciata_il TEXT,
        patente_scadenza TEXT,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Contracts
    db.exec(`CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_contratto TEXT UNIQUE,
        customer_id INTEGER,
        vehicle_id INTEGER,
        filiale_partenza TEXT,
        filiale_rientro TEXT,
        data_partenza TEXT,
        ora_partenza TEXT,
        data_rientro_previsto TEXT,
        ora_rientro_previsto TEXT,
        data_arrivo TEXT,
        ora_arrivo TEXT,
        data_scadenza_pagamento TEXT,
        km_partenza INTEGER DEFAULT 0,
        km_arrivo INTEGER,
        carburante_partenza TEXT DEFAULT '1/1',
        carburante_arrivo TEXT,
        giorni_tariffa INTEGER DEFAULT 1,
        importo_giorno REAL DEFAULT 0,
        giorni_max INTEGER,
        extra_giorno REAL DEFAULT 0,
        km_inclusi INTEGER,
        extra_km REAL DEFAULT 0.20,
        ritardo_consentito INTEGER DEFAULT 59,
        carburante_costo REAL DEFAULT 0,
        franchigia_rca_noleggiatore REAL DEFAULT 0,
        franchigia_rca_cliente REAL DEFAULT 2500,
        franchigia_kasko_noleggiatore REAL DEFAULT 0,
        franchigia_kasko_cliente REAL DEFAULT 2500,
        franchigia_furto_noleggiatore REAL DEFAULT 0,
        franchigia_furto_cliente REAL DEFAULT 2500,
        kasko_inclusa INTEGER DEFAULT 0,
        kasko_prezzo REAL DEFAULT 0,
        secondo_conducente_nome TEXT,
        secondo_conducente_doc_tipo TEXT,
        secondo_conducente_doc_numero TEXT,
        secondo_conducente_doc_categoria TEXT,
        secondo_conducente_doc_rilasciato_da TEXT,
        secondo_conducente_doc_rilasciato_il TEXT,
        secondo_conducente_doc_scadenza TEXT,
        optionals TEXT,
        note TEXT,
        stato TEXT DEFAULT 'prenotazione',
        imponibile REAL DEFAULT 0,
        iva REAL DEFAULT 0,
        totale REAL DEFAULT 0,
        deposito_cauzionale REAL DEFAULT 0,
        dettagli_assegno TEXT,
        pdf_filename TEXT,
        tipo_impegno TEXT DEFAULT 'noleggio',
        prolungamento_di INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    )`);

    // Migrazioni leggere per database creati con versioni precedenti del gestionale.
    const contractColumns = db.prepare('PRAGMA table_info(contracts)').all().map(c => c.name);
    if (!contractColumns.includes('secondo_conducente_nome')) {
        db.exec('ALTER TABLE contracts ADD COLUMN secondo_conducente_nome TEXT');
    }
    if (!contractColumns.includes('pdf_filename')) {
        db.exec('ALTER TABLE contracts ADD COLUMN pdf_filename TEXT');
    }
    if (!contractColumns.includes('data_scadenza_pagamento')) {
        db.exec('ALTER TABLE contracts ADD COLUMN data_scadenza_pagamento TEXT');
    }
    // Tipo di impegno del contratto: 'noleggio' (default) oppure 'sostitutiva'
    // (auto sostitutiva affidata al cliente senza documenti/pagamenti).
    if (!contractColumns.includes('tipo_impegno')) {
        db.exec("ALTER TABLE contracts ADD COLUMN tipo_impegno TEXT DEFAULT 'noleggio'");
    }
    // Prolungamento: id del contratto originale di cui questo contratto e' la prosecuzione.
    // Al rientro del contratto originario il gestionale ricorda di far firmare il nuovo.
    if (!contractColumns.includes('prolungamento_di')) {
        db.exec('ALTER TABLE contracts ADD COLUMN prolungamento_di INTEGER');
    }

    // Payments
    db.exec(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER,
        vehicle_id INTEGER,
        data_pagamento TEXT,
        importo REAL,
        metodo TEXT DEFAULT 'contanti',
        note TEXT,
        origine TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(contract_id) REFERENCES contracts(id)
    )`);

    const paymentColumns = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
    if (!paymentColumns.includes('origine')) {
        db.exec('ALTER TABLE payments ADD COLUMN origine TEXT');
    }
    // Un solo incasso automatico per contratto; i pagamenti inseriti a mano restano possibili.
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_contract_auto ON payments(contract_id) WHERE origine = 'contratto'");
    // Le registrazioni automatiche dei contratti non erano incassi reali.
    // Da ora lo scadenzario conteggia solo i pagamenti realmente registrati.
    db.exec("DELETE FROM payments WHERE origine = 'contratto'");

    // Expenses
    db.exec(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER,
        data_spesa TEXT,
        tipo TEXT,
        descrizione TEXT,
        importo REAL,
        officina TEXT,
        note TEXT,
        maintenance_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    )`);

    const expenseColumns = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
    if (!expenseColumns.includes('maintenance_id')) {
        db.exec('ALTER TABLE expenses ADD COLUMN maintenance_id INTEGER');
    }
    // Impedisce la duplicazione della spesa creata automaticamente dalla manutenzione.
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_maintenance ON expenses(maintenance_id) WHERE maintenance_id IS NOT NULL');

    // Maintenance
    db.exec(`CREATE TABLE IF NOT EXISTS maintenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER,
        tipo TEXT,
        descrizione TEXT,
        data TEXT,
        data_prossima TEXT,
        km INTEGER,
        km_prossimo INTEGER,
        costo REAL,
        officina TEXT,
        completato INTEGER DEFAULT 0,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    )`);

    // Uploads
    db.exec(`CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT,
        entity_id INTEGER,
        filename TEXT,
        original_name TEXT,
        mimetype TEXT,
        size INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Scadenze fiscali per cliente
    db.exec(`CREATE TABLE IF NOT EXISTS customer_scadenze (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        tipo TEXT,
        descrizione TEXT,
        data_scadenza TEXT,
        importo REAL,
        completata INTEGER DEFAULT 0,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`);

    // Insert Default Settings
    const defaultSettings = [
        ['company_name', 'AUTOCENTROBRUTIA S.R.L.S.'],
        ['company_address', 'VIA GIUSEPPE ISNARDI 31/33 - 87100 COSENZA (Cosenza)'],
        ['company_phone', '0984411937 - Cell. 3493859892'],
        ['company_email', 'info@autocentrobrutia.it'],
        ['company_piva', '03285310789'],
        ['company_cf', '03285310789'],
        ['company_sede', 'Via ISNARDI 31/33, 87100, COSENZA (CS)'],
        ['kasko_prezzo', '20'],
        ['reminder_days', '30'],
        ['iva_rate', '22'],
        ['franchigia_rca_noleggiatore_default', '0'],
        ['franchigia_rca_cliente_default', '2500'],
        ['franchigia_kasko_noleggiatore_default', '0'],
        ['franchigia_kasko_cliente_default', '2500'],
        ['franchigia_furto_noleggiatore_default', '0'],
        ['franchigia_furto_cliente_default', '2500'],
        ['franchigia_rca_cliente_kasko', '500'],
        ['franchigia_kasko_cliente_kasko', '500'],
        ['franchigia_furto_cliente_kasko', '500'],
        ['next_contract_number', '1'],
        ['extra_km_default', '0.20'],
        ['ritardo_consentito_default', '59']
    ];

    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    const checkSetting = db.prepare('SELECT id FROM settings WHERE key = ?');
    
    // Use transaction for inserting defaults
    const insertMany = db.transaction((settings) => {
        for (const [key, value] of settings) {
            const exists = checkSetting.get(key);
            if (!exists) {
                insertSetting.run(key, value);
            }
        }
    });

    insertMany(defaultSettings);
}

module.exports = { db, initDatabase };