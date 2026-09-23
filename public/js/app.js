(function () {
    const appContent = () => document.getElementById('app-content');
    const pageTitle = () => document.getElementById('page-title');

    // ---------- UI helpers ----------
    window.showLoader = () => document.getElementById('loader')?.classList.add('show');
    window.hideLoader = () => document.getElementById('loader')?.classList.remove('show');

    window.showToast = (message, type = 'success') => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconClass = type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-check-circle';
        toast.innerHTML = `<span>${escapeHtml(message)}</span><i class="fas ${iconClass}"></i>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    };

    window.showModal = (title, contentHtml) => {
        const modal = document.getElementById('modal-container');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        if (!modal || !modalTitle || !modalBody) return;
        modalTitle.textContent = title;
        modalBody.innerHTML = contentHtml;
        modal.classList.add('show');
    };

    window.closeModal = () => document.getElementById('modal-container')?.classList.remove('show');

    window.showConfirm = (message, onConfirm) => {
        showModal('Conferma operazione', `
            <p>${escapeHtml(message)}</p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="confirm-cancel">Annulla</button>
                <button type="button" class="btn btn-danger" id="confirm-ok">Conferma</button>
            </div>
        `);
        document.getElementById('confirm-cancel')?.addEventListener('click', closeModal);
        document.getElementById('confirm-ok')?.addEventListener('click', async () => {
            closeModal();
            if (typeof onConfirm === 'function') await onConfirm();
        });
    };

    window.formatCurrency = value => {
        const num = Number(value || 0);
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(num) ? num : 0);
    };

    window.formatDate = value => {
        if (!value) return '—';
        const parts = String(value).slice(0, 10).split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return String(value);
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[c]);
    }

    function attr(value) { return escapeHtml(value ?? ''); }
    function val(value) { return value == null ? '' : String(value); }
    function today() { return new Date().toISOString().slice(0, 10); }

    function statusBadge(status) {
        const labels = {
            disponibile: 'Disponibile', noleggiato: 'Noleggiato', manutenzione: 'Manutenzione', sostituzione: 'Sostituzione', fuori_servizio: 'Fuori servizio',
            prenotazione: 'Prenotazione', in_corso: 'In corso', concluso: 'Concluso', annullato: 'Annullato'
        };
        const cls = status === 'disponibile' || status === 'concluso' ? 'badge-success'
            : status === 'noleggiato' || status === 'in_corso' ? 'badge-info'
            : status === 'manutenzione' || status === 'prenotazione' ? 'badge-warning'
            : status === 'sostituzione' || status === 'annullato' || status === 'fuori_servizio' ? 'badge-danger' : 'badge-default';
        return `<span class="badge ${cls}">${escapeHtml(labels[status] || status || '—')}</span>`;
    }

    function emptyState(icon, title, text, actionHtml = '') {
        return `<div class="empty-state"><i class="fas ${icon}"></i><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${actionHtml}</div>`;
    }

    function field(label, name, value = '', type = 'text', extra = '') {
        return `<div class="form-group"><label class="form-label" for="${name}">${label}</label><input class="form-control" id="${name}" name="${name}" type="${type}" value="${attr(value)}" ${extra}></div>`;
    }

    function textarea(label, name, value = '', extra = '') {
        return `<div class="form-group form-span-2"><label class="form-label" for="${name}">${label}</label><textarea class="form-control" id="${name}" name="${name}" ${extra}>${escapeHtml(value)}</textarea></div>`;
    }

    function selectField(label, name, selected, options, extra = '') {
        const opts = options.map(([value, text]) => `<option value="${attr(value)}" ${String(selected ?? '') === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('');
        return `<div class="form-group"><label class="form-label" for="${name}">${label}</label><select class="form-control" id="${name}" name="${name}" ${extra}>${opts}</select></div>`;
    }

    function formDataToObject(form) {
        const data = Object.fromEntries(new FormData(form).entries());
        Object.keys(data).forEach(key => { if (data[key] === '') data[key] = null; });
        return data;
    }

    function handleRenderError(err, section) {
        console.error(err);
        if (appContent()) {
            appContent().innerHTML = `<div class="card"><div class="card-body">${emptyState('fa-triangle-exclamation', `Errore in ${section}`, err.message || 'Impossibile caricare i dati.', `<button class="btn btn-primary" onclick="window.location.reload()"><i class="fas fa-rotate"></i> Riprova</button>`)}</div></div>`;
        }
    }

    function makeSortableTable({ tableEl, data, rowHtml, columnGetters, emptyHtml = () => '' }) {
        if (!tableEl) return null;
        const tbody = tableEl.querySelector('tbody');
        const ths = Array.from(tableEl.querySelectorAll('thead th'));
        if (!tbody || ths.length === 0) return null;
        let sortIndex = -1;
        let sortDir = 1;
        let filter = () => data;

        const cleanValue = v => v == null ? '' : (typeof v === 'string' ? v.trim() : v);

        const sorted = list => {
            if (sortIndex < 0) return list;
            const getter = columnGetters[sortIndex];
            if (!getter) return list;
            return [...list].sort((a, b) => {
                const va = cleanValue(getter(a));
                const vb = cleanValue(getter(b));
                if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
                const na = Number(va), nb = Number(vb);
                if (va !== '' && vb !== '' && isFinite(na) && isFinite(nb)) return (na - nb) * sortDir;
                return String(va).localeCompare(String(vb), 'it', { numeric: true, sensitivity: 'base' }) * sortDir;
            });
        };

        const refresh = () => {
            const list = sorted(filter());
            tbody.innerHTML = list.length ? list.map(rowHtml).join('') : emptyHtml(list);
        };

        ths.forEach((th, i) => {
            if (!columnGetters[i]) return;
            th.classList.add('sortable');
            th.addEventListener('click', () => {
                if (sortIndex === i) { sortDir = -sortDir; } else { sortIndex = i; sortDir = 1; }
                ths.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
                refresh();
            });
        });

        return { refresh, setFilter: fn => { filter = fn; } };
    }

    function attachmentSection(entityType, entityId) {
        return `<hr class="separator"><div class="attachment-header"><h4>Allegati</h4><small class="text-muted">Documenti, foto o scansioni · le foto (es. fronte/retro) si possono unire in un unico PDF</small></div>
            <form class="attachment-form" onsubmit="uploadAttachment(event,'${entityType}',${entityId})">
                <input class="form-control" type="file" name="file" multiple required>
                <button class="btn btn-secondary" type="submit"><i class="fas fa-paperclip"></i> Carica</button>
            </form>
            <div id="attachments-tools-${entityType}-${entityId}" class="attachments-tools"></div>
            <div id="attachments-list" class="attachments-list"><span class="text-muted">Caricamento allegati…</span></div>`;
    }

    async function loadAttachments(entityType, entityId) {
        const container = document.getElementById('attachments-list');
        if (!container) return;
        try {
            const items = await api.get(`/uploads?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`, { showLoader: false });
            container.innerHTML = items.length ? items.map(file => `<div class="attachment-row"><a href="/api/uploads/${file.id}" target="_blank" rel="noopener"><i class="fas ${isImageFile(file) ? 'fa-image' : 'fa-file'}"></i> ${escapeHtml(file.original_name || file.filename)}</a><button type="button" class="icon-btn danger" onclick="deleteAttachment(${file.id},'${entityType}',${entityId})" title="Elimina allegato"><i class="fas fa-trash"></i></button></div>`).join('') : '<p class="text-muted">Nessun allegato.</p>';
            const tools = document.getElementById(`attachments-tools-${entityType}-${entityId}`);
            if (tools) {
                const images = items.filter(isImageFile);
                tools.innerHTML = images.length
                    ? `<button type="button" class="btn btn-secondary btn-sm" onclick="openPdfConverter('${entityType}',${entityId})"><i class="fas fa-file-pdf"></i> Converti foto in PDF</button><small class="text-muted">Unisci le foto (${images.length}) in un unico PDF, ritaglia e comprimi.</small>`
                    : '';
            }
        } catch (err) {
            container.innerHTML = '<p class="text-danger">Impossibile caricare gli allegati.</p>';
        }
    }

    window.uploadAttachment = async (event, entityType, entityId) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fileInput = form.querySelector('input[type=file]');
        if (!fileInput?.files?.length) return;
        const count = fileInput.files.length;
        const fd = new FormData();
        fd.append('entity_type', entityType);
        fd.append('entity_id', entityId);
        for (const file of fileInput.files) {
            fd.append('file', file);
        }
        try {
            await api.upload('/uploads', fd);
            form.reset();
            showToast(`${count} allegat${count === 1 ? 'o' : 'i'} caricat${count === 1 ? 'o' : 'i'}`);
            await loadAttachments(entityType, entityId);
        } catch (_) {}
    };

    window.deleteAttachment = async (id, entityType, entityId) => {
        if (!window.confirm('Eliminare questo allegato?')) return;
        try {
            await api.delete(`/uploads/${id}`);
            showToast('Allegato eliminato');
            await loadAttachments(entityType, entityId);
        } catch (_) {}
    };

    // ---------- Convertitore foto -> PDF (stile CamScanner) ----------
    const isImageFile = file => /^image\/(jpeg|png|webp|bmp|gif|avif)$/i.test(file.mimetype || '');

    function findContentBox(bitmap) {
        const ANALYSIS = 400;
        const scale = Math.min(1, ANALYSIS / Math.max(bitmap.width, bitmap.height));
        const aw = Math.max(1, Math.round(bitmap.width * scale));
        const ah = Math.max(1, Math.round(bitmap.height * scale));
        const c = document.createElement('canvas');
        c.width = aw; c.height = ah;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, aw, ah);
        ctx.drawImage(bitmap, 0, 0, aw, ah);
        const data = ctx.getImageData(0, 0, aw, ah).data;
        let minX = aw, minY = ah, maxX = -1, maxY = -1;
        for (let y = 0; y < ah; y++) {
            const row = y * aw;
            for (let x = 0; x < aw; x++) {
                const i = (row + x) * 4;
                if (data[i + 3] > 200 && data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return null;
        const x = Math.max(0, Math.floor(minX / scale * 0.975));
        const y = Math.max(0, Math.floor(minY / scale * 0.975));
        const w = Math.min(bitmap.width - x, Math.ceil((maxX - minX + 1) / scale * 1.025));
        const h = Math.min(bitmap.height - y, Math.ceil((maxY - minY + 1) / scale * 1.025));
        return { x, y, w, h };
    }

    function analysisSize(w, h, maxDim) {
        const scale = Math.min(1, maxDim / Math.max(w, h));
        return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
    }

    function drawToCanvas(bitmap, cw, ch) {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(bitmap, 0, 0, cw, ch);
        return c;
    }

    async function rectifyImage(bitmap, opts) {
        if (!window.DocScan) return null;
        const bw = bitmap.width, bh = bitmap.height;
        const analysis = analysisSize(bw, bh, 480);
        const aCtx = drawToCanvas(bitmap, analysis.w, analysis.h).getContext('2d', { willReadFrequently: true });
        const adata = aCtx.getImageData(0, 0, analysis.w, analysis.h);
        const found = window.DocScan.findDocumentCorners(adata.data, analysis.w, analysis.h);
        if (!found) return null;
        const corners = found.corners.map(p => ({ x: p.x / analysis.scale, y: p.y / analysis.scale }));
        const size = window.DocScan.warpSize(corners);
        const targetMax = opts.targetMax || 2000;
        const render = analysisSize(bw, bh, targetMax);
        const rCtx = drawToCanvas(bitmap, render.w, render.h).getContext('2d', { willReadFrequently: true });
        const rdata = rCtx.getImageData(0, 0, render.w, render.h);
        const cornersR = corners.map(p => ({ x: p.x * render.scale, y: p.y * render.scale }));
        const sizeR = {
            w: Math.max(2, Math.round(size.w * render.scale)),
            h: Math.max(2, Math.round(size.h * render.scale))
        };
        const warped = window.DocScan.warp(rdata.data, render.w, render.h, cornersR, sizeR.w, sizeR.h);
        if (!warped) return null;
        const out = document.createElement('canvas');
        out.width = warped.width; out.height = warped.height;
        out.getContext('2d').putImageData(new ImageData(warped.data, warped.width, warped.height), 0, 0);
        let final = out;
        if (opts.enhance) {
            const enhanced = document.createElement('canvas');
            enhanced.width = warped.width; enhanced.height = warped.height;
            const ectx = enhanced.getContext('2d');
            try { ectx.filter = 'contrast(1.18) saturate(1.08) brightness(1.02)'; } catch (_) {}
            ectx.drawImage(out, 0, 0);
            final = enhanced;
        }
        const blob = await new Promise(res => final.toBlob(b => res(b), 'image/jpeg', opts.quality));
        return { blob, width: warped.width, height: warped.height };
    }

    async function imageToJpeg(blob, opts) {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blob));
        const bw = bitmap.width, bh = bitmap.height;
        if (opts.rectify && window.DocScan) {
            const rect = await rectifyImage(bitmap, opts);
            bitmap.close();
            if (rect) return rect;
        }
        let crop = { x: 0, y: 0, w: bw, h: bh };
        if (opts.crop) {
            const box = findContentBox(bitmap);
            if (box && box.w >= 32 && box.h >= 32) crop = box;
        }
        const targetMax = opts.targetMax || 2000;
        const scale = Math.min(1, targetMax / Math.max(crop.w, crop.h));
        const cw = Math.max(1, Math.round(crop.w * scale));
        const ch = Math.max(1, Math.round(crop.h * scale));
        const off = document.createElement('canvas');
        off.width = cw; off.height = ch;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        if (opts.enhance) {
            try { ctx.filter = 'contrast(1.18) saturate(1.08) brightness(1.02)'; } catch (_) {}
        }
        ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
        bitmap.close();
        const blobOut = await new Promise(res => off.toBlob(b => res(b), 'image/jpeg', opts.quality));
        return { blob: blobOut, width: cw, height: ch };
    }

    function renumberPdfRows() {
        document.querySelectorAll('#pdf-img-list .pdf-img-row').forEach((row, i) => {
            const n = row.querySelector('.pdf-img-num');
            if (n) n.textContent = i + 1;
        });
    }

    window.movePdfImage = (btn, dir) => {
        const row = btn.closest('.pdf-img-row');
        const list = document.getElementById('pdf-img-list');
        if (!row || !list) return;
        const rows = [...list.querySelectorAll('.pdf-img-row')];
        const index = rows.indexOf(row);
        const target = index + dir;
        if (target < 0 || target >= rows.length) return;
        list.insertBefore(row, dir < 0 ? rows[target] : rows[target].nextSibling);
        renumberPdfRows();
    };

    window.openPdfConverter = async (entityType, entityId) => {
        let items;
        try { items = await api.get(`/uploads?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`, { showLoader: false }); } catch { return; }
        const images = items.filter(isImageFile).slice().reverse();
        if (!images.length) { showToast('Nessuna foto negli allegati', 'warning'); return; }
        showModal('Converti foto in PDF', `
            <p class="text-muted">Le foto selezionate diventano un unico PDF: ogni foto è una pagina. Le foto leggermente inclinate (es. documento fotografato con il telefono) vengono raddrizzate in automatico. Puoi riordinarle con le frecce.</p>
            <div class="pdf-opt-bar">
                <label>Qualità <select id="pdf-quality" class="form-control"><option value="0.85" selected>Alta</option><option value="0.75">Buona</option><option value="0.60">Media</option></select></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" id="pdf-crop" checked><span>Ritaglia margini bianchi</span></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" id="pdf-rectify" checked><span>Raddrizza documento</span></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" id="pdf-enhance" checked><span>Migliora leggibilità</span></label>
                <label class="form-check"><input class="form-check-input" type="checkbox" id="pdf-delete-orig"><span>Elimina le foto dopo la conversione</span></label>
            </div>
            <div id="pdf-img-list" class="pdf-img-list">
                ${images.map((f, i) => `<div class="pdf-img-row" data-id="${f.id}">
                    <input type="checkbox" class="pdf-img-check" checked title="Includi nel PDF">
                    <img class="pdf-thumb" src="/api/uploads/${f.id}" alt="" loading="lazy">
                    <div class="pdf-img-main"><strong>${escapeHtml(f.original_name || f.filename)}</strong><small>${(f.size / 1024).toFixed(0)} KB${isImageFile(f) ? ' · foto' : ''}</small></div>
                    <div class="pdf-img-nav"><button type="button" class="icon-btn" onclick="movePdfImage(this,-1)" title="Su"><i class="fas fa-arrow-up"></i></button><button type="button" class="icon-btn" onclick="movePdfImage(this,1)" title="Giù"><i class="fas fa-arrow-down"></i></button></div>
                    <span class="pdf-img-num">${i + 1}</span>
                </div>`).join('')}
            </div>
            <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Annulla</button><button class="btn btn-primary" id="pdf-generate-btn" onclick="generatePdfFromImages('${entityType}',${entityId})"><i class="fas fa-file-pdf"></i> Genera PDF</button></div>`);
    };

    window.generatePdfFromImages = async (entityType, entityId) => {
        const rows = [...document.querySelectorAll('#pdf-img-list .pdf-img-row')];
        const selected = rows.filter(r => r.querySelector('.pdf-img-check')?.checked);
        if (!selected.length) { showToast('Seleziona almeno una foto', 'warning'); return; }
        const quality = Number(document.getElementById('pdf-quality')?.value || 0.85);
        const opts = { quality, crop: document.getElementById('pdf-crop')?.checked === true, rectify: document.getElementById('pdf-rectify')?.checked === true, enhance: document.getElementById('pdf-enhance')?.checked === true };
        const deleteOriginals = document.getElementById('pdf-delete-orig')?.checked === true;
        const generateBtn = document.getElementById('pdf-generate-btn');
        if (generateBtn) { generateBtn.disabled = true; generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generazione…'; }
        try {
            await ensurePdfLib();
            const pdf = await window.PDFLib.PDFDocument.create();
            const A4_W = 595.28, A4_H = 841.89, margin = 24;
            const ids = [];
            for (const row of selected) {
                const fileId = Number(row.dataset.id);
                ids.push(fileId);
                const blob = await (await fetch(`/api/uploads/${fileId}`)).blob();
                const { blob: jpeg, width, height } = await imageToJpeg(blob, opts);
                const img = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
                const portrait = height >= width;
                const page = pdf.addPage([portrait ? A4_W : A4_H, portrait ? A4_H : A4_W]);
                const pw = page.getWidth(), ph = page.getHeight();
                const scale = Math.min((pw - margin * 2) / width, (ph - margin * 2) / height);
                const w = width * scale, h = height * scale;
                page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
            }
            const pdfBytes = await pdf.save();
            const stamp = today().replace(/-/g, '');
            const fd = new FormData();
            fd.append('entity_type', entityType);
            fd.append('entity_id', entityId);
            fd.append('original_name', `documenti_${entityType}_${stamp}.pdf`);
            fd.append('file', new File([pdfBytes], `documenti_${entityType}_${stamp}.pdf`, { type: 'application/pdf' }));
            await api.upload('/uploads', fd);
            if (deleteOriginals) {
                for (const fid of ids) { await api.delete(`/uploads/${fid}`).catch(() => {}); }
            }
            closeModal();
            showToast(deleteOriginals ? 'PDF creato e foto originali rimosse' : 'PDF creato');
            await loadAttachments(entityType, entityId);
        } catch (_) {
            if (generateBtn) { generateBtn.disabled = false; generateBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Genera PDF'; }
            showToast('Errore nella generazione del PDF', 'error');
        }
    };

    // ---------- Dashboard ----------
    function daFareItem(iconClass, label, c, action) {
        const time = action === 'openCheckout' ? c.ora_partenza : c.ora_rientro_previsto;
        const residuo = Number(c.residuo || 0);
        return `<div class="event-row event-clickable" onclick="${action}(${c.id})">
            <i class="fas ${iconClass}"></i>
            <div><strong>${label} ${escapeHtml(c.targa)}</strong><small>${escapeHtml(c.nome || '')} ${escapeHtml(c.cognome || '')}${c.numero_contratto ? ' · ' + escapeHtml(c.numero_contratto) : ' · Prenotazione #' + c.id}${time ? ' · ' + escapeHtml(time) : ''}${residuo > 0.004 ? ' · <span class="text-danger">residuo ' + formatCurrency(residuo) + '</span>' : ''}</small></div>
            <i class="fas fa-chevron-right event-chevron"></i>
        </div>`;
    }

    function completatoItem(iconClass, label, c) {
        const time = c.stato === 'concluso' ? (c.ora_arrivo || '') : c.ora_partenza;
        return `<div class="event-row event-clickable" onclick="viewContract(${c.id})">
            <i class="fas ${iconClass} text-muted"></i>
            <div><strong>${label} ${escapeHtml(c.targa)}</strong><small>${escapeHtml(c.nome || '')} ${escapeHtml(c.cognome || '')}${c.numero_contratto ? ' · ' + escapeHtml(c.numero_contratto) : ''}${time ? ' · ' + escapeHtml(time) : ''}${Number(c.residuo || 0) > 0.004 ? ' · <span class="text-danger">residuo ' + formatCurrency(c.residuo) + '</span>' : ' · <span class="text-success">saldato</span>'}</small></div>
            <i class="fas fa-chevron-right event-chevron"></i>
        </div>`;
    }

    async function renderDashboard() {
        pageTitle().textContent = 'Dashboard';
        appContent().innerHTML = '<div class="skeleton-block"></div>';
        try {
            const data = await api.get('/dashboard');
            const reminders = data.upcoming_reminders || [];
            const partenzeDaFare = data.partenze_da_fare || [];
            const rientriDaFare = data.rientri_da_fare || [];
            const completati = [...(data.partenze_fatte || []), ...(data.rientri_fatti || [])];
            const daFare = partenzeDaFare.length + rientriDaFare.length;
            const partenzeScadute = data.partenze_scadute || [];
            const rientriScaduti = data.rientri_scaduti || [];
            const scaduti = partenzeScadute.length + rientriScaduti.length;
            appContent().innerHTML = `
                <div class="dashboard-grid">
                    <div class="stat-card"><div class="stat-icon primary"><i class="fas fa-car"></i></div><div class="stat-info"><div class="stat-value">${data.fleet?.total || 0}</div><div class="stat-label">Veicoli totali</div></div></div>
                    <div class="stat-card"><div class="stat-icon success"><i class="fas fa-circle-check"></i></div><div class="stat-info"><div class="stat-value">${data.fleet?.available || 0}</div><div class="stat-label">Disponibili</div></div></div>
                    <div class="stat-card"><div class="stat-icon warning"><i class="fas fa-key"></i></div><div class="stat-info"><div class="stat-value">${data.active_contracts || 0}</div><div class="stat-label">Noleggi in corso</div></div></div>
                    <div class="stat-card"><div class="stat-icon danger"><i class="fas fa-wrench"></i></div><div class="stat-info"><div class="stat-value">${data.fleet?.maintenance || 0}</div><div class="stat-label">In manutenzione</div></div></div>
                </div>
                <div class="quick-actions card mb-4">
                    <div class="card-header"><h3 class="card-title">Azioni rapide</h3></div>
                    <div class="card-body action-grid">
                        <button class="btn btn-primary" onclick="openVehicleForm()"><i class="fas fa-car-side"></i> Nuovo veicolo</button>
                        <button class="btn btn-primary" onclick="openCustomerForm()"><i class="fas fa-user-plus"></i> Nuovo cliente</button>
                        <button class="btn btn-success" onclick="openContractForm()"><i class="fas fa-file-circle-plus"></i> Nuovo noleggio</button>
                        <button class="btn btn-secondary" onclick="openReplacementForm()"><i class="fas fa-car-tunnel"></i> Auto sostitutiva</button>
                        <button class="btn btn-secondary" onclick="location.hash='#/maintenance'; setTimeout(()=>openMaintenanceForm(),50)"><i class="fas fa-screwdriver-wrench"></i> Manutenzione</button>
                    </div>
</div>
                ${scaduti > 0 ? `<div class="card scaduti-card">
                    <div class="card-header"><h3 class="card-title"><i class="fas fa-hourglass-end"></i> Scaduti <small class="text-muted">da recuperare (${scaduti})</small></h3></div>
                    <div class="card-body">
                        <div class="notice notice-danger"><i class="fas fa-triangle-exclamation"></i><div><strong>Impegni non completati oltre la data prevista</strong><span>Questi movimenti erano previsti per i giorni scorsi e non sono stati ancora gestiti.</span></div></div>
                        ${partenzeScadute.map(c => daFareItem('fa-arrow-right-from-bracket', 'Partenza scaduta', c, 'openCheckout')).join('')}
                        ${rientriScaduti.map(c => daFareItem('fa-arrow-right-to-bracket', 'Rientro scaduto', c, 'openCheckin')).join('')}
                    </div>
                </div>` : ''}
                <div class="two-column-grid">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Da fare <small class="text-muted">(${daFare} moviment${daFare === 1 ? 'o' : 'i'} · click per gestire)</small></h3></div>
                        <div class="card-body">
                            ${daFare === 0 ? '<p class="text-muted">Nessuna partenza o rientro previsto oggi.</p>' : ''}
                            ${partenzeDaFare.length ? `<h4 class="movimenti-heading"><i class="fas fa-arrow-right-from-bracket text-info"></i> Partenze da fare</h4>${partenzeDaFare.map(c => daFareItem('fa-arrow-right-from-bracket text-info', 'Partenza', c, 'openCheckout')).join('')}` : ''}
                            ${rientriDaFare.length ? `<h4 class="movimenti-heading"><i class="fas fa-arrow-right-to-bracket text-success"></i> Rientri da fare</h4>${rientriDaFare.map(c => daFareItem('fa-arrow-right-to-bracket text-success', 'Rientro', c, 'openCheckin')).join('')}` : ''}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Completati oggi</h3></div>
                        <div class="card-body">
                            ${completati.length === 0 ? '<p class="text-muted">Nessun movimento completato oggi.</p>' : completati.map(c => c.stato === 'concluso' ? completatoItem('fa-arrow-right-to-bracket', 'Rientro', c) : completatoItem('fa-arrow-right-from-bracket', 'Uscita', c)).join('')}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Prossime scadenze</h3></div>
                        <div class="card-body">
                            ${reminders.length ? reminders.map(r => `<div class="event-row"><i class="fas ${r.type === 'partenza' ? 'fa-arrow-right-from-bracket text-info' : r.type === 'rientro' ? 'fa-arrow-right-to-bracket text-success' : 'fa-bell text-warning'}"></i><div><strong>${escapeHtml(r.message)}</strong><small>${formatDate(r.date)}${r.type === 'partenza' ? ' · partenza' : r.type === 'rientro' ? ' · rientro' : ''}</small></div></div>`).join('') : '<p class="text-muted">Nessuna scadenza nei prossimi giorni.</p>'}
                        </div>
                    </div>
                </div>
                <div class="dashboard-grid mt-4">
                    <div class="stat-card"><div class="stat-icon success"><i class="fas fa-euro-sign"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(data.monthly_income)}</div><div class="stat-label">Entrate mese</div></div></div>
                    <div class="stat-card"><div class="stat-icon danger"><i class="fas fa-receipt"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(data.monthly_expenses)}</div><div class="stat-label">Spese mese</div></div></div>
                    <div class="stat-card"><div class="stat-icon primary"><i class="fas fa-chart-line"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(data.monthly_margin)}</div><div class="stat-label">Margine mese</div></div></div>
                </div>`;
        } catch (err) { handleRenderError(err, 'Dashboard'); }
    }

    // ---------- Vehicles ----------
    async function renderVehicles() {
        pageTitle().textContent = 'Veicoli';
        try {
            const vehicles = await api.get('/vehicles');
            const vehicleRow = v => `<tr><td><strong>${escapeHtml(v.targa)}</strong></td><td>${escapeHtml([v.marca, v.modello, v.versione].filter(Boolean).join(' '))}</td><td>${escapeHtml(v.anno || '—')}</td><td>${Number(v.km_attuali || 0).toLocaleString('it-IT')}</td><td>${statusBadge(v.stato)}</td><td><div class="action-buttons"><button class="icon-btn" title="Dettagli" onclick="viewVehicle(${v.id})"><i class="fas fa-eye"></i></button><button class="icon-btn" title="Modifica" onclick="openVehicleForm(${v.id})"><i class="fas fa-pen"></i></button><button class="icon-btn danger" title="Elimina" onclick="deleteVehicle(${v.id})"><i class="fas fa-trash"></i></button></div></td></tr>`;
            appContent().innerHTML = `
                <div class="page-toolbar">
                    <div><h2>Parco veicoli</h2><p>${vehicles.length} veicol${vehicles.length === 1 ? 'o' : 'i'} registrat${vehicles.length === 1 ? 'o' : 'i'}</p></div>
                    <button class="btn btn-primary" onclick="openVehicleForm()"><i class="fas fa-plus"></i> Nuovo veicolo</button>
                </div>
                <div class="card">
                    <div class="card-body no-padding">
                        ${vehicles.length ? `<div class="table-container"><table class="table" id="vehicles-table"><thead><tr><th>Targa</th><th>Veicolo</th><th>Anno</th><th>Km</th><th>Stato</th><th class="text-right">Azioni</th></tr></thead><tbody>
                            ${vehicles.map(vehicleRow).join('')}
                        </tbody></table></div>` : emptyState('fa-car', 'Nessun veicolo', 'Inserisci il primo veicolo del tuo parco auto.', `<button class="btn btn-primary" onclick="openVehicleForm()"><i class="fas fa-plus"></i> Inserisci veicolo</button>`)}
                    </div>
                </div>`;
            makeSortableTable({
                tableEl: document.getElementById('vehicles-table'),
                data: vehicles,
                rowHtml: vehicleRow,
                columnGetters: [v => v.targa, v => [v.marca, v.modello, v.versione].filter(Boolean).join(' '), v => v.anno, v => Number(v.km_attuali || 0), v => v.stato, null]
            });
        } catch (err) { handleRenderError(err, 'Veicoli'); }
    }

    window.openVehicleForm = async id => {
        let v = {};
        if (id) { try { v = await api.get(`/vehicles/${id}`); } catch { return; } }
        showModal(id ? 'Modifica veicolo' : 'Nuovo veicolo', `
            <form id="vehicle-form" class="form-grid">
                ${field('Targa *', 'targa', v.targa, 'text', 'required autocomplete="off"')}
                ${field('Marca', 'marca', v.marca)}
                ${field('Modello', 'modello', v.modello)}
                ${field('Versione', 'versione', v.versione)}
                ${selectField('Alimentazione', 'alimentazione', v.alimentazione, [['','— Seleziona —'],['Benzina','Benzina'],['Diesel','Diesel'],['GPL','GPL'],['Metano','Metano'],['Ibrida','Ibrida'],['Elettrica','Elettrica']])}
                ${field('Anno', 'anno', v.anno, 'number', 'min="1900" max="2100"')}
                ${field('Km attuali', 'km_attuali', v.km_attuali ?? 0, 'number', 'min="0"')}
                ${field('Colore', 'colore', v.colore)}
                ${field('Numero posti', 'nr_posti', v.nr_posti, 'number', 'min="1"')}
                ${field('Portata utile', 'portata_utile', v.portata_utile)}
                ${selectField('Stato', 'stato', v.stato || 'disponibile', [['disponibile','Disponibile'],['noleggiato','Noleggiato'],['manutenzione','Manutenzione'],['sostituzione','Sostituzione'],['fuori_servizio','Fuori servizio']])}
                ${textarea('Note', 'note', v.note)}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salva</button></div>
            </form>`);
        document.getElementById('vehicle-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                const data = formDataToObject(e.currentTarget);
                id ? await api.put(`/vehicles/${id}`, data) : await api.post('/vehicles', data);
                closeModal(); showToast(id ? 'Veicolo aggiornato' : 'Veicolo inserito'); await renderVehicles();
            } catch (_) {}
        });
    };

    window.deleteVehicle = id => showConfirm('Eliminare questo veicolo? L’operazione non può essere annullata.', async () => {
        try { await api.delete(`/vehicles/${id}`); showToast('Veicolo eliminato'); await renderVehicles(); } catch (_) {}
    });

    window.viewVehicle = async id => {
        try {
            const [v, contracts, finances, maintenance, deadlines] = await Promise.all([
                api.get(`/vehicles/${id}`), api.get(`/vehicles/${id}/contracts`), api.get(`/vehicles/${id}/finances`), api.get(`/vehicles/${id}/maintenance`), api.get(`/vehicles/${id}/scadenze`)
            ]);
            showModal(`${v.targa} · ${[v.marca, v.modello].filter(Boolean).join(' ')}`, `
                <div class="detail-grid">
                    <div><span>Stato</span>${statusBadge(v.stato)}</div><div><span>Km attuali</span><strong>${Number(v.km_attuali || 0).toLocaleString('it-IT')}</strong></div>
                    <div><span>Anno</span><strong>${escapeHtml(v.anno || '—')}</strong></div><div><span>Alimentazione</span><strong>${escapeHtml(v.alimentazione || '—')}</strong></div>
                    <div><span>Noleggi registrati</span><strong>${finances.contracts_count || 0}</strong></div><div><span>Margine</span><strong>${formatCurrency(finances.margin)}</strong></div>
                </div>
                <hr class="separator">
                <h4>Ultimi noleggi <small class="text-muted">(clicca per i dettagli)</small></h4>
                ${contracts.length ? contracts.slice(0,5).map(c => `<div class="event-row event-clickable" onclick="viewContract(${c.id})"><i class="fas fa-file-contract"></i><div><strong>${escapeHtml(c.numero_contratto || 'Contratto')}</strong><small>${escapeHtml(c.nome || '')} ${escapeHtml(c.cognome || '')} · ${formatDate(c.data_partenza)}</small></div><i class="fas fa-chevron-right event-chevron"></i></div>`).join('') : '<p class="text-muted">Nessun noleggio registrato.</p>'}
                <h4 class="mt-4">Manutenzione / scadenze</h4>
                ${maintenance.length || deadlines.length ? `${maintenance.slice(0,3).map(m => `<div class="event-row"><i class="fas fa-wrench"></i><div><strong>${escapeHtml(m.tipo || 'Manutenzione')}</strong><small>${formatDate(m.data)} · ${formatCurrency(m.costo)}</small></div></div>`).join('')}${deadlines.slice(0,3).map(d => `<div class="event-row"><i class="fas fa-calendar-exclamation"></i><div><strong>${escapeHtml(d.tipo || 'Scadenza')}</strong><small>${formatDate(d.data_scadenza)}</small></div></div>`).join('')}` : '<p class="text-muted">Nessun intervento o scadenza.</p>'}
                ${attachmentSection('vehicle', id)}
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button><button class="btn btn-primary" onclick="closeModal(); openVehicleForm(${id})"><i class="fas fa-pen"></i> Modifica</button></div>`);
            await loadAttachments('vehicle', id);
        } catch (_) {}
    };

    // ---------- Customers ----------
    async function renderCustomers() {
        pageTitle().textContent = 'Clienti';
        try {
            const customers = await api.get('/customers');
            const customerRow = c => {
                const saldoC = Number(c.saldo || 0);
                const situazione = saldoC > 0.004
                    ? `<span class="text-danger"><strong>${formatCurrency(saldoC)}</strong></span> <small class="text-muted">da riscuotere</small>`
                    : saldoC < -0.004
                        ? `<span class="text-success"><strong>${formatCurrency(Math.abs(saldoC))}</strong></span> <small class="text-muted">in credito</small>`
                        : '<span class="text-muted">a posto</span>';
                return `<tr><td><strong>${escapeHtml(c.cognome)} ${escapeHtml(c.nome)}</strong><br><small class="text-muted">${escapeHtml(c.codice_fiscale || '')}</small></td><td>${escapeHtml(c.telefono || '—')}</td><td>${escapeHtml(c.patente_numero || '—')}${c.patente_scadenza ? `<br><small class="text-muted">scad. ${formatDate(c.patente_scadenza)}</small>` : ''}</td><td>${situazione}</td><td><div class="action-buttons"><button class="icon-btn" onclick="viewCustomer(${c.id})" title="Dettagli"><i class="fas fa-eye"></i></button><button class="icon-btn" onclick="openCustomerForm(${c.id})" title="Modifica"><i class="fas fa-pen"></i></button><button class="icon-btn danger" onclick="deleteCustomer(${c.id})" title="Elimina"><i class="fas fa-trash"></i></button></div></td></tr>`;
            };
            appContent().innerHTML = `
                <div class="page-toolbar"><div><h2>Anagrafica clienti</h2><p>${customers.length} client${customers.length === 1 ? 'e' : 'i'} registrat${customers.length === 1 ? 'o' : 'i'}</p></div><button class="btn btn-primary" onclick="openCustomerForm()"><i class="fas fa-user-plus"></i> Nuovo cliente</button></div>
                <div class="card"><div class="card-body no-padding">
                    ${customers.length ? `<div class="customer-list-search"><i class="fas fa-magnifying-glass"></i><input id="customers-filter" class="form-control" type="search" autocomplete="off" placeholder="Cerca cliente"></div><div class="customer-search-count" id="customers-filter-count"></div><div class="table-container"><table class="table" id="customers-table"><thead><tr><th>Cliente</th><th>Telefono</th><th>Patente</th><th>Situazione contabile</th><th class="text-right">Azioni</th></tr></thead><tbody id="customers-table-body">${customers.map(customerRow).join('')}</tbody></table></div>` : emptyState('fa-users', 'Nessun cliente', 'Registra il primo cliente per poter creare un noleggio.', `<button class="btn btn-primary" onclick="openCustomerForm()"><i class="fas fa-user-plus"></i> Inserisci cliente</button>`)}
                </div></div>`;
            const tableBody = document.getElementById('customers-table-body');
            const controller = makeSortableTable({
                tableEl: document.getElementById('customers-table'),
                data: customers,
                rowHtml: customerRow,
                columnGetters: [c => `${c.cognome} ${c.nome}`, c => c.telefono, c => c.patente_numero, c => Number(c.saldo || 0), null],
                emptyHtml: () => '<tr><td colspan="5" class="text-muted p-4">Nessun cliente trovato.</td></tr>'
            });
            const filterInput = document.getElementById('customers-filter');
            const resultCount = document.getElementById('customers-filter-count');
            const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT');
            const filterCustomers = () => {
                const query = normalize(filterInput?.value).trim();
                const visible = !query ? customers : customers.filter(c => normalize([c.nome, c.cognome, c.note, c.codice_fiscale, c.telefono].join(' ')).includes(query));
                controller?.setFilter(() => visible);
                controller?.refresh();
                if (resultCount) resultCount.textContent = query ? `${visible.length} risultat${visible.length === 1 ? 'o' : 'i'}` : '';
                if (!controller && tableBody) tableBody.innerHTML = visible.length ? visible.map(customerRow).join('') : '<tr><td colspan="5" class="text-muted p-4">Nessun cliente trovato.</td></tr>';
            };
            filterInput?.addEventListener('input', filterCustomers);
        } catch (err) { handleRenderError(err, 'Clienti'); }
    }

    window.openCustomerForm = async id => {
        let c = {};
        if (id) { try { c = await api.get(`/customers/${id}`); } catch { return; } }
        showModal(id ? 'Modifica cliente' : 'Nuovo cliente', `
            <form id="customer-form" class="form-grid">
                ${field('Nome *','nome',c.nome,'text','required')}${field('Cognome *','cognome',c.cognome,'text','required')}
                ${field('Codice fiscale','codice_fiscale',c.codice_fiscale)}${field('Partita IVA','partita_iva',c.partita_iva)}
                ${field('Telefono','telefono',c.telefono,'tel')}
                ${field('Indirizzo','indirizzo',c.indirizzo)}${field('Luogo di nascita','luogo_nascita',c.luogo_nascita)}
                ${field('Data di nascita','data_nascita',c.data_nascita,'date')}
                ${field('Categoria patente','patente_categoria',c.patente_categoria || 'B')}${field('N. patente','patente_numero',c.patente_numero)}
                ${field('Patente rilasciata da','patente_rilasciata_da',c.patente_rilasciata_da)}${field('Patente rilasciata il','patente_rilasciata_il',c.patente_rilasciata_il,'date')}
                ${field('Scadenza patente','patente_scadenza',c.patente_scadenza,'date')}
                ${textarea('Note','note',c.note)}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salva</button></div>
            </form>`);
        document.getElementById('customer-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                const data = formDataToObject(e.currentTarget);
                id ? await api.put(`/customers/${id}`, data) : await api.post('/customers', data);
                closeModal(); showToast(id ? 'Cliente aggiornato' : 'Cliente inserito'); await renderCustomers();
            } catch (_) {}
        });
    };

    window.deleteCustomer = id => showConfirm('Eliminare questo cliente?', async () => {
        try { await api.delete(`/customers/${id}`); showToast('Cliente eliminato'); await renderCustomers(); } catch (_) {}
    });

    function rentalDetailHtml(r) {
        return `<div class="detail-grid">
            <div><span>Stato</span>${statusBadge(r.stato)}</div>
            <div><span>Veicolo</span><strong>${escapeHtml(r.targa || '—')}${r.marca ? ` · ${escapeHtml(r.marca)} ${escapeHtml(r.modello || '')}` : ''}</strong></div>
            <div><span>Partenza</span><strong>${formatDate(r.data_partenza)} ${escapeHtml(r.ora_partenza || '')}</strong></div>
            <div><span>Rientro previsto</span><strong>${formatDate(r.data_rientro_previsto)} ${escapeHtml(r.ora_rientro_previsto || '')}</strong></div>
            ${r.data_arrivo ? `<div><span>Arrivo effettivo</span><strong>${formatDate(r.data_arrivo)} ${escapeHtml(r.ora_arrivo || '')}</strong></div>` : ''}
            <div><span>Tariffa</span><strong>${formatCurrency(r.importo_giorno)} / giorno</strong></div>
            <div><span>Totale</span><strong>${formatCurrency(r.totale)}</strong></div>
            <div><span>Deposito cauzionale</span><strong>${formatCurrency(r.deposito_cauzionale)}</strong></div>
            ${r.km_partenza != null ? `<div><span>Km partenza</span><strong>${escapeHtml(r.km_partenza)}</strong></div>` : ''}
            ${r.km_arrivo != null ? `<div><span>Km arrivo</span><strong>${escapeHtml(r.km_arrivo)}</strong></div>` : ''}
            ${r.carburante_partenza ? `<div><span>Carburante partenza</span><strong>${escapeHtml(r.carburante_partenza)}</strong></div>` : ''}
            ${r.carburante_arrivo ? `<div><span>Carburante arrivo</span><strong>${escapeHtml(r.carburante_arrivo)}</strong></div>` : ''}
            ${r.secondo_conducente_nome ? `<div><span>Secondo conducente</span><strong>${escapeHtml(r.secondo_conducente_nome)}</strong></div>` : ''}
        </div>${r.note ? `<p class="text-muted p-2" style="margin-top:10px">${escapeHtml(r.note)}</p>` : ''}`;
    }

    window.toggleRentalDetail = id => {
        const detail = document.getElementById(`rental-detail-${id}`);
        if (!detail) return;
        const isOpen = detail.style.display === 'block';
        detail.style.display = isOpen ? 'none' : 'block';
        document.getElementById(`chevron-${id}`)?.classList.toggle('open', !isOpen);
    };

    function customerDebtHtml(contracts) {
        const totale = contracts.reduce((s, r) => s + Number(r.totale || 0), 0);
        const incassato = contracts.reduce((s, r) => s + Number(r.incassato || 0), 0);
        const residuo = Math.max(0, totale - incassato);
        const aperte = contracts.filter(r => Number(r.residuo || 0) > 0.004);
        return `<div class="debt-grid">
            <div><span>Totale contratti</span><strong>${formatCurrency(totale)}</strong></div>
            <div><span>Pagato</span><strong>${formatCurrency(incassato)}</strong></div>
            <div><span>Residuo</span><strong class="${residuo > 0.004 ? 'text-danger' : 'text-success'}">${formatCurrency(residuo)}</strong></div>
        </div>
        ${aperte.length ? `<p class="text-warning p-2" style="font-size:.85rem;margin-top:6px"><i class="fas fa-triangle-exclamation"></i> ${aperte.length} nolegg${aperte.length === 1 ? 'io' : 'i'} con saldo da riscuotere.</p>` : totale > 0 ? '<p class="text-muted p-2" style="font-size:.85rem;margin-top:6px">Nessun saldo in sospeso.</p>' : ''}`;
    }

    function scadenzaRowHtml(s) {
        const done = Number(s.completata) === 1;
        const overdue = !done && String(s.data_scadenza).slice(0, 10) < today();
        return `<div class="scadenza-row ${done ? 'scadenza-done' : ''}">
            <button class="icon-btn ${done ? 'success' : ''}" onclick="toggleCustomerScadenza(${s.customer_id},${s.id},${done ? 0 : 1})" title="${done ? 'Riapri scadenza' : 'Segna come completata'}"><i class="fas ${done ? 'fa-circle-check' : 'fa-regular fa-circle'}"></i></button>
            <div class="scadenza-main"><strong>${escapeHtml(String(s.tipo || 'altro').charAt(0).toUpperCase() + String(s.tipo || 'altro').slice(1))}${s.descrizione ? ' · ' + escapeHtml(s.descrizione) : ''}</strong><small>${formatDate(s.data_scadenza)}${overdue ? ' · <span class="text-danger">scaduta</span>' : ''}${s.importo != null ? ' · ' + formatCurrency(s.importo) : ''}${s.note ? ' · ' + escapeHtml(s.note) : ''}</small></div>
            <button class="icon-btn danger" onclick="deleteCustomerScadenza(${s.customer_id},${s.id})" title="Elimina scadenza"><i class="fas fa-trash"></i></button>
        </div>`;
    }

    const loadCustomerScadenze = async (customerId, containerId = 'customer-scadenze') => {
        const container = document.getElementById(containerId);
        if (!container) return;
        try {
            const scadenze = await api.get(`/customers/${customerId}/scadenze`, { showLoader: false });
            container.innerHTML = scadenze.length
                ? scadenze.map(scadenzaRowHtml).join('')
                : '<p class="text-muted">Nessuna scadenza fiscale registrata.</p>';
        } catch (_) { container.innerHTML = '<p class="text-danger">Impossibile caricare le scadenze.</p>'; }
    };

    window.toggleFiscalForm = () => {
        const form = document.getElementById('fiscal-form');
        if (form) form.style.display = form.style.display === 'none' ? 'grid' : 'none';
    };

    window.addCustomerScadenza = async customerId => {
        const form = document.getElementById('fiscal-form');
        if (!form) return;
        const data = formDataToObject(form);
        if (!data.data_scadenza) { showToast('Inserisci la data di scadenza', 'warning'); return; }
        try {
            await api.post(`/customers/${customerId}/scadenze`, data);
            form.reset();
            form.style.display = 'none';
            showToast('Scadenza aggiunta');
            await loadCustomerScadenze(customerId);
        } catch (_) {}
    };

    window.toggleCustomerScadenza = async (customerId, sid, completata) => {
        try {
            await api.put(`/customers/${customerId}/scadenze/${sid}`, { completata });
            await loadCustomerScadenze(customerId);
        } catch (_) {}
    };

    window.deleteCustomerScadenza = async (customerId, sid) => {
        if (!window.confirm('Eliminare questa scadenza fiscale?')) return;
        try {
            await api.delete(`/customers/${customerId}/scadenze/${sid}`);
            showToast('Scadenza eliminata');
            await loadCustomerScadenze(customerId);
        } catch (_) {}
    };

    window.viewCustomer = async id => {
        try {
            const [c, contracts, finances] = await Promise.all([api.get(`/customers/${id}`), api.get(`/customers/${id}/contracts`), api.get(`/customers/${id}/finances`)]);
            showModal(`${c.cognome} ${c.nome}`, `
                <div class="detail-grid"><div><span>Telefono</span><strong>${escapeHtml(c.telefono || '—')}</strong></div><div><span>Email</span><strong>${escapeHtml(c.email || '—')}</strong></div><div><span>Codice fiscale</span><strong>${escapeHtml(c.codice_fiscale || '—')}</strong></div><div><span>Patente</span><strong>${escapeHtml(c.patente_numero || '—')}</strong></div><div><span>Noleggi</span><strong>${finances.contracts_count || 0}</strong></div><div><span>Totale contratti</span><strong>${formatCurrency(finances.total_spent)}</strong></div></div>
                <hr class="separator"><h4>Situazione debitoria</h4>${customerDebtHtml(contracts)}
                <hr class="separator"><h4>Storico noleggi <small class="text-muted">(clicca su un noleggio per i dettagli)</small></h4>
                ${contracts.length ? contracts.slice(0,8).map(r => `<div class="event-row event-clickable" onclick="toggleRentalDetail(${r.id})"><i class="fas fa-car"></i><div><strong>${escapeHtml(r.numero_contratto || 'Contratto')} · ${escapeHtml(r.targa || '')}</strong><small>${formatDate(r.data_partenza)} → ${formatDate(r.data_rientro_previsto)} · ${formatCurrency(r.totale)}${Number(r.residuo || 0) > 0.004 ? ' · <span class="text-danger">residuo ' + formatCurrency(r.residuo) + '</span>' : ''}</small></div><i class="fas fa-chevron-down event-chevron" id="chevron-${r.id}"></i></div><div class="rental-detail" id="rental-detail-${r.id}" style="display:none">${rentalDetailHtml(r)}</div>`).join('') : '<p class="text-muted">Nessun noleggio registrato.</p>'}
                <hr class="separator"><div class="fiscal-header"><h4 style="margin:0">Scadenzario fiscale</h4><button class="btn btn-secondary btn-sm" onclick="toggleFiscalForm()"><i class="fas fa-plus"></i> Aggiungi</button></div>
                <form id="fiscal-form" class="form-grid" style="display:none">
                    ${selectField('Tipo','tipo','altro',[['fattura','Fattura'],['ricevuta','Ricevuta'],['dichiarazione','Dichiarazione'],['diritto_annuale','Diritto annuale'],['pec','PEC'],['altro','Altro']])}
                    ${field('Descrizione','descrizione','')}
                    ${field('Data scadenza *','data_scadenza','','date','required')}
                    ${field('Importo (€)','importo','','number','min="0" step="0.01"')}
                    ${textarea('Note','note','')}
                    <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="toggleFiscalForm()">Annulla</button><button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Aggiungi</button></div>
                </form>
                <div id="customer-scadenze" class="scadenze-list"><span class="text-muted">Caricamento…</span></div>
                ${attachmentSection('customer', id)}
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button><button class="btn btn-primary" onclick="closeModal(); openCustomerForm(${id})"><i class="fas fa-pen"></i> Modifica</button></div>`);
            await loadAttachments('customer', id);
            await loadCustomerScadenze(id);
            document.getElementById('fiscal-form')?.addEventListener('submit', async e => { e.preventDefault(); await addCustomerScadenza(id); });
        } catch (_) {}
    };

    // ---------- Contracts / rentals ----------
    async function renderRentals() {
        pageTitle().textContent = 'Noleggi';
        try {
            const [contracts, vehicles] = await Promise.all([api.get('/contracts'), api.get('/vehicles')]);
            const prenotazioni = contracts.filter(c => c.stato === 'prenotazione');
            const inCorso = contracts.filter(c => c.stato === 'in_corso');
            const conclusi = contracts.filter(c => c.stato === 'concluso');
            // Vetture attualmente in giro SENZA un noleggio attivo (es. in manutenzione,
            // in riparazione o sostitutiva senza contratto): compaiono nella lista
            // "In corso" perché risultano comunque fuori dalla disponibilità.
            const veicoliInGiro = vehicles
                .filter(v => !['disponibile'].includes(v.stato) && !inCorso.some(c => String(c.vehicle_id) === String(v.id)))
                .map(veicolo => ({ veicolo }));

            const rentalRow = c => {
                if (c.veicolo) {
                    const v = c.veicolo;
                    return `<tr class="veicolo-fuori-row"><td><span class="text-muted">—</span></td><td><span class="text-muted">—</span></td><td><strong>${escapeHtml(v.targa)}</strong><br><small class="text-muted">${escapeHtml([v.marca, v.modello].filter(Boolean).join(' '))}${v.anno ? ' · ' + escapeHtml(v.anno) : ''}</small></td><td><span class="text-muted">—</span></td><td><span class="text-muted">—</span></td><td>${statusBadge(v.stato)}</td><td><div class="action-buttons"><button class="icon-btn" title="Dettagli veicolo" onclick="viewVehicle(${v.id})"><i class="fas fa-eye"></i></button></div></td></tr>`;
                }
                return `<tr><td><strong>${c.tipo_impegno === 'sostitutiva' ? 'Auto sostitutiva' : escapeHtml(c.numero_contratto || `Prenotazione #${c.id}`)}</strong></td><td>${escapeHtml(c.cognome || '')} ${escapeHtml(c.nome || '')}</td><td><strong>${escapeHtml(c.targa || '—')}</strong><br><small class="text-muted">${escapeHtml([c.marca,c.modello].filter(Boolean).join(' '))}</small></td><td>${formatDate(c.data_partenza)} <strong>${escapeHtml(c.ora_partenza || '00:00')}</strong><br><small class="text-muted">al ${formatDate(c.data_rientro_previsto)} ${escapeHtml(c.ora_rientro_previsto || '23:59')}</small></td><td>${c.tipo_impegno === 'sostitutiva' ? '<span class="text-muted">—</span>' : formatCurrency(c.totale)}</td><td>${statusBadge(c.stato)}</td><td><div class="action-buttons"><button class="icon-btn" title="Dettagli" onclick="viewContract(${c.id})"><i class="fas fa-eye"></i></button>${c.tipo_impegno !== 'sostitutiva' ? `<button class="icon-btn" title="Modifica" onclick="openContractForm(${c.id})"><i class="fas fa-pen"></i></button>` : ''}${c.stato === 'in_corso' ? `<button class="icon-btn success" title="Check-in" onclick="openCheckin(${c.id})"><i class="fas fa-flag-checkered"></i></button>` : ''}${c.tipo_impegno !== 'sostitutiva' && c.stato === 'in_corso' ? `<button class="icon-btn" title="Prolunga" onclick="openProlungaModal(${c.id})"><i class="fas fa-clock-rotate-left"></i></button>` : ''}<button class="icon-btn danger" title="Elimina" onclick="deleteContract(${c.id})"><i class="fas fa-trash"></i></button></div></td></tr>`;
            };

            const tabRows = {
                prenotazioni,
                in_corso: [...inCorso, ...veicoliInGiro],
                conclusi
            };
            const tabCount = tab => (tabRows[tab] || []).length;
            let activeTab = 'in_corso';

            appContent().innerHTML = `
                <div class="page-toolbar"><div><h2>Prenotazioni e noleggi</h2><p>${prenotazioni.length} prenotazione${prenotazioni.length === 1 ? '' : 'i'} · ${inCorso.length} in corso · ${conclusi.length} conclus${conclusi.length === 1 ? 'o' : 'i'}</p></div><div class="toolbar-actions"><a class="btn btn-secondary" href="#/calendar"><i class="fas fa-calendar-days"></i> Calendario</a><button class="btn btn-secondary" onclick="openReplacementForm()" title="Assegna una vettura come auto sostitutiva senza contratto commerciale"><i class="fas fa-car-tunnel"></i> Auto sostitutiva</button><button class="btn btn-success" onclick="openContractForm()"><i class="fas fa-plus"></i> Nuova prenotazione</button></div></div>
                <div class="tab-list" role="tablist">
                    <button type="button" class="tab-item" data-tab="prenotazioni" role="tab">Prenotazioni <span class="tab-item-count">${tabCount('prenotazioni')}</span></button>
                    <button type="button" class="tab-item active" data-tab="in_corso" role="tab">In corso <span class="tab-item-count">${tabCount('in_corso')}</span></button>
                    <button type="button" class="tab-item" data-tab="conclusi" role="tab">Conclusi <span class="tab-item-count">${tabCount('conclusi')}</span></button>
                </div>
                <div class="card"><div class="card-body no-padding">
                    <div class="customer-list-search"><i class="fas fa-magnifying-glass"></i><input id="rentals-filter" class="form-control" type="search" autocomplete="off" placeholder="Cerca noleggio"></div><div class="customer-search-count" id="rentals-filter-count"></div>
                    <div class="table-container"><table class="table" id="rentals-table"><thead><tr><th>Contratto</th><th>Cliente</th><th>Veicolo</th><th>Periodo</th><th>Totale</th><th>Stato</th><th class="text-right">Azioni</th></tr></thead><tbody id="rentals-table-body"></tbody></table></div>
                </div></div>`;

            const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT');
            const filterInput = document.getElementById('rentals-filter');
            const resultCount = document.getElementById('rentals-filter-count');
            const colGetter = (contractFn, vehicleFn) => c => c.veicolo ? (vehicleFn ? vehicleFn(c.veicolo) : '') : contractFn(c);
            const emptyHtml = list => list.length === 0
                ? `<tr><td colspan="7" class="text-muted p-4">${activeTab === 'prenotazioni' ? 'Nessuna prenotazione.' : activeTab === 'in_corso' ? 'Nessun noleggio in corso.' : 'Nessun noleggio concluso.'}</td></tr>`
                : '';
            const controller = makeSortableTable({
                tableEl: document.getElementById('rentals-table'),
                data: tabRows[activeTab],
                rowHtml: rentalRow,
                columnGetters: [
                    colGetter(c => c.numero_contratto || `Prenotazione #${c.id}`, () => ''),
                    colGetter(c => `${c.cognome} ${c.nome}`, () => ''),
                    colGetter(c => `${c.targa} ${c.marca} ${c.modello}`, v => `${v.targa} ${v.marca} ${v.modello}`),
                    colGetter(c => `${c.data_partenza} ${c.ora_partenza || '00:00'}`, () => ''),
                    colGetter(c => Number(c.totale || 0), () => 0),
                    colGetter(c => c.stato, v => v.stato),
                    null
                ],
                emptyHtml
            });
            const filterRentals = () => {
                const query = normalize(filterInput?.value).trim();
                const base = tabRows[activeTab] || [];
                const visible = !query
                    ? base
                    : base.filter(c => {
                        const v = c.veicolo || c;
                        return normalize([v.numero_contratto, v.id, v.nome, v.cognome, v.targa, v.marca, v.modello, v.data_partenza, v.data_rientro_previsto, v.ora_partenza, v.ora_rientro_previsto, v.totale].join(' ')).includes(query);
                    });
                controller?.setFilter(() => visible);
                controller?.refresh();
                if (resultCount) resultCount.textContent = query ? `${visible.length} risultat${visible.length === 1 ? 'o' : 'i'}` : '';
            };
            filterInput?.addEventListener('input', filterRentals);
            document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
                activeTab = btn.dataset.tab;
                document.querySelectorAll('.tab-item').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
                filterInput.value = '';
                filterRentals();
            }));
            filterRentals();
        } catch (err) { handleRenderError(err, 'Noleggi'); }
    }

    window.openContractForm = async (id, preset = {}) => {
        try {
            const [customers, vehicles, settings, existing] = await Promise.all([
                api.get('/customers'), api.get('/vehicles'), api.get('/settings'), id ? api.get(`/contracts/${id}`) : Promise.resolve({})
            ]);
            if (!id && customers.length === 0) { showToast('Inserisci prima almeno un cliente', 'warning'); location.hash = '#/customers'; return; }
            if (!id && vehicles.length === 0) { showToast('Inserisci prima almeno un veicolo', 'warning'); location.hash = '#/vehicles'; return; }
            const c = id ? (existing || {}) : (preset || {});
            const vehicleOptions = [['','— Seleziona veicolo —'], ...vehicles.map(x => [x.id, `${x.targa} · ${[x.marca,x.modello].filter(Boolean).join(' ')}${x.stato !== 'disponibile' && String(x.id) !== String(c.vehicle_id) ? ' [' + x.stato + ']' : ''}`])];
            const kaskoDefault = c.kasko_prezzo ?? settings.kasko_prezzo ?? 20;
            const customerLabel = customer => `${customer.cognome} ${customer.nome}${customer.telefono ? ' · ' + customer.telefono : ''}`;
            const selectedCustomer = customers.find(x => String(x.id) === String(c.customer_id));
            showModal(id ? 'Modifica prenotazione / noleggio' : 'Nuova prenotazione', `
                <form id="contract-form" class="form-grid">
                    <div class="form-group customer-search-group">
                        <label class="form-label" for="customer_search">Cliente *</label>
                        <input class="form-control" id="customer_search" name="customer_search" type="search" autocomplete="off" placeholder="Cerca per nome, cognome o telefono" value="${attr(selectedCustomer ? customerLabel(selectedCustomer) : '')}" required>
                        <input id="customer_id" name="customer_id" type="hidden" value="${attr(c.customer_id || '')}">
                        <div id="customer-search-results" class="customer-search-results" role="listbox"></div>
                        <div id="customer-unknown" class="unknown-customer-box" style="display:none">
                            <p class="unknown-customer-message" id="customer-unknown-message"></p>
                            <div class="modal-actions" id="customer-unknown-actions">
                                <button type="button" class="btn btn-primary btn-sm" onclick="confirmUnknownCustomer()"><i class="fas fa-user-plus"></i> Sì, registra</button>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="cancelUnknownCustomer()">No</button>
                            </div>
                            <div id="customer-unknown-form" class="unknown-customer-form" style="display:none">
                                <div class="form-grid">
                                    ${field('Nome *','unk_nome','','text','required')}
                                    ${field('Cognome *','unk_cognome','','text','required')}
                                    ${field('Telefono','unk_telefono','','tel')}
                                    ${field('N. patente','unk_patente_numero','')}
                                </div>
                                <div class="form-span-2 modal-actions">
                                    <button type="button" class="btn btn-secondary btn-sm" onclick="cancelUnknownCustomer()">Annulla</button>
                                    <button type="button" class="btn btn-primary btn-sm" onclick="saveUnknownCustomer()"><i class="fas fa-save"></i> Salva e usa</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${selectField('Veicolo *','vehicle_id',c.vehicle_id,vehicleOptions,'required')}
                    ${field('Data partenza *','data_partenza',c.data_partenza || today(),'date','required')}
                    ${field('Ora partenza *','ora_partenza',c.ora_partenza || '09:00','time','required')}
                    ${field('Rientro previsto *','data_rientro_previsto',c.data_rientro_previsto || today(),'date','required')}
                    ${field('Ora rientro *','ora_rientro_previsto',c.ora_rientro_previsto || '18:00','time','required')}
                    ${field('Scadenza pagamento','data_scadenza_pagamento',c.data_scadenza_pagamento || c.data_partenza || today(),'date')}
                    ${field('Giorni tariffa','giorni_tariffa',c.giorni_tariffa ?? 1,'number','min="1" required')}
                    ${field('Prezzo al giorno IVA compresa (€)','importo_giorno',c.importo_giorno ?? 0,'number','min="0" step="0.01" required')}
                    ${field('Km partenza','km_partenza',c.km_partenza ?? '','number','min="0" placeholder="Es. 45230"')}
                    ${field('Carburante partenza','carburante_partenza',c.carburante_partenza || '','text','placeholder="Es. pieno, 3/4, 42 litri"')}
                    ${selectField('Stato','stato',c.stato || 'prenotazione',[['prenotazione','Prenotazione'],['in_corso','In corso'],['concluso','Concluso'],['annullato','Annullato']])}
                    ${field('Cauzione / deposito (€) · facoltativa','deposito_cauzionale',c.deposito_cauzionale ?? 0,'number','min="0" step="0.01"')}
                    <div class="form-group form-span-2"><label class="form-check"><input class="form-check-input" type="checkbox" id="kasko_inclusa" name="kasko_inclusa" value="1" ${Number(c.kasko_inclusa) === 1 ? 'checked' : ''}><span>Kasko inclusa</span></label></div>
                    ${field('Prezzo Kasko IVA compresa (€)','kasko_prezzo',kaskoDefault,'number','min="0" step="0.01"')}
                    ${field('Km inclusi','km_inclusi',c.km_inclusi,'number','min="0"')}
                    ${field('Extra km (€)','extra_km',c.extra_km ?? settings.extra_km_default ?? 0.20,'number','min="0" step="0.01"')}
                    ${field('Filiale partenza','filiale_partenza',c.filiale_partenza || settings.company_sede || '')}
                    ${field('Filiale rientro','filiale_rientro',c.filiale_rientro || settings.company_sede || '')}
                    <div class="form-span-2 form-section-title"><strong>Secondo conducente (facoltativo)</strong></div>
                    ${field('Nome e cognome 2° conducente','secondo_conducente_nome',c.secondo_conducente_nome)}
                    ${field('Categoria patente 2° conducente','secondo_conducente_doc_categoria',c.secondo_conducente_doc_categoria || '')}
                    ${field('N. patente 2° conducente','secondo_conducente_doc_numero',c.secondo_conducente_doc_numero)}
                    ${field('Patente 2° conducente rilasciata da','secondo_conducente_doc_rilasciato_da',c.secondo_conducente_doc_rilasciato_da)}
                    ${field('Patente 2° conducente rilasciata il','secondo_conducente_doc_rilasciato_il',c.secondo_conducente_doc_rilasciato_il,'date')}
                    ${field('Scadenza patente 2° conducente','secondo_conducente_doc_scadenza',c.secondo_conducente_doc_scadenza,'date')}
                    ${textarea('Note','note',c.note)}
                    <div class="form-span-2 form-hint">Tariffa e Kasko sono importi IVA compresa. Il gestionale scorpora automaticamente imponibile e IVA. Con Kasko attiva le franchigie cliente passano ai valori Kasko configurati.</div>
                    <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Salva</button></div>
                </form>`);
            const startDateEl = document.getElementById('data_partenza');
            const endDateEl = document.getElementById('data_rientro_previsto');
            const daysEl = document.getElementById('giorni_tariffa');
            const syncRentalDays = () => {
                if (!startDateEl?.value || !endDateEl?.value || !daysEl) return;
                const start = new Date(`${startDateEl.value}T00:00:00`);
                const end = new Date(`${endDateEl.value}T00:00:00`);
                const diff = Math.ceil((end - start) / 86400000);
                if (Number.isFinite(diff) && diff >= 0) daysEl.value = Math.max(1, diff);
            };
            startDateEl?.addEventListener('change', syncRentalDays);
            endDateEl?.addEventListener('change', syncRentalDays);
            const customerSearchEl = document.getElementById('customer_search');
            const customerIdEl = document.getElementById('customer_id');
            const customerResultsEl = document.getElementById('customer-search-results');
            const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').trim();
            const showCustomerSuggestions = query => {
                const needle = normalizeSearch(query);
                if (!needle) { customerResultsEl.innerHTML = ''; return; }
                const matches = customers.filter(customer => normalizeSearch(`${customer.nome} ${customer.cognome} ${customer.telefono || ''}`).includes(needle)).slice(0, 8);
                customerResultsEl.innerHTML = matches.length
                    ? matches.map(customer => `<button type="button" class="customer-suggestion" data-customer-id="${customer.id}">${escapeHtml(customerLabel(customer))}</button>`).join('')
                    : `<div class="customer-search-empty">Nessun cliente trovato</div><button type="button" class="customer-register-btn" onmousedown="event.preventDefault(); showUnknownCustomerBox()"><i class="fas fa-user-plus"></i> Registra nuovo cliente…</button>`;
                customerResultsEl.querySelectorAll('.customer-suggestion').forEach(button => button.addEventListener('click', () => {
                    const customer = customers.find(x => String(x.id) === button.dataset.customerId);
                    if (!customer) return;
                    customerSearchEl.value = customerLabel(customer);
                    customerIdEl.value = customer.id;
                    customerResultsEl.innerHTML = '';
                }));
            };
            customerSearchEl?.addEventListener('input', () => {
                customerIdEl.value = '';
                showCustomerSuggestions(customerSearchEl.value);
            });
            customerSearchEl?.addEventListener('focus', () => showCustomerSuggestions(customerSearchEl.value));
            customerSearchEl?.addEventListener('blur', () => setTimeout(() => { customerResultsEl.innerHTML = ''; }, 150));

            // ---------- Cliente sconosciuto: proposta di registrazione senza perdere i progressi ----------
            const unkBox = document.getElementById('customer-unknown');
            const unkMessage = document.getElementById('customer-unknown-message');
            const unkActions = document.getElementById('customer-unknown-actions');
            const unkForm = document.getElementById('customer-unknown-form');
            const openUnknownCustomerBox = typed => {
                const name = String(typed || '').trim();
                if (!name || !unkBox || !unkMessage) return;
                if (customers.some(customer => normalizeSearch(customerLabel(customer)) === normalizeSearch(name))) {
                    showToast('Il cliente risulta registrato: selezionalo dai suggerimenti', 'warning');
                    return;
                }
                unkMessage.innerHTML = `«${escapeHtml(name)}» non risulta registrato. Registrare un nuovo cliente?`;
                if (unkActions) unkActions.style.display = 'flex';
                if (unkForm) unkForm.style.display = 'none';
                unkBox.style.display = 'block';
            };
            window.showUnknownCustomerBox = () => openUnknownCustomerBox(customerSearchEl?.value);
            window.confirmUnknownCustomer = () => {
                if (!unkActions || !unkForm) return;
                unkActions.style.display = 'none';
                unkForm.style.display = 'block';
                setTimeout(() => unkForm.querySelector('input')?.focus(), 100);
            };
            window.cancelUnknownCustomer = () => {
                if (!unkBox) return;
                unkBox.style.display = 'none';
                if (unkForm) unkForm.style.display = 'none';
                if (unkActions) unkActions.style.display = 'flex';
            };
            window.saveUnknownCustomer = async () => {
                const nome = document.getElementById('unk_nome')?.value.trim();
                const cognome = document.getElementById('unk_cognome')?.value.trim();
                if (!nome || !cognome) { showToast('Nome e cognome sono obbligatori', 'warning'); return; }
                try {
                    const telefono = document.getElementById('unk_telefono')?.value.trim() || null;
                    const patente_numero = document.getElementById('unk_patente_numero')?.value.trim() || null;
                    const res = await api.post('/customers', { nome, cognome, telefono, patente_numero, patente_categoria: 'B' });
                    const nuovo = { id: res.id, nome, cognome, telefono, patente_numero, saldo: 0, ha_debito: 0 };
                    customers.push(nuovo);
                    customerSearchEl.value = customerLabel(nuovo);
                    customerIdEl.value = String(nuovo.id);
                    customerResultsEl.innerHTML = '';
                    if (unkBox) unkBox.style.display = 'none';
                    showToast('Cliente registrato');
                } catch (_) {}
            };
            document.getElementById('vehicle_id')?.addEventListener('change', e => {
                if (id) return;
                const vehicle = vehicles.find(v => String(v.id) === e.target.value);
                const kmEl = document.getElementById('km_partenza');
                if (vehicle && kmEl && !kmEl.value) kmEl.value = vehicle.km_attuali ?? '';
            });

            document.getElementById('contract-form')?.addEventListener('submit', async e => {
                e.preventDefault();
                try {
                    const data = formDataToObject(e.currentTarget);
                    delete data.customer_search;
                    for (const [k, v] of Object.entries(preset || {})) {
                        if (v !== undefined && v !== null && (data[k] === undefined || data[k] === '' || data[k] === null)) data[k] = v;
                    }
                    if (!data.customer_id) {
                        const exact = customers.find(customer => normalizeSearch(customerLabel(customer)) === normalizeSearch(customerSearchEl?.value));
                        if (exact) data.customer_id = exact.id;
                        else {
                            openUnknownCustomerBox(customerSearchEl?.value);
                            return;
                        }
                    }
                    data.kasko_inclusa = document.getElementById('kasko_inclusa')?.checked ? 1 : 0;
                    id ? await api.put(`/contracts/${id}`, data) : await api.post('/contracts', data);
                    closeModal(); showToast(id ? 'Prenotazione / noleggio aggiornato' : 'Prenotazione creata e vettura bloccata'); await renderRentals();
                } catch (_) {}
            });
        } catch (_) {}
    };

    // ---------- Auto sostitutiva ----------
    window.openReplacementForm = async () => {
        try {
            const [customers, vehicles] = await Promise.all([api.get('/customers'), api.get('/vehicles')]);
            if (customers.length === 0) { showToast('Inserisci prima almeno un cliente', 'warning'); location.hash = '#/customers'; return; }
            const freeVehicles = vehicles.filter(v => v.stato === 'disponibile');
            if (freeVehicles.length === 0) { showToast('Nessuna vettura disponibile per la sostituzione', 'warning'); return; }
            const customerLabelR = customer => `${customer.cognome} ${customer.nome}${customer.telefono ? ' · ' + customer.telefono : ''}`;
            showModal('Auto sostitutiva', `
                <div class="notice notice-info"><i class="fas fa-car-tunnel"></i><div><strong>Impegno del veicolo senza contratto commerciale</strong><span>La vettura viene assegnata al cliente e risulta impegnata (stato "sostituzione") ma senza numero contratto, costi, Kasko o incassi.</span></div></div>
                <form id="replacement-form" class="form-grid">
                    <div class="form-group customer-search-group">
                        <label class="form-label" for="replacement_customer_search">Cliente *</label>
                        <input class="form-control" id="replacement_customer_search" name="replacement_customer_search" type="search" autocomplete="off" placeholder="Cerca per nome, cognome o telefono" required>
                        <input id="replacement_customer_id" name="customer_id" type="hidden">
                        <div id="replacement-customer-search-results" class="customer-search-results" role="listbox"></div>
                    </div>
                    ${selectField('Veicolo *','vehicle_id','',[['','— Seleziona veicolo —'],...freeVehicles.map(x => [x.id, `${x.targa} · ${[x.marca,x.modello].filter(Boolean).join(' ')}`])],'required')}
                    ${field('Data consegna *','data_partenza',today(),'date','required')}
                    ${field('Ora consegna *','ora_partenza','09:00','time','required')}
                    ${field('Restituzione prevista *','data_rientro_previsto',(() => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateKey(d); })(),'date','required')}
                    ${field('Ora restituzione *','ora_rientro_previsto','18:00','time','required')}
                    ${textarea('Note','note','')}
                    <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-secondary"><i class="fas fa-car-tunnel"></i> Assegna auto sostitutiva</button></div>
                </form>`);
            const customerSearchEl = document.getElementById('replacement_customer_search');
            const customerIdEl = document.getElementById('replacement_customer_id');
            const customerResultsEl = document.getElementById('replacement-customer-search-results');
            const normalizeSearchR = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT').trim();
            const showReplacementSuggestions = query => {
                const needle = normalizeSearchR(query);
                if (!needle) { customerResultsEl.innerHTML = ''; return; }
                const matches = customers.filter(customer => normalizeSearchR(`${customer.nome} ${customer.cognome} ${customer.telefono || ''}`).includes(needle)).slice(0, 8);
                customerResultsEl.innerHTML = matches.length
                    ? matches.map(customer => `<button type="button" class="customer-suggestion" data-customer-id="${customer.id}">${escapeHtml(customerLabelR(customer))}</button>`).join('')
                    : '<div class="customer-search-empty">Nessun cliente trovato</div>';
                customerResultsEl.querySelectorAll('.customer-suggestion').forEach(button => button.addEventListener('click', () => {
                    const customer = customers.find(x => String(x.id) === button.dataset.customerId);
                    if (!customer) return;
                    customerSearchEl.value = customerLabelR(customer);
                    customerIdEl.value = customer.id;
                    customerResultsEl.innerHTML = '';
                }));
            };
            customerSearchEl?.addEventListener('input', () => {
                customerIdEl.value = '';
                showReplacementSuggestions(customerSearchEl.value);
            });
            customerSearchEl?.addEventListener('focus', () => showReplacementSuggestions(customerSearchEl.value));
            customerSearchEl?.addEventListener('blur', () => setTimeout(() => { customerResultsEl.innerHTML = ''; }, 150));
            document.getElementById('replacement-form')?.addEventListener('submit', async e => {
                e.preventDefault();
                try {
                    const data = formDataToObject(e.currentTarget);
                    delete data.replacement_customer_search;
                    if (!data.customer_id) {
                        const exact = customers.find(customer => normalizeSearchR(customerLabelR(customer)) === normalizeSearchR(customerSearchEl?.value));
                        if (exact) data.customer_id = exact.id;
                        else { showToast('Seleziona un cliente dai suggerimenti', 'warning'); return; }
                    }
                    data.tipo_impegno = 'sostitutiva';
                    data.stato = 'in_corso';
                    await api.post('/contracts', data);
                    closeModal();
                    showToast('Auto sostitutiva assegnata: veicolo impegnato senza contratto');
                    await renderRentals();
                } catch (_) {}
            });
        } catch (_) {}
    };

    window.viewContract = async id => {
        try {
            const c = await api.get(`/contracts/${id}`);
            const isSost = c.tipo_impegno === 'sostitutiva';
            showModal(isSost ? 'Auto sostitutiva' : c.numero_contratto || `Prenotazione #${id}`, `
                <div class="detail-grid">${isSost ? `<div><span>Tipo</span><strong>Auto sostitutiva</strong></div>` : ''}<div><span>Cliente</span><strong>${escapeHtml(c.customer ? `${c.customer.cognome} ${c.customer.nome}` : '—')}</strong></div><div><span>Veicolo</span><strong>${escapeHtml(c.vehicle ? `${c.vehicle.targa} · ${c.vehicle.marca || ''} ${c.vehicle.modello || ''}` : '—')}</strong></div><div><span>Consegna</span><strong>${formatDate(c.data_partenza)} ${escapeHtml(c.ora_partenza || '')}</strong></div><div><span>Restituzione prevista</span><strong>${formatDate(c.data_rientro_previsto)} ${escapeHtml(c.ora_rientro_previsto || '')}</strong></div>${isSost ? `<div><span>Impegno</span><strong>Senza contratto commerciale</strong></div>` : `<div><span>Tariffa</span><strong>${formatCurrency(c.importo_giorno)} / giorno</strong></div><div><span>Totale</span><strong>${formatCurrency(c.totale)}</strong></div>`}<div><span>Stato</span>${statusBadge(c.stato)}</div>${isSost ? '' : `<div><span>Deposito</span><strong>${formatCurrency(c.deposito_cauzionale)}</strong></div>`}</div>
                ${c.note ? `<hr class="separator"><p><strong>Note:</strong><br>${escapeHtml(c.note)}</p>` : ''}
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button>${!isSost ? `${c.pdf_filename ? `<button class="btn btn-secondary" onclick="openSavedContractPdf(${id})"><i class="fas fa-folder-open"></i> Apri PDF salvato</button>` : ''}<button class="btn btn-secondary" onclick="downloadContractPdf(${id})"><i class="fas fa-file-pdf"></i> ${c.pdf_filename ? 'Rigenera PDF' : 'Genera contratto PDF'}</button>${['in_corso'].includes(c.stato) ? `<button class="btn btn-secondary" onclick="closeModal(); openProlungaModal(${id})"><i class="fas fa-clock-rotate-left"></i> Prolunga</button>` : ''}` : ''}${c.stato === 'in_corso' ? `<button class="btn btn-success" onclick="closeModal(); openCheckin(${id})"><i class="fas fa-flag-checkered"></i> Rientro veicolo</button>` : ''}${!isSost ? `<button class="btn btn-primary" onclick="closeModal(); openContractForm(${id})"><i class="fas fa-pen"></i> ${c.stato === 'prenotazione' ? 'Prepara / modifica' : 'Modifica'}</button>` : ''}</div>`);
        } catch (_) {}
    };

    // ---------- Prolungamento noleggio ----------
    window.openProlungaModal = async id => {
        let c;
        try { c = await api.get(`/contracts/${id}`); } catch { return; }
        if (c.stato !== 'in_corso') { showToast('Prolungamento disponibile solo per noleggi in corso', 'warning'); return; }

        const oldEndDate = String(c.data_rientro_previsto || '').slice(0, 10);
        const oldEndTime = c.ora_rientro_previsto || '23:59';
        const oldEndDateTime = `${oldEndDate} ${oldEndTime}`;
        const dayAfter = (() => { const d = new Date(`${oldEndDate}T00:00:00`); d.setDate(d.getDate() + 1); return toLocalDateKey(d); })();
        const defaultEnd = dayAfter > today() ? dayAfter : today();

        showModal('Prolunga noleggio', `
            <div class="notice notice-warning"><i class="fas fa-clock-rotate-left"></i><div><strong>${escapeHtml(c.customer ? `${c.customer.cognome} ${c.customer.nome}` : 'Cliente')} · ${escapeHtml(c.vehicle ? c.vehicle.targa : '—')}</strong><span>Termine attuale: ${formatDate(c.data_rientro_previsto)} ${escapeHtml(c.ora_rientro_previsto || '23:59')} · Tariffa ${formatCurrency(c.importo_giorno)}/giorno · Kasko: ${Number(c.kasko_inclusa) === 1 ? 'inclusa (+' + formatCurrency(c.kasko_prezzo) + ')' : 'non inclusa'}</span></div></div>
            <form id="prolunga-form" class="form-grid">
                ${field('Fino a (data rientro) *','prolunga_data_rientro',defaultEnd,'date',`required min="${dayAfter}"`)}
                ${field('Ora rientro *','prolunga_ora_rientro',oldEndTime,'time','required')}
                <div class="form-span-2 form-section-title"><strong>Le condizioni restano invariate?</strong></div>
                <div class="form-span-2">
                    <label class="form-check"><input class="form-check-input" type="radio" name="condizioni_inv" value="si" checked><span>Sì: stesso prezzo e stessa Kasko del contratto attuale</span></label>
                    <label class="form-check"><input class="form-check-input" type="radio" name="condizioni_inv" value="no"><span>No: voglio modificare condizioni o veicolo</span></label>
                </div>
                <div class="form-span-2 form-hint">Se le condizioni restano invariate il sistema genera automaticamente un nuovo noleggio intestato allo stesso cliente, che parte dal rientro attuale, con lo stesso prezzo al giorno e la stessa Kasko.</div>
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-success"><i class="fas fa-clock-rotate-left"></i> Prolunga</button></div>
            </form>`);

        document.getElementById('prolunga-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const newData = document.getElementById('prolunga_data_rientro')?.value || '';
            const newOra = document.getElementById('prolunga_ora_rientro')?.value || oldEndTime;
            const newEndDateTime = `${newData} ${newOra}`;
            if (!newData || newEndDateTime <= oldEndDateTime) {
                showToast('La nuova data di rientro deve essere successiva a quella attuale', 'warning');
                return;
            }
            const sameConditions = document.querySelector('input[name="condizioni_inv"]:checked')?.value === 'si';
            if (sameConditions) {
                try {
                    await api.post(`/contracts/${id}/prolong`, { data_rientro_previsto: newData, ora_rientro_previsto: newOra });
                    closeModal();
                    showToast('Prolungamento creato con le stesse condizioni');
                    await refreshCurrentPage();
                } catch (_) {}
            } else {
                closeModal();
                const days = Math.max(1, Math.ceil((new Date(`${newData}T00:00:00`) - new Date(`${oldEndDate}T00:00:00`)) / 86400000));
                openContractForm(null, {
                    customer_id: c.customer_id,
                    vehicle_id: c.vehicle_id,
                    prolungamento_di: c.id,
                    data_partenza: oldEndDate,
                    ora_partenza: oldEndTime,
                    data_rientro_previsto: newData,
                    ora_rientro_previsto: newOra,
                    giorni_tariffa: Number.isFinite(days) ? days : 1,
                    stato: 'in_corso',
                    data_scadenza_pagamento: oldEndDate,
                    importo_giorno: c.importo_giorno,
                    kasko_inclusa: c.kasko_inclusa,
                    kasko_prezzo: c.kasko_prezzo,
                    deposito_cauzionale: c.deposito_cauzionale,
                    km_inclusi: c.km_inclusi,
                    extra_km: c.extra_km,
                    filiale_partenza: c.filiale_partenza,
                    filiale_rientro: c.filiale_rientro,
                    secondo_conducente_nome: c.secondo_conducente_nome,
                    secondo_conducente_doc_categoria: c.secondo_conducente_doc_categoria,
                    secondo_conducente_doc_numero: c.secondo_conducente_doc_numero,
                    secondo_conducente_doc_rilasciato_da: c.secondo_conducente_doc_rilasciato_da,
                    secondo_conducente_doc_rilasciato_il: c.secondo_conducente_doc_rilasciato_il,
                    secondo_conducente_doc_scadenza: c.secondo_conducente_doc_scadenza,
                    note: c.note
                });
            }
        });
    };

    const refreshCurrentPage = () => {
        const path = (window.location.hash.slice(1) || '/dashboard').split('?')[0];
        const render = routes[path] || renderDashboard;
        return render();
    };

    window.openCheckin = async id => {
        let c;
        try { c = await api.get(`/contracts/${id}`); } catch { return; }
        const residuo = Number(c.residuo || 0);
        const warning = residuo > 0.004
            ? `<div class="notice notice-warning"><i class="fas fa-triangle-exclamation"></i><div><strong>Pagamento in sospeso</strong><span>Residuo da incassare: ${formatCurrency(residuo)}. Registra l'incasso alla rientrata.</span></div></div>`
            : '';
        let daFirmare = [];
        if (Array.isArray(c.catena_prolungamento)) {
            daFirmare = c.catena_prolungamento.filter(x => x.prolungamento_di && !['annullato', 'concluso'].includes(x.stato));
        } else if (c.prolungato_in && !['annullato', 'concluso'].includes(c.prolungato_in.stato)) {
            daFirmare = [c.prolungato_in];
        }
        const prolungaReminder = daFirmare.length
            ? daFirmare.map(f => `<div class="notice notice-warning"><i class="fas fa-file-signature"></i><div><strong>Cliente che ha prolungato: far firmare il nuovo contratto</strong><span>Questo noleggio prosegue con ${f.numero_contratto ? 'contratto n. ' + escapeHtml(f.numero_contratto) : 'Prenotazione #' + f.id}, che scade il ${formatDate(f.data_rientro_previsto)} ${escapeHtml(f.ora_rientro_previsto || '23:59')}. Alla rientrata ricorda al cliente di firmarlo.</span></div></div>
                <div class="modal-actions" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" onclick="closeModal(); viewContract(${f.id})"><i class="fas fa-eye"></i> Apri nuovo contratto</button><button type="button" class="btn btn-secondary btn-sm" onclick="downloadContractPdf(${f.id})"><i class="fas fa-file-pdf"></i> Genera contratto da firmare</button></div>`).join('')
            : '';
        showModal('Rientro veicolo / Check-in', `
            ${warning}
            ${prolungaReminder}
            <form id="checkin-form" class="form-grid">
                ${field('Data rientro','data_arrivo',c.data_arrivo || today(),'date','required')}${field('Ora rientro','ora_arrivo',c.ora_arrivo || new Date().toTimeString().slice(0,5),'time','required')}
                ${field('Km arrivo','km_arrivo',c.km_arrivo ?? c.km_partenza ?? 0,'number','min="0"')}${field('Carburante arrivo','carburante_arrivo',c.carburante_arrivo || '','text','placeholder="Es. pieno, 3/4, 42 litri"')}
                ${textarea('Note di rientro','note',c.note)}
                ${residuo > 0.004 ? `<div class="form-span-2 form-section-title"><strong>Incasso alla rientrata</strong></div>${field('Importo incassato (€)','importo',residuo,'number','min="0" step="0.01"')}${selectField('Metodo','metodo','contanti',[['contanti','Contanti'],['carta','Carta di credito/debito'],['bonifico','Bonifico'],['assegno','Assegno'],['altro','Altro']])}${field('Data pagamento','data_pagamento',today(),'date','required')}` : ''}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-success"><i class="fas fa-check"></i> ${residuo > 0.004 ? 'Completa noleggio e incassa' : 'Completa noleggio'}</button></div>
            </form>`);
        document.getElementById('checkin-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                const data = formDataToObject(e.currentTarget);
                const res = await api.put(`/contracts/${id}/checkin`, data);
                const importo = Number(data.importo || 0);
                if (importo > 0) {
                    await api.post('/finance/payments', {
                        contract_id: id,
                        vehicle_id: c.vehicle_id || null,
                        importo,
                        metodo: data.metodo || 'contanti',
                        data_pagamento: data.data_pagamento || today(),
                        note: `Incasso al rientro (${c.numero_contratto || 'Prenotazione #' + c.id})`
                    });
                }
                closeModal();
                showToast(importo > 0 ? 'Check-in completato e pagamento registrato' : 'Check-in completato');
                if (res?.reminder_prolungamento) {
                    const r = res.reminder_prolungamento;
                    const nomeC = r.numero_contratto || 'Prenotazione #' + r.contratto_id;
                    showToast(`Ricorda: far firmare al cliente il nuovo contratto ${nomeC} (prolungamento fino al ${formatDate((r.fino_al || '').slice(0, 10))})`, 'warning');
                }
                await refreshCurrentPage();
            } catch (_) {}
        });
    };

    window.openCheckout = async id => {
        let c;
        try { c = await api.get(`/contracts/${id}`); } catch { return; }
        const residuo = Number(c.residuo || 0);
        const cliente = [c.customer?.cognome, c.customer?.nome].filter(Boolean).join(' ') || '—';
        const auto = [c.vehicle?.marca, c.vehicle?.modello].filter(Boolean).join(' ');
        const kmSuggerito = c.km_partenza ?? c.vehicle?.km_attuali ?? 0;
        showModal('Check di uscita', `
            <div class="detail-grid">
                <div><span>Cliente</span><strong>${escapeHtml(cliente)}</strong></div>
                <div><span>Veicolo</span><strong>${escapeHtml(c.targa || c.vehicle?.targa || '—')}${auto ? ' · ' + escapeHtml(auto) : ''}</strong></div>
                <div><span>Contratto</span><strong>${escapeHtml(c.numero_contratto || 'Prenotazione #' + c.id)}</strong></div>
                <div><span>Periodo previsto</span><strong>${formatDate(c.data_partenza)} ${escapeHtml(c.ora_partenza || '')} → ${formatDate(c.data_rientro_previsto)}</strong></div>
                <div><span>Totale</span><strong>${formatCurrency(c.totale)}</strong></div>
                <div><span>Già incassato</span><strong>${formatCurrency(c.incassato)}</strong></div>
                <div><span>Residuo</span><strong class="${residuo > 0.004 ? 'text-danger' : 'text-success'}">${formatCurrency(residuo)}</strong></div>
            </div>
            <div class="checkout-contract-actions">
                <div class="form-section-title"><strong>Contratto</strong></div>
                <div class="contract-btn-row">
                    <button type="button" class="btn btn-primary" onclick="downloadContractPdf(${c.id})"><i class="fas fa-file-pdf"></i> ${c.pdf_filename ? 'Rigenera contratto' : 'Genera contratto'}</button>
                    ${c.pdf_filename ? `<button type="button" class="btn btn-secondary" onclick="openSavedContractPdf(${c.id})"><i class="fas fa-folder-open"></i> Mostra contratto</button>` : ''}
                </div>
            </div>
            <hr class="separator">
            <form id="checkout-form" class="form-grid">
                ${field('Data uscita','data_partenza',c.data_partenza || today(),'date','required')}
                ${field('Ora uscita','ora_partenza',c.ora_partenza || new Date().toTimeString().slice(0,5),'time','required')}
                ${field('Km partenza','km_partenza',kmSuggerito,'number','min="0"')}
                ${field('Carburante partenza','carburante_partenza',c.carburante_partenza || '1/1','text','placeholder="Es. pieno, 3/4, 42 litri"')}
                <div class="form-span-2 form-section-title"><strong>Incasso alla partenza</strong></div>
                ${field('Importo incassato (€)','importo',residuo > 0.004 ? residuo : 0,'number','min="0" step="0.01"')}
                ${selectField('Metodo','metodo','contanti',[['contanti','Contanti'],['carta','Carta di credito/debito'],['bonifico','Bonifico'],['assegno','Assegno'],['altro','Altro']])}
                ${field('Data pagamento','data_pagamento',today(),'date','required')}
                ${textarea('Note pagamento','payment_note',`Incasso alla partenza (${c.numero_contratto || 'Prenotazione #' + c.id})`)}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-success"><i class="fas fa-key"></i> Conferma uscita${residuo > 0.004 ? ' e incassa' : ''}</button></div>
            </form>`);
        document.getElementById('checkout-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                const data = formDataToObject(e.currentTarget);
                await api.put(`/contracts/${id}`, {
                    stato: 'in_corso',
                    data_partenza: data.data_partenza,
                    ora_partenza: data.ora_partenza,
                    km_partenza: data.km_partenza,
                    carburante_partenza: data.carburante_partenza
                });
                const importo = Number(data.importo || 0);
                if (importo > 0) {
                    await api.post('/finance/payments', {
                        contract_id: id,
                        vehicle_id: c.vehicle_id || null,
                        importo,
                        metodo: data.metodo || 'contanti',
                        data_pagamento: data.data_pagamento || today(),
                        note: data.payment_note || ''
                    });
                }
                closeModal();
                showToast(importo > 0 ? 'Uscita confermata e pagamento registrato' : 'Uscita confermata');
                await refreshCurrentPage();
            } catch (_) {}
        });
    };

    window.deleteContract = id => showConfirm('Eliminare questo contratto di noleggio?', async () => {
        try { await api.delete(`/contracts/${id}`); showToast('Contratto eliminato'); await renderRentals(); } catch (_) {}
    });

    function pdfDate(value) {
        if (!value) return '';
        const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
    }

    function pdfMoney(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function pdfValue(value) {
        return value == null ? '' : String(value);
    }

    async function ensurePdfLib() {
        if (window.PDFLib) return window.PDFLib;
        const sources = [
            'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
            'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
        ];
        for (const src of sources) {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    const timer = setTimeout(() => {
                        script.remove();
                        reject(new Error('timeout'));
                    }, 12000);
                    script.src = src;
                    script.async = true;
                    script.onload = () => { clearTimeout(timer); resolve(); };
                    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('load')); };
                    document.head.appendChild(script);
                });
                if (window.PDFLib) return window.PDFLib;
            } catch (_) {}
        }
        throw new Error('Per generare il contratto PDF serve una connessione Internet. Il resto del gestionale continua a funzionare anche senza.');
    }

    window.openSavedContractPdf = id => {
        window.open(`/api/contracts/${id}/pdf-file?t=${Date.now()}`, '_blank', 'noopener');
    };

    window.downloadContractPdf = async id => {
        // Apro subito una scheda vuota: cosi il browser non blocca l'apertura del PDF
        // dopo le operazioni asincrone di generazione e salvataggio sul server.
        const pdfWindow = window.open('', '_blank');
        try {
            showLoader();
            await ensurePdfLib();

            // Il server assegna qui il numero definitivo se la pratica era ancora una semplice prenotazione.
            const c = await api.post(`/contracts/${id}/pdf-data`, {}, { showLoader: false });
            const templateResponse = await fetch('/templates/contratto_noleggio.pdf', { cache: 'no-store' });
            if (!templateResponse.ok) throw new Error('Modello contratto non trovato');

            const { PDFDocument, StandardFonts } = window.PDFLib;
            const pdfDoc = await PDFDocument.load(await templateResponse.arrayBuffer());
            const form = pdfDoc.getForm();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

            const setText = (name, value) => {
                try {
                    const field = form.getTextField(name);
                    field.setText(pdfValue(value));
                    field.updateAppearances(font);
                } catch (err) {
                    console.warn(`Campo PDF non disponibile: ${name}`, err);
                }
            };

            const customer = c.customer || {};
            const vehicle = c.vehicle || {};
            const clienteNome = [customer.nome, customer.cognome].filter(Boolean).join(' ');

            setText('Veicolo_targa', vehicle.targa);
            setText('Veicolo_marca', vehicle.marca);
            setText('Veicolo_modello', vehicle.modello);
            setText('Veicolo_alimentazione', vehicle.alimentazione);
            setText('Veicolo_posti', vehicle.nr_posti);
            setText('Filiale_uscita', c.filiale_partenza);
            setText('Filiale_rientro', c.filiale_rientro);
            setText('Data_partenza', pdfDate(c.data_partenza));
            setText('Ora_partenza', c.ora_partenza);
            setText('Data_rientro', pdfDate(c.data_rientro_previsto));
            setText('Ora_rientro', c.ora_rientro_previsto);
            setText('Km_partenza', c.km_partenza);
            setText('Carburante_partenza', c.carburante_partenza);

            setText('Cliente_nome', clienteNome);
            setText('Cliente_cf', customer.codice_fiscale || customer.partita_iva);
            setText('Cliente_telefono', customer.telefono);
            setText('Cliente_indirizzo', customer.indirizzo);
            setText('Cliente_data_nascita', pdfDate(customer.data_nascita));
            setText('Cliente_luogo_nascita', customer.luogo_nascita);
            setText('Patente_categoria', customer.patente_categoria);
            setText('Patente_numero', customer.patente_numero);
            setText('Patente_rilasciata_da', customer.patente_rilasciata_da);
            setText('Patente_rilasciata_il', pdfDate(customer.patente_rilasciata_il));
            setText('Patente_scadenza', pdfDate(customer.patente_scadenza));

            setText('Conducente2_nome', c.secondo_conducente_nome);
            setText('Conducente2_categoria', c.secondo_conducente_doc_categoria);
            setText('Conducente2_numero_documento', c.secondo_conducente_doc_numero);
            setText('Conducente2_rilasciato_da', c.secondo_conducente_doc_rilasciato_da);
            setText('Conducente2_rilasciato_il', pdfDate(c.secondo_conducente_doc_rilasciato_il));
            setText('Conducente2_scadenza', pdfDate(c.secondo_conducente_doc_scadenza));

            setText('Giorni_tariffa', c.giorni_tariffa);
            setText('Importo_tariffa', pdfMoney(c.importo_giorno));
            setText('Km_inclusi', c.km_inclusi);
            setText('Franchigia_kasko_cliente', pdfMoney(c.franchigia_kasko_cliente));
            setText('Stato_kasko', Number(c.kasko_inclusa) === 1 ? 'ATTIVO' : 'NON ATTIVO');
            setText('Cauzione', pdfMoney(c.deposito_cauzionale));
            setText('Imponibile', pdfMoney(c.imponibile));
            setText('Iva', pdfMoney(c.iva));
            setText('Totale', pdfMoney(c.totale));

            // Il PDF consegnato al cliente non contiene piu campi modificabili accidentalmente.
            form.flatten();
            const bytes = await pdfDoc.save();

            // Niente download sul PC client: il PDF viene inviato e conservato sul server.
            const saveResponse = await fetch(`/api/contracts/${id}/pdf-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/pdf' },
                body: bytes
            });

            let saved = {};
            try { saved = await saveResponse.json(); } catch (_) {}
            if (!saveResponse.ok) {
                throw new Error(saved.error || 'Impossibile salvare il contratto sul server');
            }

            const savedUrl = `${saved.url}?t=${Date.now()}`;
            if (pdfWindow && !pdfWindow.closed) {
                pdfWindow.location.href = savedUrl;
            } else {
                const a = document.createElement('a');
                a.href = savedUrl;
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }

            showToast(`Contratto salvato sul server: ${saved.filename}`);
        } catch (err) {
            if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
            showToast(err.message || 'Impossibile generare il PDF', 'error');
        } finally {
            hideLoader();
        }
    };

    // ---------- Calendario disponibilità ----------
    let calendarAnchor = new Date();
    const CALENDAR_DAYS = 14;

    function toLocalDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function parseContractDateTime(dateValue, timeValue, fallbackTime) {
        if (!dateValue) return null;
        const time = String(timeValue || fallbackTime || '00:00').slice(0, 5);
        return new Date(`${String(dateValue).slice(0, 10)}T${time}:00`);
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function dayLabel(date) {
        const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date).replace('.', '');
        return `<span>${escapeHtml(weekday)}</span><strong>${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}</strong>`;
    }

    function calendarBookingLabel(c, dayStart) {
        const start = parseContractDateTime(c.data_partenza, c.ora_partenza, '00:00');
        const end = parseContractDateTime(c.data_rientro_previsto, c.ora_rientro_previsto, '23:59');
        const dayEnd = addDays(dayStart, 1);
        const startsToday = start >= dayStart && start < dayEnd;
        const endsToday = end > dayStart && end <= dayEnd;
        let timeText = 'occupata';
        if (startsToday && endsToday) timeText = `${c.ora_partenza || '00:00'}–${c.ora_rientro_previsto || '23:59'}`;
        else if (startsToday) timeText = `dalle ${c.ora_partenza || '00:00'}`;
        else if (endsToday) timeText = `fino ${c.ora_rientro_previsto || '23:59'}`;
        const customer = [c.cognome, c.nome].filter(Boolean).join(' ') || 'Cliente';
        const cls = c.stato === 'in_corso' ? 'is-running' : (c.stato === 'concluso' ? 'is-concluded' : 'is-booked');
        return `<button type="button" class="calendar-booking ${cls}" onclick="viewContract(${c.id})" title="${attr(customer)} · ${attr(c.targa || '')} · ${c.stato === 'concluso' ? 'Noleggio concluso' : 'Noleggio'}" data-stato="${escapeHtml(c.stato || '')}"><strong>${escapeHtml(timeText)}</strong><span>${escapeHtml(customer)}</span></button>`;
    }

    async function renderCalendar() {
        pageTitle().textContent = 'Calendario disponibilità';
        try {
            const [vehicles, contracts] = await Promise.all([api.get('/vehicles'), api.get('/contracts')]);
            const days = Array.from({ length: CALENDAR_DAYS }, (_, i) => addDays(new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), calendarAnchor.getDate()), i));
            const activeContracts = contracts.filter(c => ['prenotazione', 'in_corso', 'concluso'].includes(c.stato));
            const firstDay = days[0];
            const lastDay = days[days.length - 1];
            const rangeLabel = `${formatDate(toLocalDateKey(firstDay))} – ${formatDate(toLocalDateKey(lastDay))}`;
            const nowKey = toLocalDateKey(new Date());
            const defaultStart = `${nowKey}T09:00`;
            const defaultEnd = `${toLocalDateKey(addDays(new Date(), 1))}T18:00`;

            appContent().innerHTML = `
                <div class="page-toolbar calendar-toolbar"><div><h2>Disponibilità vetture</h2><p>Le prenotazioni bloccano la vettura usando <strong>data e ora</strong>. Due prenotazioni possono stare nello stesso giorno se gli orari non si sovrappongono.</p></div><button class="btn btn-success" onclick="openContractForm()"><i class="fas fa-plus"></i> Nuova prenotazione</button></div>
                <div class="card availability-card"><div class="card-header"><h3 class="card-title"><i class="fas fa-magnifying-glass"></i> Verifica disponibilità</h3></div><div class="card-body">
                    <form id="availability-form" class="availability-form">
                        <div class="form-group"><label class="form-label">Da</label><input id="availability-start" class="form-control" type="datetime-local" value="${defaultStart}" required></div>
                        <div class="form-group"><label class="form-label">A</label><input id="availability-end" class="form-control" type="datetime-local" value="${defaultEnd}" required></div>
                        <button class="btn btn-primary" type="submit"><i class="fas fa-search"></i> Cerca vetture libere</button>
                    </form>
                    <div id="availability-result" class="availability-result"><span class="text-muted">Inserisci l'intervallo richiesto dal cliente e premi “Cerca vetture libere”.</span></div>
                </div></div>
                <div class="card mt-4"><div class="card-header planning-header"><div><h3 class="card-title">Planning · ${rangeLabel}</h3><div class="calendar-legend"><span><i class="legend-dot booked"></i> Prenotata</span><span><i class="legend-dot running"></i> In noleggio</span><span><i class="legend-dot concluded"></i> Conclusa</span></div></div><div class="toolbar-actions"><button class="btn btn-secondary btn-sm" onclick="moveCalendar(-${CALENDAR_DAYS})"><i class="fas fa-chevron-left"></i></button><button class="btn btn-secondary btn-sm" onclick="calendarToday()">Oggi</button><button class="btn btn-secondary btn-sm" onclick="moveCalendar(${CALENDAR_DAYS})"><i class="fas fa-chevron-right"></i></button></div></div>
                    <div class="planning-scroll"><div class="planning-grid" style="--calendar-days:${CALENDAR_DAYS}">
                        <div class="planning-corner">Vettura</div>
                        ${days.map(d => `<div class="planning-day-head ${toLocalDateKey(d) === nowKey ? 'is-today' : ''}">${dayLabel(d)}</div>`).join('')}
                        ${vehicles.length ? vehicles.map(v => {
                            const vehicleContracts = activeContracts.filter(c => String(c.vehicle_id) === String(v.id));
                            return `<div class="planning-vehicle"><strong>${escapeHtml(v.targa)}</strong><span>${escapeHtml([v.marca, v.modello].filter(Boolean).join(' ') || 'Veicolo')}</span></div>${days.map(day => {
                                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                                const dayEnd = addDays(dayStart, 1);
                                const bookings = vehicleContracts.filter(c => {
                                    const start = parseContractDateTime(c.data_partenza, c.ora_partenza, '00:00');
                                    const end = parseContractDateTime(c.data_rientro_previsto, c.ora_rientro_previsto, '23:59');
                                    return start && end && start < dayEnd && end > dayStart;
                                });
                                return `<div class="planning-cell ${toLocalDateKey(day) === nowKey ? 'is-today' : ''}">${bookings.map(c => calendarBookingLabel(c, dayStart)).join('')}</div>`;
                            }).join('')}`;
                        }).join('') : `<div class="planning-empty" style="grid-column:1 / -1">Inserisci prima almeno un veicolo.</div>`}
                    </div></div>
                </div>`;

            document.getElementById('availability-form')?.addEventListener('submit', async e => {
                e.preventDefault();
                await checkAvailability();
            });
        } catch (err) { handleRenderError(err, 'Calendario'); }
    }

    window.moveCalendar = days => {
        calendarAnchor = addDays(calendarAnchor, Number(days) || 0);
        renderCalendar();
    };

    window.calendarToday = () => {
        calendarAnchor = new Date();
        renderCalendar();
    };

    window.checkAvailability = async () => {
        const resultEl = document.getElementById('availability-result');
        const start = document.getElementById('availability-start')?.value;
        const end = document.getElementById('availability-end')?.value;
        if (!resultEl || !start || !end) return;
        if (end <= start) { showToast('Il rientro deve essere successivo alla partenza', 'warning'); return; }
        try {
            resultEl.innerHTML = '<span class="text-muted">Controllo in corso…</span>';
            const data = await api.get(`/contracts/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { showLoader: false });
            if (!data.available.length) {
                resultEl.innerHTML = `<div class="availability-none"><i class="fas fa-circle-xmark"></i><strong>Nessuna vettura libera in questo intervallo.</strong><span>Prova a cambiare l'orario o le date.</span></div>`;
                return;
            }
            resultEl.innerHTML = `<div class="availability-summary"><strong>${data.available.length} vettur${data.available.length === 1 ? 'a libera' : 'e libere'}</strong><span>dal ${formatDate(start.slice(0,10))} ${escapeHtml(start.slice(11,16))} al ${formatDate(end.slice(0,10))} ${escapeHtml(end.slice(11,16))}</span></div><div class="available-vehicles">${data.available.map(v => `<div class="available-vehicle"><div><strong>${escapeHtml(v.targa)}</strong><span>${escapeHtml([v.marca,v.modello].filter(Boolean).join(' '))}</span></div><button class="btn btn-success btn-sm" onclick="bookAvailableVehicle(${v.id})"><i class="fas fa-calendar-plus"></i> Prenota</button></div>`).join('')}</div>`;
        } catch (_) {
            resultEl.innerHTML = '<span class="text-danger">Impossibile verificare la disponibilità.</span>';
        }
    };

    window.bookAvailableVehicle = vehicleId => {
        const start = document.getElementById('availability-start')?.value || '';
        const end = document.getElementById('availability-end')?.value || '';
        const [startDate, startTime] = start.split('T');
        const [endDate, endTime] = end.split('T');
        openContractForm(null, {
            vehicle_id: vehicleId,
            data_partenza: startDate,
            ora_partenza: startTime,
            data_rientro_previsto: endDate,
            ora_rientro_previsto: endTime,
            stato: 'prenotazione'
        });
    };

    // ---------- Maintenance ----------
    async function renderMaintenance() {
        pageTitle().textContent = 'Manutenzione';
        try {
            const [items, upcoming] = await Promise.all([api.get('/maintenance'), api.get('/maintenance/upcoming')]);
            appContent().innerHTML = `
                <div class="page-toolbar"><div><h2>Manutenzioni e scadenze</h2><p>Interventi effettuati e programmati sui veicoli.</p></div><button class="btn btn-primary" onclick="openMaintenanceForm()"><i class="fas fa-plus"></i> Nuovo intervento</button></div>
                ${upcoming.length ? `<div class="card mb-4"><div class="card-header"><h3 class="card-title">In scadenza nei prossimi 30 giorni</h3></div><div class="card-body">${upcoming.slice(0,8).map(m => `<div class="event-row"><i class="fas fa-bell text-warning"></i><div><strong>${escapeHtml(m.targa)} · ${escapeHtml(m.tipo || 'Scadenza')}</strong><small>${formatDate(m.data_prossima)}</small></div></div>`).join('')}</div></div>` : ''}
                <div class="card"><div class="card-body no-padding">${items.length ? `<div class="table-container"><table class="table" id="maintenance-table"><thead><tr><th>Data</th><th>Veicolo</th><th>Tipo</th><th>Descrizione</th><th>Costo</th><th>Prossima</th><th class="text-right">Azioni</th></tr></thead><tbody>${items.map(m => `<tr><td>${formatDate(m.data)}</td><td><strong>${escapeHtml(m.targa)}</strong><br><small class="text-muted">${escapeHtml([m.marca,m.modello].filter(Boolean).join(' '))}</small></td><td>${escapeHtml(m.tipo || '—')}</td><td>${escapeHtml(m.descrizione || '—')}</td><td>${formatCurrency(m.costo)}</td><td>${formatDate(m.data_prossima)}</td><td><div class="action-buttons"><button class="icon-btn" onclick="openMaintenanceForm(${m.id})"><i class="fas fa-pen"></i></button><button class="icon-btn danger" onclick="deleteMaintenance(${m.id})"><i class="fas fa-trash"></i></button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState('fa-screwdriver-wrench','Nessuna manutenzione','Registra tagliandi, revisioni, gomme e altri interventi.',`<button class="btn btn-primary" onclick="openMaintenanceForm()"><i class="fas fa-plus"></i> Nuovo intervento</button>`)}</div></div>`;
            makeSortableTable({
                tableEl: document.getElementById('maintenance-table'),
                data: items,
                rowHtml: m => `<tr><td>${formatDate(m.data)}</td><td><strong>${escapeHtml(m.targa)}</strong><br><small class="text-muted">${escapeHtml([m.marca,m.modello].filter(Boolean).join(' '))}</small></td><td>${escapeHtml(m.tipo || '—')}</td><td>${escapeHtml(m.descrizione || '—')}</td><td>${formatCurrency(m.costo)}</td><td>${formatDate(m.data_prossima)}</td><td><div class="action-buttons"><button class="icon-btn" onclick="openMaintenanceForm(${m.id})"><i class="fas fa-pen"></i></button><button class="icon-btn danger" onclick="deleteMaintenance(${m.id})"><i class="fas fa-trash"></i></button></div></td></tr>`,
                columnGetters: [m => m.data, m => `${m.targa} ${m.marca} ${m.modello}`, m => m.tipo, m => m.descrizione, m => Number(m.costo || 0), m => m.data_prossima, null]
            });
        } catch (err) { handleRenderError(err, 'Manutenzione'); }
    }

    window.openMaintenanceForm = async id => {
        try {
            const [vehicles, items] = await Promise.all([api.get('/vehicles'), id ? api.get('/maintenance') : Promise.resolve([])]);
            if (!vehicles.length) { showToast('Inserisci prima un veicolo', 'warning'); location.hash = '#/vehicles'; return; }
            const m = id ? (items.find(x => String(x.id) === String(id)) || {}) : {};
            showModal(id ? 'Modifica manutenzione' : 'Nuova manutenzione', `
                <form id="maintenance-form" class="form-grid">
                    ${selectField('Veicolo *','vehicle_id',m.vehicle_id,[['','— Seleziona veicolo —'],...vehicles.map(v=>[v.id,`${v.targa} · ${[v.marca,v.modello].filter(Boolean).join(' ')}`])],'required')}
                    ${selectField('Tipo','tipo',m.tipo,[['tagliando','Tagliando'],['revisione','Revisione'],['pneumatici','Pneumatici'],['riparazione','Riparazione'],['assicurazione','Assicurazione'],['altro','Altro']])}
                    ${field('Data *','data',m.data || today(),'date','required')}${field('Costo (€)','costo',m.costo ?? 0,'number','min="0" step="0.01"')}
                    ${field('Km','km',m.km,'number','min="0"')}${field('Officina','officina',m.officina)}
                    ${field('Prossima data','data_prossima',m.data_prossima,'date')}${field('Prossimi km','km_prossimo',m.km_prossimo,'number','min="0"')}
                    ${textarea('Descrizione','descrizione',m.descrizione)}${textarea('Note','note',m.note)}
                    <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salva</button></div>
                </form>`);
            document.getElementById('maintenance-form')?.addEventListener('submit', async e => {
                e.preventDefault();
                try { const data=formDataToObject(e.currentTarget); id ? await api.put(`/maintenance/${id}`,data) : await api.post('/maintenance',data); closeModal(); showToast('Manutenzione salvata'); await renderMaintenance(); } catch (_) {}
            });
        } catch (_) {}
    };

    window.deleteMaintenance = id => showConfirm('Eliminare questo intervento?', async () => {
        try { await api.delete(`/maintenance/${id}`); showToast('Intervento eliminato'); await renderMaintenance(); } catch (_) {}
    });

    // ---------- Finance ----------
    async function renderFinance() {
        pageTitle().textContent = 'Finanze';
        try {
            const [summary, payments, expenses, due] = await Promise.all([api.get('/finance/summary'), api.get('/finance/payments'), api.get('/finance/expenses'), api.get('/finance/due')]);
            const dueRow = d => { const overdue = d.data_scadenza && d.data_scadenza < today(); return `<tr class="clickable-row" onclick="viewContract(${d.contract_id})"><td class="${overdue ? 'text-danger' : ''}">${formatDate(d.data_scadenza)}</td><td><strong>${escapeHtml(d.cognome || '')} ${escapeHtml(d.nome || '')}</strong></td><td>${escapeHtml(d.numero_contratto || '#'+d.contract_id)}<br><small class="text-muted">${escapeHtml(d.targa || '')}</small></td><td>${formatCurrency(d.totale)}</td><td class="text-success">${formatCurrency(d.incassato)}</td><td class="text-danger"><strong>${formatCurrency(d.residuo)}</strong></td><td><button class="btn btn-success btn-sm" onclick="event.stopPropagation(); openPaymentForm(${d.contract_id},${Number(d.residuo)})"><i class="fas fa-plus"></i> Incasso</button></td></tr>`; };
            const paymentRow = p => `<tr class="clickable-row" onclick="openPaymentDetail(${p.id})"><td>${formatDate(p.data_pagamento)}</td><td>${escapeHtml(p.numero_contratto || '—')}<br><small class="text-muted">${escapeHtml(p.cognome || '')} ${escapeHtml(p.nome || '')}</small></td><td>${escapeHtml(p.metodo || '—')}</td><td class="text-success"><strong>${formatCurrency(p.importo)}</strong></td><td><button class="icon-btn danger" onclick="event.stopPropagation(); deletePayment(${p.id})"><i class="fas fa-trash"></i></button></td></tr>`;
            const expenseRow = e => `<tr class="clickable-row" onclick="openExpenseDetail(${e.id})"><td>${formatDate(e.data_spesa)}</td><td>${escapeHtml(e.descrizione || e.tipo || '—')}<br><small class="text-muted">${escapeHtml(e.targa || '')}</small></td><td class="text-danger"><strong>${formatCurrency(e.importo)}</strong></td><td><button class="icon-btn danger" onclick="event.stopPropagation(); deleteExpense(${e.id})"><i class="fas fa-trash"></i></button></td></tr>`;
            appContent().innerHTML = `
                <div class="page-toolbar"><div><h2>Entrate e spese</h2><p>Riepilogo economico dell’anno corrente.</p></div><div class="toolbar-actions"><button class="btn btn-success" onclick="openPaymentForm()"><i class="fas fa-plus"></i> Pagamento</button><button class="btn btn-danger" onclick="openExpenseForm()"><i class="fas fa-minus"></i> Spesa</button></div></div>
                <div class="dashboard-grid"><div class="stat-card"><div class="stat-icon success"><i class="fas fa-arrow-trend-up"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(summary.total_income)}</div><div class="stat-label">Entrate</div></div></div><div class="stat-card"><div class="stat-icon danger"><i class="fas fa-arrow-trend-down"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(summary.total_expenses)}</div><div class="stat-label">Spese</div></div></div><div class="stat-card"><div class="stat-icon primary"><i class="fas fa-scale-balanced"></i></div><div class="stat-info"><div class="stat-value">${formatCurrency(summary.margin)}</div><div class="stat-label">Margine</div></div></div></div>
                <div class="card mb-4"><div class="card-header"><h3 class="card-title">Scadenzario clienti</h3><span class="text-muted">${due.length} da incassare</span></div><div class="card-body no-padding">${due.length ? `<div class="table-container"><table class="table" id="finance-due-table"><thead><tr><th>Scadenza</th><th>Cliente</th><th>Contratto</th><th>Totale</th><th>Incassato</th><th>Residuo</th><th></th></tr></thead><tbody>${due.map(dueRow).join('')}</tbody></table></div>` : '<p class="p-4 text-muted">Nessun pagamento in sospeso.</p>'}</div></div>
                <div class="card mb-4"><div class="card-header"><h3 class="card-title">Prospetto per vettura</h3></div><div class="card-body"><div class="toolbar-actions"><select id="finance-vehicle" class="form-control"><option value="">— Seleziona veicolo —</option>${(await api.get('/vehicles')).map(v => `<option value="${v.id}">${escapeHtml(v.targa)} · ${escapeHtml([v.marca,v.modello].filter(Boolean).join(' '))}</option>`).join('')}</select><button class="btn btn-secondary" onclick="openVehicleFinance()"><i class="fas fa-car"></i> Apri prospetto</button></div></div></div>
                <div class="two-column-grid">
                    <div class="card"><div class="card-header"><h3 class="card-title">Ultimi pagamenti</h3></div><div class="card-body no-padding">${payments.length ? `<div class="table-container"><table class="table" id="finance-payments-table"><thead><tr><th>Data</th><th>Contratto</th><th>Metodo</th><th>Importo</th><th></th></tr></thead><tbody>${payments.slice(0,20).map(paymentRow).join('')}</tbody></table></div>`:'<p class="p-4 text-muted">Nessun pagamento registrato.</p>'}</div></div>
                    <div class="card"><div class="card-header"><h3 class="card-title">Ultime spese</h3></div><div class="card-body no-padding">${expenses.length ? `<div class="table-container"><table class="table" id="finance-expenses-table"><thead><tr><th>Data</th><th>Descrizione</th><th>Importo</th><th></th></tr></thead><tbody>${expenses.slice(0,20).map(expenseRow).join('')}</tbody></table></div>`:'<p class="p-4 text-muted">Nessuna spesa registrata.</p>'}</div></div>
                </div>`;
            makeSortableTable({
                tableEl: document.getElementById('finance-due-table'),
                data: due,
                rowHtml: dueRow,
                columnGetters: [d => d.data_scadenza, d => `${d.cognome} ${d.nome}`, d => `${d.numero_contratto || '#'+d.contract_id} ${d.targa || ''}`, d => Number(d.totale || 0), d => Number(d.incassato || 0), d => Number(d.residuo || 0), null],
                emptyHtml: () => '<tr><td colspan="7" class="p-4 text-muted">Nessun pagamento in sospeso.</td></tr>'
            });
            makeSortableTable({
                tableEl: document.getElementById('finance-payments-table'),
                data: payments.slice(0, 20),
                rowHtml: paymentRow,
                columnGetters: [p => p.data_pagamento, p => `${p.numero_contratto || ''} ${p.cognome || ''} ${p.nome || ''}`, p => p.metodo, p => Number(p.importo || 0), null]
            });
            makeSortableTable({
                tableEl: document.getElementById('finance-expenses-table'),
                data: expenses.slice(0, 20),
                rowHtml: expenseRow,
                columnGetters: [e => e.data_spesa, e => `${e.descrizione || e.tipo || ''} ${e.targa || ''}`, e => Number(e.importo || 0), null]
            });
        } catch (err) { handleRenderError(err, 'Finanze'); }
    }

    window.openPaymentForm = async (selectedContractId = '', suggestedAmount = '') => {
        try {
            const contracts = await api.get('/contracts');
            showModal('Registra pagamento', `<form id="payment-form" class="form-grid">
                ${selectField('Contratto','contract_id',selectedContractId,[['','— Nessun contratto —'],...contracts.map(c=>[c.id,`${c.numero_contratto || '#'+c.id} · ${c.cognome || ''} ${c.nome || ''} · ${c.targa || ''}`])])}
                ${field('Data pagamento','data_pagamento',today(),'date','required')}${field('Importo (€)','importo',suggestedAmount || '','number','min="0.01" step="0.01" required')}${selectField('Metodo','metodo','contanti',[['contanti','Contanti'],['carta','Carta'],['bonifico','Bonifico'],['assegno','Assegno'],['altro','Altro']])}${textarea('Note','note','')}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-success">Registra</button></div></form>`);
            document.getElementById('payment-form')?.addEventListener('submit', async e => { e.preventDefault(); try { const data=formDataToObject(e.currentTarget); if(data.contract_id){ const c=contracts.find(x=>String(x.id)===String(data.contract_id)); data.vehicle_id=c ? c.vehicle_id : null; } else { data.vehicle_id = null; } await api.post('/finance/payments',data); closeModal(); showToast('Pagamento registrato'); await renderFinance(); } catch(_){} });
        } catch (_) {}
    };

    window.openPaymentDetail = async id => {
        try {
            const p = await api.get(`/finance/payments/${id}`);
            showModal('Dettaglio pagamento', `<div class="detail-grid"><div><span>Importo</span><strong>${formatCurrency(p.importo)}</strong></div><div><span>Metodo</span><strong>${escapeHtml(p.metodo || '—')}</strong></div><div><span>Data</span><strong>${formatDate(p.data_pagamento)}</strong></div><div><span>Veicolo</span><strong>${escapeHtml(p.targa || '—')}</strong></div><div><span>Cliente</span><strong>${escapeHtml([p.cognome, p.nome].filter(Boolean).join(' ') || '—')}</strong></div><div><span>Contratto</span><strong>${escapeHtml(p.numero_contratto || '—')}</strong></div></div>${p.note ? `<hr class="separator"><p><strong>Note:</strong><br>${escapeHtml(p.note)}</p>` : ''}<div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button>${p.contract_id ? `<button class="btn btn-primary" onclick="viewContract(${p.contract_id})">Apri contratto</button>` : ''}</div>`);
        } catch (_) {}
    };

    window.openExpenseDetail = async id => {
        try {
            const e = await api.get(`/finance/expenses/${id}`);
            showModal('Dettaglio spesa', `<div class="detail-grid"><div><span>Importo</span><strong>${formatCurrency(e.importo)}</strong></div><div><span>Categoria</span><strong>${escapeHtml(e.tipo || '—')}</strong></div><div><span>Data</span><strong>${formatDate(e.data_spesa)}</strong></div><div><span>Veicolo</span><strong>${escapeHtml(e.targa || 'Spesa generale')}</strong></div><div><span>Fornitore / officina</span><strong>${escapeHtml(e.officina || '—')}</strong></div><div><span>Descrizione</span><strong>${escapeHtml(e.descrizione || '—')}</strong></div></div>${e.note ? `<hr class="separator"><p><strong>Note:</strong><br>${escapeHtml(e.note)}</p>` : ''}<div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button>${e.vehicle_id ? `<button class="btn btn-primary" onclick="viewVehicle(${e.vehicle_id})">Apri veicolo</button>` : ''}</div>`);
        } catch (_) {}
    };

    window.openVehicleFinance = async () => {
        const id = document.getElementById('finance-vehicle')?.value;
        if (!id) return showToast('Seleziona una vettura', 'warning');
        try {
            const data = await api.get(`/finance/vehicle/${id}`);
            const title = `${data.vehicle.targa} · ${[data.vehicle.marca, data.vehicle.modello].filter(Boolean).join(' ')}`;
            showModal(`Prospetto ${title}`, `<div class="dashboard-grid"><div class="stat-card"><div class="stat-info"><div class="stat-value">${formatCurrency(data.total_income)}</div><div class="stat-label">Entrate</div></div></div><div class="stat-card"><div class="stat-info"><div class="stat-value">${formatCurrency(data.total_expenses)}</div><div class="stat-label">Spese</div></div></div><div class="stat-card"><div class="stat-info"><div class="stat-value">${formatCurrency(data.margin)}</div><div class="stat-label">Margine</div></div></div></div><hr class="separator"><h4>Entrate</h4>${data.payments.length ? data.payments.map(p => `<div class="event-row"><i class="fas fa-arrow-trend-up text-success"></i><div><strong>${formatCurrency(p.importo)}</strong><small>${formatDate(p.data_pagamento)} · ${escapeHtml(p.numero_contratto || 'Senza contratto')} ${escapeHtml([p.cognome,p.nome].filter(Boolean).join(' '))}</small></div></div>`).join('') : '<p class="text-muted">Nessuna entrata.</p>'}<hr class="separator"><h4>Spese</h4>${data.expenses.length ? data.expenses.map(e => `<div class="event-row"><i class="fas fa-arrow-trend-down text-danger"></i><div><strong>${formatCurrency(e.importo)}</strong><small>${formatDate(e.data_spesa)} · ${escapeHtml(e.descrizione || e.tipo || '')}</small></div></div>`).join('') : '<p class="text-muted">Nessuna spesa.</p>'}<div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Chiudi</button></div>`);
        } catch (_) {}
    };

    window.openExpenseForm = async () => {
        try {
            const vehicles = await api.get('/vehicles');
            showModal('Registra spesa', `<form id="expense-form" class="form-grid">
                ${selectField('Veicolo','vehicle_id','',[['','— Spesa generale —'],...vehicles.map(v=>[v.id,`${v.targa} · ${v.marca || ''} ${v.modello || ''}`])])}${field('Data spesa','data_spesa',today(),'date','required')}${selectField('Categoria','tipo','manutenzione',[['manutenzione','Manutenzione'],['assicurazione','Assicurazione'],['bollo','Bollo'],['carburante','Carburante'],['lavaggio','Lavaggio'],['altro','Altro']])}${field('Importo (€)','importo','0','number','min="0" step="0.01" required')}${field('Descrizione','descrizione','')}${field('Fornitore / officina','officina','')}${textarea('Note','note','')}
                <div class="form-span-2 modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button><button type="submit" class="btn btn-danger">Registra spesa</button></div></form>`);
            document.getElementById('expense-form')?.addEventListener('submit', async e => { e.preventDefault(); try { await api.post('/finance/expenses',formDataToObject(e.currentTarget)); closeModal(); showToast('Spesa registrata'); await renderFinance(); } catch(_){} });
        } catch (_) {}
    };

    window.deletePayment = id => showConfirm('Eliminare questo pagamento?', async()=>{try{await api.delete(`/finance/payments/${id}`);showToast('Pagamento eliminato');await renderFinance();}catch(_){}});
    window.deleteExpense = id => showConfirm('Eliminare questa spesa?', async()=>{try{await api.delete(`/finance/expenses/${id}`);showToast('Spesa eliminata');await renderFinance();}catch(_){}});

    // ---------- Settings ----------
    async function renderSettings() {
        pageTitle().textContent = 'Impostazioni';
        try {
            const s = await api.get('/settings');
            appContent().innerHTML = `
                <div class="page-toolbar"><div><h2>Impostazioni</h2><p>Dati aziendali e parametri principali del noleggio.</p></div></div>
                <div class="card settings-card"><div class="card-header"><h3 class="card-title">Dati azienda</h3></div><div class="card-body"><form id="settings-form" class="form-grid">
                    ${field('Ragione sociale','company_name',s.company_name)}${field('Partita IVA','company_piva',s.company_piva)}${field('Codice fiscale','company_cf',s.company_cf)}${field('Telefono','company_phone',s.company_phone)}${field('Email','company_email',s.company_email,'email')}${field('Indirizzo','company_address',s.company_address)}${field('Sede / filiale predefinita','company_sede',s.company_sede)}${field('IVA (%)','iva_rate',s.iva_rate || 22,'number','min="0" step="0.01"')}${field('Kasko predefinita (€)','kasko_prezzo',s.kasko_prezzo || 20,'number','min="0" step="0.01"')}${field('Extra km predefinito (€)','extra_km_default',s.extra_km_default || 0.20,'number','min="0" step="0.01"')}
                    <div class="form-span-2 modal-actions"><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salva impostazioni</button></div></form></div></div>
                <div class="card mt-4"><div class="card-header"><h3 class="card-title">Backup ed esportazione</h3></div><div class="card-body action-grid"><button class="btn btn-secondary" onclick="downloadBackup()"><i class="fas fa-database"></i> Scarica backup database</button><button class="btn btn-secondary" onclick="downloadFinanceCsv()"><i class="fas fa-file-csv"></i> Esporta finanze CSV</button><button class="btn btn-secondary" onclick="downloadUploads()"><i class="fas fa-file-zipper"></i> Esporta allegati ZIP</button></div></div>`;
            document.getElementById('settings-form')?.addEventListener('submit', async e => { e.preventDefault(); try { const data=Object.fromEntries(new FormData(e.currentTarget).entries()); await api.put('/settings',data); showToast('Impostazioni salvate'); } catch(_){} });
        } catch (err) { handleRenderError(err, 'Impostazioni'); }
    }

    window.downloadBackup = () => { window.location.href = '/api/settings/backup'; };
    window.downloadFinanceCsv = () => { window.location.href = `/api/finance/export/csv?year=${new Date().getFullYear()}`; };
    window.downloadUploads = () => { window.location.href = `/api/settings/export/${new Date().getFullYear()}`; };

    // ---------- Router ----------
    const routes = {
        '/dashboard': renderDashboard,
        '/calendar': renderCalendar,
        '/vehicles': renderVehicles,
        '/customers': renderCustomers,
        '/rentals': renderRentals,
        '/maintenance': renderMaintenance,
        '/finance': renderFinance,
        '/settings': renderSettings
    };

    async function router() {
        const hash = window.location.hash.slice(1) || '/dashboard';
        const routePath = hash.split('?')[0];
        document.querySelectorAll('.sidebar-nav a').forEach(link => link.classList.toggle('active', link.dataset.route === routePath));
        const render = routes[routePath];
        if (!render) {
            pageTitle().textContent = 'Pagina non trovata';
            appContent().innerHTML = `<div class="card"><div class="card-body">${emptyState('fa-circle-question','Pagina non trovata','La sezione richiesta non esiste.')}</div></div>`;
            return;
        }
        await render();
    }

    window.addEventListener('hashchange', router);
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('modal-close')?.addEventListener('click', closeModal);
        document.getElementById('modal-container')?.addEventListener('click', e => { if (e.target.id === 'modal-container') closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
        if (!window.location.hash || window.location.hash === '#/') window.location.hash = '#/dashboard'; else router();
    });
})();
