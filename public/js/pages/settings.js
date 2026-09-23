document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }

    const btnBackup = document.getElementById('btn-backup');
    if (btnBackup) {
        btnBackup.addEventListener('click', handleBackup);
    }

    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', handleExport);
    }
});

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            const data = await response.json();
            
            // Popola i campi del modulo con le impostazioni dell'azienda e noleggio
            const fields = ['companyName', 'companyAddress', 'companyVat', 'companyEmail', 'companyPhone', 'defaultRentalDays', 'currency'];
            
            fields.forEach(field => {
                const el = document.getElementById(field);
                if (el && data[field] !== undefined) {
                    el.value = data[field];
                }
            });
        } else {
            console.warn('Impossibile caricare le impostazioni.');
        }
    } catch (error) {
        console.error('Errore di rete durante il caricamento delle impostazioni:', error);
    }
}

async function saveSettings(event) {
    event.preventDefault();
    
    const settings = {
        companyName: document.getElementById('companyName')?.value || '',
        companyAddress: document.getElementById('companyAddress')?.value || '',
        companyVat: document.getElementById('companyVat')?.value || '',
        companyEmail: document.getElementById('companyEmail')?.value || '',
        companyPhone: document.getElementById('companyPhone')?.value || '',
        defaultRentalDays: parseInt(document.getElementById('defaultRentalDays')?.value || '1', 10),
        currency: document.getElementById('currency')?.value || 'EUR'
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            alert('Impostazioni salvate con successo!');
        } else {
            alert('Si è verificato un errore durante il salvataggio delle impostazioni.');
        }
    } catch (error) {
        console.error('Errore durante il salvataggio:', error);
        alert('Errore di connessione al server.');
    }
}

function handleBackup() {
    if (confirm('Vuoi scaricare un backup completo del database?')) {
        window.location.href = '/api/settings/backup';
    }
}

function handleExport() {
    if (confirm('Vuoi esportare i dati in formato CSV?')) {
        window.location.href = '/api/settings/export';
    }
}
