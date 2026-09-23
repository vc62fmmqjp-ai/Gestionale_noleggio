document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
});

async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    let contracts = [], maintenance = [], reminders = [];

    // Recupero Dati (Contratti, Manutenzione, Promemoria)
    try {
        const [resContracts, resMaintenance, resReminders] = await Promise.allSettled([
            fetch('/api/contracts'),
            fetch('/api/maintenance'),
            fetch('/api/reminders')
        ]);

        if (resContracts.status === 'fulfilled' && resContracts.value.ok) {
            contracts = await resContracts.value.json();
        }
        if (resMaintenance.status === 'fulfilled' && resMaintenance.value.ok) {
            maintenance = await resMaintenance.value.json();
        }
        if (resReminders.status === 'fulfilled' && resReminders.value.ok) {
            reminders = await resReminders.value.json();
        }
    } catch (error) {
        console.error('Errore nel recupero dei dati del calendario:', error);
    }

    // Mappatura eventi per il calendario
    const events = [
        ...contracts.map(c => ({
            title: `Noleggio: ${c.customerName || 'Cliente'}`,
            start: c.startDate || new Date().toISOString(),
            end: c.endDate,
            color: '#0d6efd',
            url: c.id ? `/contracts/${c.id}` : null
        })),
        ...maintenance.map(m => ({
            title: `Manutenzione: ${m.vehiclePlate || 'Veicolo'}`,
            start: m.date || new Date().toISOString(),
            color: '#dc3545',
            allDay: true
        })),
        ...reminders.map(r => ({
            title: `Memo: ${r.note || 'Avviso'}`,
            start: r.dueDate || new Date().toISOString(),
            color: '#ffc107',
            textColor: '#000'
        }))
    ];

    // Se è disponibile FullCalendar, inizializzalo, altrimenti fallback visivo di base
    if (typeof FullCalendar !== 'undefined') {
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'it',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listMonth'
            },
            buttonText: {
                today: 'Oggi',
                month: 'Mese',
                week: 'Settimana',
                list: 'Agenda'
            },
            events: events,
            eventClick: function(info) {
                if (info.event.url) {
                    info.jsEvent.preventDefault(); // Previeni navigazione default
                    window.location.href = info.event.url;
                }
            }
        });
        calendar.render();
    } else {
        // Fallback se FullCalendar non è incluso
        calendarEl.innerHTML = `<div class="alert alert-warning">
            FullCalendar non è caricato. Sono stati trovati ${events.length} eventi. 
            Controllare la console per i dettagli.
        </div>`;
        console.log('Eventi del calendario:', events);
    }
}
