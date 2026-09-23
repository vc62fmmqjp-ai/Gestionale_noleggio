// public/js/pages/customers.js
document.addEventListener('DOMContentLoaded', () => {
    loadCustomers();

    const form = document.getElementById('customer-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const id = data.id;

            try {
                const method = id ? 'PUT' : 'POST';
                const url = id ? `/api/customers/${id}` : '/api/customers';
                
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    closeCustomerModal();
                    loadCustomers();
                } else {
                    alert('Error saving customer');
                }
            } catch (error) {
                console.error('Error saving customer:', error);
            }
        });
    }
});

async function loadCustomers() {
    try {
        const response = await fetch('/api/customers');
        if (!response.ok) throw new Error('Network response was not ok');
        const customers = await response.json();
        renderCustomersList(customers);
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

function renderCustomersList(customers) {
    const container = document.getElementById('customers-list');
    if (!container) return;
    
    if (customers.length === 0) {
        container.innerHTML = '<p>No customers found.</p>';
        return;
    }

    let html = '<table class="table"><thead><tr><th>First Name</th><th>Last Name</th><th>Email</th><th>Actions</th></tr></thead><tbody>';
    customers.forEach(c => {
        html += `
            <tr>
                <td>${c.firstName || ''}</td>
                <td>${c.lastName || ''}</td>
                <td>${c.email || ''}</td>
                <td>
                    <button onclick="openCustomerDetail('${c.id}')">View</button>
                    <button onclick="editCustomer('${c.id}')">Edit</button>
                    <button onclick="deleteCustomer('${c.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

window.openNewCustomerModal = function() {
    const modal = document.getElementById('customer-form-modal');
    if (modal) {
        modal.style.display = 'block';
        const form = document.getElementById('customer-form');
        if (form) {
            form.reset();
            if (form.elements['id']) form.elements['id'].value = '';
        }
    }
};

window.closeCustomerModal = function() {
    const modal = document.getElementById('customer-form-modal');
    if (modal) modal.style.display = 'none';
};

window.editCustomer = async function(id) {
    try {
        const response = await fetch(`/api/customers/${id}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const customer = await response.json();
        
        window.openNewCustomerModal();
        const form = document.getElementById('customer-form');
        if (form) {
            for (const key in customer) {
                if (form.elements[key]) {
                    form.elements[key].value = customer[key];
                }
            }
        }
    } catch (error) {
        console.error('Error loading customer for edit:', error);
    }
};

window.deleteCustomer = async function(id) {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
        const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
        if (response.ok) {
            loadCustomers();
        } else {
            alert('Error deleting customer');
        }
    } catch (error) {
        console.error('Error deleting customer:', error);
    }
};

window.openCustomerDetail = async function(id) {
    const modal = document.getElementById('customer-detail-modal');
    if (modal) {
        modal.style.display = 'block';
        await loadCustomerDetails(id);
    }
};

window.closeCustomerDetail = function() {
    const modal = document.getElementById('customer-detail-modal');
    if (modal) modal.style.display = 'none';
};

async function loadCustomerDetails(id) {
    try {
        const [customerRes, contractsRes, financesRes] = await Promise.all([
            fetch(`/api/customers/${id}`),
            fetch(`/api/customers/${id}/contracts`),
            fetch(`/api/customers/${id}/finances`)
        ]);

        const customer = customerRes.ok ? await customerRes.json() : {};
        const contracts = contractsRes.ok ? await contractsRes.json() : [];
        const finances = financesRes.ok ? await financesRes.json() : [];

        const infoContainer = document.getElementById('customer-detail-info');
        if (infoContainer) {
            infoContainer.innerHTML = `<h3>${customer.firstName || ''} ${customer.lastName || ''} - ${customer.email || ''}</h3>`;
        }

        renderCustomerTabs('customer-tabs-container', {
            'Contracts': renderCustomerList(contracts, 'Contract'),
            'Finances': renderCustomerList(finances, 'Finance')
        });
    } catch (error) {
        console.error('Error loading customer details:', error);
    }
}

function renderCustomerList(items, type) {
    if (!items || items.length === 0) return `<p>No ${type.toLowerCase()}s found.</p>`;
    let html = '<ul>';
    items.forEach(item => {
        html += `<li>${JSON.stringify(item)}</li>`;
    });
    html += '</ul>';
    return html;
}

function renderCustomerTabs(containerId, tabsData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = '<div class="tabs"><div class="tab-headers">';
    let first = true;
    for (const tab in tabsData) {
        html += `<button class="tab-btn ${first ? 'active' : ''}" onclick="showCustomerTab(this, '${tab}')">${tab}</button>`;
        first = false;
    }
    html += '</div><div class="tab-content">';
    
    first = true;
    for (const tab in tabsData) {
        html += `<div id="c-tab-${tab}" class="tab-pane" style="display:${first ? 'block' : 'none'}">${tabsData[tab]}</div>`;
        first = false;
    }
    html += '</div></div>';
    
    container.innerHTML = html;
}

window.showCustomerTab = function(btn, tabName) {
    const tabsContainer = btn.closest('.tabs');
    tabsContainer.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    tabsContainer.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const tab = tabsContainer.querySelector(`#c-tab-${tabName}`);
    if (tab) tab.style.display = 'block';
    btn.classList.add('active');
};

window.openCustomerSelector = async function(onSelectCallback) {
    const modal = document.getElementById('customer-selector-modal');
    if (!modal) return;
    
    modal.style.display = 'block';
    
    try {
        const response = await fetch('/api/customers');
        if (!response.ok) throw new Error('Network response was not ok');
        const customers = await response.json();
        const container = document.getElementById('customer-selector-list');
        
        if (container) {
            let html = '<ul class="selector-list">';
            customers.forEach(c => {
                html += `<li>
                    <button onclick="selectCustomer('${c.id}', '${c.firstName || ''} ${c.lastName || ''}')">
                        ${c.firstName || ''} ${c.lastName || ''} (${c.email || ''})
                    </button>
                </li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
        }
        
        window.selectCustomer = function(id, name) {
            if (typeof onSelectCallback === 'function') {
                onSelectCallback({ id, name });
            }
            modal.style.display = 'none';
        };
    } catch (error) {
        console.error('Error loading customers for selector:', error);
    }
};

window.closeCustomerSelector = function() {
    const modal = document.getElementById('customer-selector-modal');
    if (modal) modal.style.display = 'none';
};
