const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/db');
const { startReminderEngine } = require('./services/reminder-engine');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Il frontend viene sempre ricaricato: evita che smartphone o Safari mostrino
// una versione precedente dopo gli aggiornamenti del gestionale.
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (/\.(js|css|html|webmanifest)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/dashboard', require('./routes/dashboard'));

// SPA fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('Frontend non ancora disponibile. API attive.');
    }
});

// Initialize DB and start server
initDatabase();
startReminderEngine();

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server avviato con successo!`);
    console.log(`URL locale: http://localhost:${PORT}`);
    console.log(`Per accesso in LAN usa l'IP di questa macchina al posto di localhost (es. http://192.168.x.x:${PORT})`);
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERRORE: la porta ${PORT} e' gia in uso. Chiudi l'altra finestra del gestionale oppure premi CTRL+C al suo interno, poi riprova.`);
    } else {
        console.error(`ERRORE nell'avvio del server: ${err.message}`);
    }
    process.exit(1);
});
