document.addEventListener('DOMContentLoaded', () => {
    loadFinanceSummary();
    setupTabs();
    setupForms();
});

function loadFinanceSummary() {
    fetch('/api/finance/summary')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (!data) return;
            const summaryEl = document.getElementById('finance-summary');
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <p>Entrate Totali: €${data.totalIncome}</p>
                    <p>Uscite Totali: €${data.totalExpenses}</p>
                    <p>Bilancio: €${data.balance}</p>
                `;
            }
            renderChart(data.chartData);
        })
        .catch(err => console.error('Errore caricamento riepilogo finanziario:', err));
}

function setupTabs() {
    const tabs = ['income', 'expenses', 'per-vehicle'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`tab-${tab}`);
        if (btn) {
            btn.addEventListener('click', () => switchTab(tab, tabs));
        }
    });
}

function switchTab(activeTab, allTabs) {
    allTabs.forEach(tab => {
        const content = document.getElementById(`content-${tab}`);
        const btn = document.getElementById(`tab-${tab}`);
        if (content) {
            content.style.display = tab === activeTab ? 'block' : 'none';
        }
        if (btn) {
            btn.classList.toggle('active', tab === activeTab);
        }
    });
}

function setupForms() {
    const incomeForm = document.getElementById('income-form');
    if (incomeForm) {
        incomeForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            fetch('/api/finance/income', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(formData.entries()))
            })
            .then(() => {
                alert('Entrata registrata!');
                this.reset();
                loadFinanceSummary();
            });
        });
    }

    const expenseForm = document.getElementById('expense-form');
    if (expenseForm) {
        expenseForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            fetch('/api/finance/expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(formData.entries()))
            })
            .then(() => {
                alert('Spesa registrata!');
                this.reset();
                loadFinanceSummary();
            });
        });
    }
}

window.exportFinance = function() {
    window.open('/api/finance/export', '_blank');
};

function renderChart(chartData) {
    const canvas = document.getElementById('financeChart');
    if (!canvas || !chartData) return;
    
    // Placeholder logic for chart rendering
    // Expected to use a library like Chart.js
    console.log("Rendering grafico con i dati:", chartData);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText("Grafico Finanziario Caricato", 10, 50);
}
