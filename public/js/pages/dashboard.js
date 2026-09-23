document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

async function initDashboard() {
    // Inizializza i grafici con Chart.js
    const chartCanvas = document.getElementById('revenueChart');
    if (chartCanvas && typeof Chart !== 'undefined') {
        new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
                datasets: [{
                    label: 'Fatturato mensile (€)',
                    data: [1200, 1900, 3000, 5000, 4000, 6000, 8000, 9500, 6000, 4500, 3000, 2000],
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Gestione Azioni Rapide
    const btnNewContract = document.getElementById('btn-new-contract');
    const btnNewCustomer = document.getElementById('btn-new-customer');
    const btnNewVehicle = document.getElementById('btn-new-vehicle');

    if (btnNewContract) {
        btnNewContract.addEventListener('click', () => {
            if (typeof window.openNewContractModal === 'function') {
                window.openNewContractModal();
            } else {
                console.warn('Funzione openNewContractModal non definita.');
            }
        });
    }

    if (btnNewCustomer) {
        btnNewCustomer.addEventListener('click', () => {
            if (typeof window.openNewCustomerModal === 'function') {
                window.openNewCustomerModal();
            } else {
                console.warn('Funzione openNewCustomerModal non definita.');
            }
        });
    }

    if (btnNewVehicle) {
        btnNewVehicle.addEventListener('click', () => {
            if (typeof window.openNewVehicleModal === 'function') {
                window.openNewVehicleModal();
            } else {
                console.warn('Funzione openNewVehicleModal non definita.');
            }
        });
    }

    // Aggiornamento Statistiche (mock per demo o fallback)
    updateStatCards();
}

async function updateStatCards() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (response.ok) {
            const stats = await response.json();
            if (document.getElementById('stat-active-rentals')) document.getElementById('stat-active-rentals').textContent = stats.activeRentals || 0;
            if (document.getElementById('stat-available-vehicles')) document.getElementById('stat-available-vehicles').textContent = stats.availableVehicles || 0;
            if (document.getElementById('stat-monthly-revenue')) document.getElementById('stat-monthly-revenue').textContent = `€ ${stats.monthlyRevenue || 0}`;
            if (document.getElementById('stat-alerts')) document.getElementById('stat-alerts').textContent = stats.alerts || 0;
        }
    } catch (error) {
        console.error('Errore nel recupero delle statistiche della dashboard:', error);
        // Fallback locale
        if (document.getElementById('stat-active-rentals')) document.getElementById('stat-active-rentals').textContent = '12';
        if (document.getElementById('stat-available-vehicles')) document.getElementById('stat-available-vehicles').textContent = '34';
        if (document.getElementById('stat-monthly-revenue')) document.getElementById('stat-monthly-revenue').textContent = '€ 12.500';
        if (document.getElementById('stat-alerts')) document.getElementById('stat-alerts').textContent = '3';
    }
}
