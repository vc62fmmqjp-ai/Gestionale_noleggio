document.addEventListener('DOMContentLoaded', () => {
    loadMaintenanceList();
    loadUpcomingMaintenance();
    setupMaintenanceForm();
});

function loadMaintenanceList() {
    fetch('/api/maintenance')
        .then(res => res.ok ? res.json() : [])
        .then(data => {
            const listEl = document.getElementById('maintenance-list');
            if (!listEl) return;
            listEl.innerHTML = '';
            data.forEach(item => {
                listEl.innerHTML += `
                    <div class="maintenance-item">
                        <span>Veicolo: ${item.vehicleName} - Data: ${item.date}</span>
                        <span>Tipo: ${item.type} | Costo: €${item.cost}</span>
                        <button onclick="editMaintenance(${item.id})">Modifica</button>
                    </div>
                `;
            });
        })
        .catch(err => console.error('Errore caricamento manutenzioni:', err));
}

function loadUpcomingMaintenance() {
    fetch('/api/maintenance/upcoming')
        .then(res => res.ok ? res.json() : [])
        .then(data => {
            const upcomingEl = document.getElementById('upcoming-maintenance-list');
            if (!upcomingEl) return;
            upcomingEl.innerHTML = '';
            data.forEach(item => {
                upcomingEl.innerHTML += `
                    <div class="maintenance-item upcoming">
                        <strong>Scadenza imminente:</strong> Veicolo ${item.vehicleName} - ${item.description}
                    </div>
                `;
            });
        })
        .catch(err => console.error('Errore caricamento scadenze:', err));
}

window.openMaintenanceModal = function(id = null) {
    const form = document.getElementById('maintenance-form');
    if (form) form.reset();
    
    document.getElementById('maintenance-id').value = id || '';
    
    if (id) {
        // Popola per modifica
        fetch(`/api/maintenance/${id}`)
            .then(res => res.json())
            .then(data => {
                for (const key in data) {
                    const input = form.elements[key];
                    if (input) input.value = data[key];
                }
            });
    }

    const modal = document.getElementById('maintenanceModal');
    if (modal) modal.style.display = 'block';
};

window.closeMaintenanceModal = function() {
    const modal = document.getElementById('maintenanceModal');
    if (modal) modal.style.display = 'none';
};

function setupMaintenanceForm() {
    const form = document.getElementById('maintenance-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const dataObj = Object.fromEntries(formData.entries());
            const id = dataObj.id;
            
            const url = id ? `/api/maintenance/${id}` : '/api/maintenance';
            const method = id ? 'PUT' : 'POST';

            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataObj)
            })
            .then(res => {
                if (res.ok) {
                    alert('Manutenzione salvata con successo');
                    closeMaintenanceModal();
                    loadMaintenanceList();
                    loadUpcomingMaintenance();
                } else {
                    alert('Errore nel salvataggio');
                }
            })
            .catch(err => console.error(err));
        });
    }
}
