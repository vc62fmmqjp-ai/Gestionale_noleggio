const PDFDocument = require('pdfkit');
const { db } = require('../database/db');

async function generateContractPDF(contract, res) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 30, size: 'A4' });

            res.setHeader('Content-disposition', `attachment; filename=Contratto_${contract.numero_contratto}.pdf`);
            res.setHeader('Content-type', 'application/pdf');
            doc.pipe(res);

            // Fetch company settings
            const settingsRows = db.prepare('SELECT key, value FROM settings').all();
            const settings = {};
            settingsRows.forEach(r => settings[r.key] = r.value);

            // Helper format
            const formatCurr = (val) => {
                if (!val) return '0,00';
                return parseFloat(val).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            const safeStr = (str) => str || '';

            // ---- INTESTAZIONE ----
            // Sinistra (x=30, y=20, w=220)
            doc.font('Helvetica-Bold').fontSize(16).text('Auto Centro', 30, 20);
            doc.font('Helvetica-Bold').fontSize(22).fillColor('red').text('BRUTIA', 30, 40).fillColor('black');
            doc.font('Helvetica').fontSize(9);
            doc.text(settings['company_name'], 30, 70);
            doc.text(settings['company_address'], 30, 85);
            doc.text(`Tel. ${settings['company_phone']}`, 30, 100);
            doc.text(settings['company_email'], 30, 115);
            doc.text(`P.IVA: ${settings['company_piva']} C.F.: ${settings['company_cf']}`, 30, 130);
            doc.text(`Sede Operativa: ${settings['company_sede']}`, 30, 145);

            // Destra (x=320, y=20, w=245)
            doc.rect(320, 20, 245, 125).stroke('#aaa');
            doc.fontSize(8);
            doc.text(`TARGA DEL VEICOLO: ${safeStr(contract.vehicle.targa)}`, 325, 25);
            doc.text(`MARCA: ${safeStr(contract.vehicle.marca)}  MODELLO: ${safeStr(contract.vehicle.modello)}`, 325, 40);
            doc.text(`VERSIONE: ${safeStr(contract.vehicle.versione)}  ALIMENTAZIONE: ${safeStr(contract.vehicle.alimentazione)}  NR. POSTI: ${safeStr(contract.vehicle.nr_posti)}`, 325, 55);
            doc.text(`USCITA DEL MEZZO DALLA SEDE DI: Filiale di ${safeStr(contract.filiale_partenza)}`, 325, 70);
            doc.text(`RIENTRO PREVISTO NELLA SEDE DI: Filiale di ${safeStr(contract.filiale_rientro)}`, 325, 85);
            doc.text(`DATA PARTENZA: ${safeStr(contract.data_partenza)}  ORE: ${safeStr(contract.ora_partenza)}`, 325, 100);
            doc.text(`RIENTRO PREVISTO: ${safeStr(contract.data_rientro_previsto)}  ORE: ${safeStr(contract.ora_rientro_previsto)}`, 325, 115);
            doc.text(`DATA ARRIVO: ${safeStr(contract.data_arrivo)}  ORA ARRIVO: ${safeStr(contract.ora_arrivo)}`, 325, 130);

            // ---- SEZIONE CLIENTE ----
            doc.rect(30, 160, 265, 200).stroke('#aaa');
            doc.text(`Sgt./Spett.le: ${safeStr(contract.customer.nome)} ${safeStr(contract.customer.cognome)}`, 35, 165);
            doc.text(`PARTITA IVA / CODICE FISCALE: ${safeStr(contract.customer.codice_fiscale) || safeStr(contract.customer.partita_iva)}`, 35, 180);
            doc.text(`TELEFONO: ${safeStr(contract.customer.telefono)}`, 35, 195);
            doc.text(`CONDUCENTE: ${safeStr(contract.customer.nome)} ${safeStr(contract.customer.cognome)}`, 35, 210);
            doc.text(`DOMICILIO: ${safeStr(contract.customer.indirizzo)}`, 35, 225);
            doc.text(`DATA DI NASCITA: ${safeStr(contract.customer.data_nascita)}  LUOGO DI NASCITA: ${safeStr(contract.customer.luogo_nascita)}`, 35, 240);
            doc.text(`DOCUMENTO: CATEGORIA: ${safeStr(contract.customer.doc_categoria)}  N. DOCUMENTO: ${safeStr(contract.customer.doc_numero)}`, 35, 255);
            doc.text(`PATENTE`, 35, 270);
            doc.text(`RILASCIATO DA: ${safeStr(contract.customer.doc_rilasciato_da)}  RILASCIATO IL: ${safeStr(contract.customer.doc_rilasciato_il)}  DATA SCADENZA: ${safeStr(contract.customer.doc_scadenza)}`, 35, 285);
            
            if (contract.secondo_conducente_doc_numero) {
                doc.text(`2° CONDUCENTE`, 35, 310);
                doc.text(`DOC: ${safeStr(contract.secondo_conducente_doc_tipo)} CAT: ${safeStr(contract.secondo_conducente_doc_categoria)} NUM: ${safeStr(contract.secondo_conducente_doc_numero)}`, 35, 325);
                doc.text(`RIL: ${safeStr(contract.secondo_conducente_doc_rilasciato_da)} IL: ${safeStr(contract.secondo_conducente_doc_rilasciato_il)} SCAD: ${safeStr(contract.secondo_conducente_doc_scadenza)}`, 35, 340);
            }

            // ---- SEZIONE DESTRA (DANNI) ----
            doc.rect(310, 160, 255, 200).stroke('#aaa');
            doc.text('SCHEMA DANNI AUTO (1-13)', 315, 165);
            // Simula i rettangoli
            doc.rect(380, 180, 40, 60).stroke('#ccc');
            doc.rect(420, 180, 40, 60).stroke('#ccc');
            doc.rect(380, 240, 80, 40).stroke('#ccc');
            
            const kmPercorsi = (contract.km_arrivo && contract.km_partenza) ? (contract.km_arrivo - contract.km_partenza) : 0;
            doc.text(`km PARTENZA: ${safeStr(contract.km_partenza)}  km ARRIVO: ${safeStr(contract.km_arrivo)}  km PERCORSI: ${kmPercorsi}`, 315, 300);
            doc.text(`CARB. PARTENZA: ${safeStr(contract.carburante_partenza)}  CARB. ARRIVO: ${safeStr(contract.carburante_arrivo)}  DIFF. COMBUSTIBILE: ___`, 315, 315);
            
            doc.font('Helvetica-Bold');
            doc.text('CHECK OUT', 350, 340);
            doc.text('CHECK IN', 450, 340);
            doc.font('Helvetica');

            // ---- SEZIONE TARIFFA ----
            doc.rect(30, 380, 265, 180).stroke('#aaa');
            doc.font('Helvetica-Bold').text('DETTAGLI TARIFFA APPLICATA', 35, 385);
            doc.font('Helvetica').text('TARIFFA: Base', 35, 400);
            doc.text('Gli importi della tariffa sono al netto dell\'IVA', 35, 410);
            
            doc.text(`Giorni tariffa: ${safeStr(contract.giorni_tariffa)}`, 35, 425); doc.text(`Importo tariffa: €${formatCurr(contract.importo_giorno)} a giorno`, 150, 425);
            doc.text(`Giorni max: ${safeStr(contract.giorni_max)}`, 35, 440); doc.text(`Ogni gg extra: €${formatCurr(contract.extra_giorno)}`, 150, 440);
            doc.text(`Km inclusi: ${safeStr(contract.km_inclusi)}`, 35, 455); doc.text(`Ogni km extra: €${formatCurr(contract.extra_km)}`, 150, 455);
            doc.text(`Ritardo consentito (minuti): ${safeStr(contract.ritardo_consentito)}`, 35, 470); doc.text(`Imputazione oltre rit.: 24 ore`, 170, 470);
            doc.text(`Carburante (IVA incl.): €${formatCurr(contract.carburante_costo)}`, 35, 485);
            
            doc.moveTo(30, 500).lineTo(295, 500).stroke('#aaa');
            
            doc.fontSize(7);
            doc.text(`Franchigia RCA noleggiatore: €${formatCurr(contract.franchigia_rca_noleggiatore)}`, 35, 505);
            doc.text(`Franchigia RCA cliente: €${formatCurr(contract.franchigia_rca_cliente)}`, 35, 515);
            doc.text(`Franchigia Kasko noleggiatore: €${formatCurr(contract.franchigia_kasko_noleggiatore)}`, 35, 525);
            doc.text(`Franchigia Kasko cliente: €${formatCurr(contract.franchigia_kasko_cliente)}`, 35, 535);
            doc.text(`Franchigia Furto/Incendio noleggiatore: €${formatCurr(contract.franchigia_furto_noleggiatore)}`, 35, 545);
            doc.text(`Franchigia Furto/Incendio cliente: €${formatCurr(contract.franchigia_furto_cliente)}`, 35, 555);

            // ---- SEZIONE DESTRA BASSA ----
            doc.rect(310, 380, 255, 180).stroke('#aaa');
            doc.fontSize(8);
            doc.text('OPTIONALS / ASSICURAZIONI / ALTRO', 315, 385);
            doc.text(safeStr(contract.optionals), 315, 400, { width: 245, height: 40 });
            
            doc.text('FIRMA PER ACCETTAZIONE ASSICURAZIONI', 315, 460);
            doc.text('_________________________________', 315, 475);
            
            doc.text('NOTE:', 315, 500);
            doc.text(safeStr(contract.note), 315, 515, { width: 245, height: 40 });

            // ---- TESTO LEGALE ----
            doc.fontSize(6);
            const legalText = "Dichiaro di aver preso visione, letto e approvato, il presente contratto di noleggio, facendo proprie le condizioni generali e speciali di noleggio a lui/lei indicate. In caso di furto del veicolo mi impegno a risarcire all'azienda AUTOCENTROBRUTIA S.R.L.S. Il veicolo non può uscire dai confini italiani senza autorizzazione scritta della Direzione. La merce viaggia a rischio e pericolo del cliente. Mi impegno a riconsegnare il veicolo entro il termine previsto dal contratto. In caso di ritardo sulla consegna del veicolo oltre 30 minuti sarà corrisposta un'intera giornata di noleggio. In caso di sinistro passivo le spese di soccorso stradale e recupero del veicolo sono a totale carico del cliente.";
            doc.text(legalText, 30, 580, { width: 535, align: 'justify' });

            // ---- SEZIONE DEPOSITI ----
            doc.fontSize(9);
            // Colonna 1
            doc.text('DEPOSITI CAUZIONALI', 30, 650);
            doc.fontSize(7);
            doc.text(`A garanzia del pagamento... €${formatCurr(contract.deposito_cauzionale)} a titolo di cauzione.`, 30, 665, { width: 250 });
            doc.fontSize(9);
            doc.text('DETTAGLI ASSEGNO', 30, 690);
            doc.fontSize(8);
            doc.text(`Assegno: ${safeStr(contract.dettagli_assegno)}`, 30, 705);
            doc.text('Intestatario: AUTOCENTROBRUTIA S.R.L.S.', 30, 720);
            doc.text('Assegno: ________________', 30, 735);

            // Colonna 2
            doc.fontSize(9);
            doc.text('CORRISPETTIVO NON DETERMINATO - SEG. FATTURA', 310, 650);
            doc.rect(310, 665, 255, 30).stroke('#aaa');
            doc.text('IMPONIBILE', 320, 670); doc.text('IVA', 450, 670);
            doc.text(`€${formatCurr(contract.imponibile)}`, 320, 680); doc.text(`€${formatCurr(contract.iva)}`, 450, 680);
            
            doc.font('Helvetica-Bold').text(`TOTALE DOCUMENTO: €${formatCurr(contract.totale)}`, 310, 705);
            doc.font('Helvetica');

            // ---- FIRME ----
            doc.text('Firma ____________________________', 30, 780);
            doc.text('Firma ____________________________', 350, 780);

            doc.end();
            
            doc.on('end', () => {
                resolve();
            });
            
            doc.on('error', (err) => {
                reject(err);
            });
            
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateContractPDF };
