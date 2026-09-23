document.addEventListener('DOMContentLoaded', () => {
    loadContracts();
    setupWizardListeners();
});

function loadContracts() {
    fetch('/api/contracts')
        .then(res => res.ok ? res.json() : [])
        .then(contracts => {
            const listEl = document.getElementById('contracts-list');
            if (!listEl) return;
            listEl.innerHTML = '';
            contracts.forEach(contract => {
                listEl.innerHTML += `
                    <div class="contract-item">
                        <span>Contratto #${contract.id} - ${contract.clientName}</span>
                        <button onclick="viewContractDetail(${contract.id})">Dettagli</button>
                        <button onclick="openCheckInModal(${contract.id})">Check-in</button>
                    </div>
                `;
            });
        })
        .catch(err => console.error('Errore caricamento contratti:', err));
}

window.viewContractDetail = function(id) {
    fetch(`/api/contracts/${id}`)
        .then(res => res.json())
        .then(data => {
            const detailEl = document.getElementById('contract-detail-content');
            if (detailEl) {
                detailEl.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
            }
            document.getElementById('contractDetailModal').style.display = 'block';
        });
};

/* --- Wizard Modale per Creazione Contratto (6 Step) --- */
let currentStep = 1;
const totalSteps = 6;

window.openNewContractModal = function() {
    currentStep = 1;
    updateWizardUI();
    const modal = document.getElementById('newContractModal');
    if (modal) modal.style.display = 'block';
};

window.closeNewContractModal = function() {
    const modal = document.getElementById('newContractModal');
    if (modal) modal.style.display = 'none';
};

function setupWizardListeners() {
    const nextBtn = document.getElementById('wizard-next-btn');
    const prevBtn = document.getElementById('wizard-prev-btn');
    const saveBtn = document.getElementById('wizard-save-btn');

    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentStep < totalSteps) {
            currentStep++;
            updateWizardUI();
        }
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    });

    if (saveBtn) saveBtn.addEventListener('click', saveNewContract);
}

function updateWizardUI() {
    for (let i = 1; i <= totalSteps; i++) {
        const stepEl = document.getElementById(`wizard-step-${i}`);
        if (stepEl) {
            stepEl.style.display = (i === currentStep) ? 'block' : 'none';
        }
    }
    
    // Aggiorna bottoni
    const nextBtn = document.getElementById('wizard-next-btn');
    const prevBtn = document.getElementById('wizard-prev-btn');
    const saveBtn = document.getElementById('wizard-save-btn');
    const stepTitle = document.getElementById('wizard-step-title');

    if (prevBtn) prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-block';
    if (nextBtn) nextBtn.style.display = currentStep === totalSteps ? 'none' : 'inline-block';
    if (saveBtn) saveBtn.style.display = currentStep === totalSteps ? 'inline-block' : 'none';

    const stepTitles = [
        "Seleziona Cliente",
        "Seleziona Veicolo",
        "Date & Tariffa",
        "Franchigie & Deposito",
        "Secondo Conducente",
        "Riepilogo"
    ];
    if (stepTitle) stepTitle.innerText = `Step ${currentStep}: ${stepTitles[currentStep - 1]}`;
}

function saveNewContract() {
    // Raccoglie dati dai form nei vari step del wizard
    const formData = new FormData(document.getElementById('new-contract-form'));
    const contractData = Object.fromEntries(formData.entries());

    fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractData)
    })
    .then(res => res.json())
    .then(data => {
        alert("Contratto creato con successo!");
        closeNewContractModal();
        loadContracts();
    })
    .catch(err => alert("Errore durante la creazione del contratto"));
}

/* --- Check-in Modale --- */
window.openCheckInModal = function(contractId) {
    const modal = document.getElementById('checkInModal');
    if (modal) {
        document.getElementById('checkin-contract-id').value = contractId;
        modal.style.display = 'block';
    }
};

window.closeCheckInModal = function() {
    const modal = document.getElementById('checkInModal');
    if (modal) modal.style.display = 'none';
};

window.submitCheckIn = function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const contractId = formData.get('contract_id');

    fetch(`/api/contracts/${contractId}/checkin`, {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(() => {
        alert("Check-in completato");
        closeCheckInModal();
        loadContracts();
    });
};
