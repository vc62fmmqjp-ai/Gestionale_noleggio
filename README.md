# 🚗 Gestionale AutocentroBrutia

Gestionale web per concessionaria e autonoleggio — AutocentroBrutia S.R.L.S.

---

## ✅ Stato della versione

Il frontend è collegato alle API ed è operativo per veicoli, clienti, noleggi, manutenzioni, finanze, impostazioni e allegati. La cartella `uploads/` viene creata automaticamente dal server ed è inclusa anche nel pacchetto distribuito.

---

## 🚀 Avvio Rapido

### Prima installazione (una sola volta)
1. Assicurati di avere **Node.js** installato → [nodejs.org](https://nodejs.org)
2. Apri una finestra PowerShell/CMD nella cartella del progetto
3. Esegui: `npm install`

### Avvio giornaliero
**Metodo 1 — Doppio click su `start.bat`** _(raccomandato)_

**Metodo 2 — Da terminale:**
```bash
npm start
```

### Accesso
- **Da questo PC:** http://localhost:3000
- **Da altri PC in rete:** http://[IP-DEL-SERVER]:3000

---

## 📁 Struttura Progetto

```
autonoleggio-gestionale/
├── server.js              # Entry point server
├── package.json           # Dipendenze Node.js
├── start.bat              # Avvio Windows con doppio click
├── database/
│   ├── db.js              # Inizializzazione SQLite
│   └── gestionale.db      # Database (creato al primo avvio)
├── routes/                # API endpoints
│   ├── vehicles.js        # Veicoli
│   ├── customers.js       # Clienti
│   ├── contracts.js       # Contratti
│   ├── finance.js         # Finanze (incassi/spese)
│   ├── maintenance.js     # Manutenzioni
│   ├── reminders.js       # Reminder/scadenze
│   ├── settings.js        # Impostazioni
│   ├── uploads.js         # Gestione documenti
│   └── dashboard.js       # Dashboard dati
├── services/
│   ├── pdf-generator.js   # Vecchio generatore (non usato dalla nuova stampa a modello)
│   └── reminder-engine.js # Cron job scadenze
├── public/                # Frontend (HTML/CSS/JS)
│   ├── index.html         # SPA shell
│   ├── templates/contratto_noleggio.pdf # Modello ufficiale compilabile
│   ├── css/style.css      # Stili dark theme
│   └── js/
│       ├── app.js         # Router + utility globali
│       ├── api.js         # Client API
│       └── pages/         # Pagine applicazione
└── uploads/               # File caricati (creata automaticamente)
```

---

## 💡 Moduli Disponibili

| Modulo | Descrizione |
|--------|-------------|
| 📊 Dashboard | Stato flotta, scadenze, finanze del mese |
| 📅 Calendario | Planning vetture, disponibilità per data/ora e blocco sovrapposizioni |
| 🚘 Veicoli | Anagrafica, storico, manutenzioni, scadenze per auto |
| 👤 Clienti | Database clienti con storico e situazione contabile |
| 📝 Prenotazioni / Contratti | Prenotazione vettura, passaggio a noleggio, PDF e rientro |
| 💰 Finanze | Incassi/spese per veicolo, report, export CSV |
| 🔧 Manutenzioni | Interventi officina, programmazione, scadenze |
| ⚙️ Impostazioni | Dati azienda, tariffe, backup, export documenti |

---

## 📅 Flusso prenotazioni

- La prenotazione blocca subito la vettura nell'intervallo preciso di **data e ora**.
- Se una prenotazione si sovrappone a un'altra sulla stessa vettura, il salvataggio viene rifiutato.
- Un rientro alle 09:00 e una nuova partenza alle 17:00 dello stesso giorno sono consentiti.
- Dal Calendario si può cercare un intervallo e vedere subito le vetture libere.
- Le prenotazioni non ricevono subito un numero contratto definitivo; il numero viene assegnato quando premi **Genera contratto PDF**. La pratica resta comunque in stato `Prenotazione` finche non fai uscire la vettura.
- La cauzione/deposito è facoltativa e può restare a 0 €.

---


## 🧾 Contratto PDF ufficiale

Il gestionale non ridisegna più il contratto da zero. Usa il modello `public/templates/contratto_noleggio.pdf` e compila i campi modulo del PDF originale.

- Il pulsante **Genera contratto PDF** è disponibile anche quando la pratica è ancora una prenotazione.
- Il primo PDF generato assegna il numero definitivo `ACB-AAAA-NNNN` senza mettere automaticamente la vettura `In corso`.
- Prezzo giornaliero e Kasko sono considerati **IVA compresa**; imponibile e IVA vengono scorporati automaticamente.
- Con Kasko attiva le franchigie cliente usano i valori Kasko configurati (500 € di default); senza Kasko usano i valori standard (2.500 € di default).
- I dati già presenti nella scheda cliente (anagrafica e patente) vengono riportati automaticamente sul contratto.
- Il PDF finale viene appiattito, quindi i campi compilati non possono essere modificati accidentalmente.

Per compilare il modello nel browser viene caricata la libreria `pdf-lib` da CDN solo quando premi il pulsante PDF; per questa funzione serve quindi una connessione Internet. Tutto il resto del gestionale continua a funzionare in locale anche senza Internet.

---

## 💾 Backup

Il database è un singolo file: `database/gestionale.db`

**Per fare un backup manuale:** copia questo file in una cartella sicura.

**Backup automatico dall'app:** Impostazioni → Scarica Backup Database

**Export allegati:** Impostazioni → Esporta allegati ZIP

---

## 🔧 Aggiornamento configurazione azienda

Al primo avvio, vai su **Impostazioni** e verifica/aggiorna:
- Dati azienda (nome, indirizzo, telefono, email, P.IVA)
- Prezzo polizza Kasko
- Franchigie default
- Aliquota IVA
- Giorni anticipo reminder

---

## 🌐 Accesso da secondo PC

1. Sul PC server, nota l'indirizzo IP (es. `192.168.1.10`)
2. Sul secondo PC, apri browser e vai su `http://192.168.1.10:3000`
3. Entrambi i PC accedono allo stesso database in tempo reale

---

## ❓ Supporto

In caso di problemi, controllare:
1. Node.js installato correttamente: `node --version`
2. Dipendenze installate: `npm install`
3. Porta 3000 non occupata da altri programmi
4. Firewall Windows permette accesso alla porta 3000 (per accesso LAN)
