// public/js/pages/vehicles.js
document.addEventListener('DOMContentLoaded', () => {
    loadVehicles();

    const form = document.getElementById('vehicle-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const id = data.id;

            try {
                const method = id ? 'PUT' : 'POST';
                const url = id ? `/api/vehicles/${id}` : '/api/vehicles';
                
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    closeVehicleModal();
                    loadVehicles();
                } else {
                    alert('Error saving vehicle');
                }
            } catch (error) {
                console.error('Error saving vehicle:', error);
            }
        });
    }
});

async function loadVehicles() {
    try {
        const response = await fetch('/api/vehicles');
        if (!response.ok) throw new Error('Network response was not ok');
        const vehicles = await response.json();
        renderVehiclesList(vehicles);
    } catch (error) {
        console.error('Error loading vehicles:', error);
    }
}

function renderVehiclesList(vehicles) {
    const container = document.getElementById('vehicles-list');
    if (!container) return;
    
    if (vehicles.length === 0) {
        container.innerHTML = '<p>No vehicles found.</p>';
        return;
    }

    let html = '<table class="table"><thead><tr><th>Make</th><th>Model</th><th>Plate</th><th>Actions</th></tr></thead><tbody>';
    vehicles.forEach(v => {
        html += `
            <tr>
                <td>${v.make || ''}</td>
                <td>${v.model || ''}</td>
                <td>${v.plate || ''}</td>
                <td>
                    <button onclick="openVehicleDetail('${v.id}')">View</button>
                    <button onclick="editVehicle('${v.id}')">Edit</button>
                    <button onclick="deleteVehicle('${v.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

window.openNewVehicleModal = function() {
    const modal = document.getElementById('vehicle-form-modal');
    if (modal) {
        modal.style.display = 'block';
        const form = document.getElementById('vehicle-form');
        if (form) {
            form.reset();
            if (form.elements['id']) form.elements['id'].value = '';
        }
    }
};

window.closeVehicleModal = function() {
    const modal = document.getElementById('vehicle-form-modal');
    if (modal) modal.style.display = 'none';
};

window.editVehicle = async function(id) {
    try {
        const response = await fetch(`/api/vehicles/${id}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const vehicle = await response.json();
        
        window.openNewVehicleModal();
        const form = document.getElementById('vehicle-form');
        if (form) {
            for (const key in vehicle) {
                if (form.elements[key]) {
                    form.elements[key].value = vehicle[key];
                }
            }
        }
    } catch (error) {
        console.error('Error loading vehicle for edit:', error);
    }
};

window.deleteVehicle = async function(id) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;
    try {
        const response = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
        if (response.ok) {
            loadVehicles();
        } else {
            alert('Error deleting vehicle');
        }
    } catch (error) {
        console.error('Error deleting vehicle:', error);
    }
};

window.openVehicleDetail = async function(id) {
    const modal = document.getElementById('vehicle-detail-modal');
    if (modal) {
        modal.style.display = 'block';
        await loadVehicleDetails(id);
    }
};

window.closeVehicleDetail = function() {
    const modal = document.getElementById('vehicle-detail-modal');
    if (modal) modal.style.display = 'none';
};

async function loadVehicleDetails(id) {
    try {
        const [vehicleRes, contractsRes, financesRes, maintenanceRes, scadenzeRes] = await Promise.all([
            fetch(`/api/vehicles/${id}`),
            fetch(`/api/vehicles/${id}/contracts`),
            fetch(`/api/vehicles/${id}/finances`),
            fetch(`/api/vehicles/${id}/maintenance`),
            fetch(`/api/vehicles/${id}/scadenze`)
        ]);

        const vehicle = vehicleRes.ok ? await vehicleRes.json() : {};
        const contracts = contractsRes.ok ? await contractsRes.json() : [];
        const finances = financesRes.ok ? await financesRes.json() : [];
        const maintenance = maintenanceRes.ok ? await maintenanceRes.json() : [];
        const scadenze = scadenzeRes.ok ? await scadenzeRes.json() : [];

        const infoContainer = document.getElementById('vehicle-detail-info');
        if (infoContainer) {
            infoContainer.innerHTML = `<h3>${vehicle.make || ''} ${vehicle.model || ''} - ${vehicle.plate || ''}</h3>`;
        }

        renderVehicleTabs('vehicle-tabs-container', {
            'Contracts': renderList(contracts, 'Contract'),
            'Finances': renderList(finances, 'Finance'),
            'Maintenance': renderList(maintenance, 'Maintenance'),
            'Scadenze': renderList(scadenze, 'Scadenza')
        });
    } catch (error) {
        console.error('Error loading vehicle details:', error);
    }
}

function renderList(items, type) {
    if (!items || items.length === 0) return `<p>No ${type.toLowerCase()}s found.</p>`;
    let html = '<ul>';
    items.forEach(item => {
        html += `<li>${JSON.stringify(item)}</li>`;
    });
    html += '</ul>';
    return html;
}

function renderVehicleTabs(containerId, tabsData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = '<div class="tabs"><div class="tab-headers">';
    let first = true;
    for (const tab in tabsData) {
        html += `<button class="tab-btn ${first ? 'active' : ''}" onclick="showVehicleTab(this, '${tab}')">${tab}</button>`;
        first = false;
    }
    html += '</div><div class="tab-content">';
    
    first = true;
    for (const tab in tabsData) {
        html += `<div id="v-tab-${tab}" class="tab-pane" style="display:${first ? 'block' : 'none'}">${tabsData[tab]}</div>`;
        first = false;
    }
    html += '</div></div>';
    
    container.innerHTML = html;
}

window.showVehicleTab = function(btn, tabName) {
    const tabsContainer = btn.closest('.tabs');
    tabsContainer.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    tabsContainer.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const tab = tabsContainer.querySelector(`#v-tab-${tabName}`);
    if (tab) tab.style.display = 'block';
    btn.classList.add('active');
};
