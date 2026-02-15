// ============================================================
// ArtVault — Main Application
// Mithril.js SPA with IndexedDB persistence
// All UI text in Bahasa Indonesia
// ============================================================

// ==================== IndexedDB Layer ====================
const DB_NAME = 'ArtVaultDB';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('paintings')) {
                const ps = db.createObjectStore('paintings', { keyPath: 'id', autoIncrement: true });
                ps.createIndex('projectId', 'projectId', { unique: false });
                ps.createIndex('status', 'status', { unique: false });
                ps.createIndex('theme', 'theme', { unique: false });
            }
            if (!db.objectStoreNames.contains('projects')) {
                const pj = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                pj.createIndex('name', 'name', { unique: false });
            }
        };
        req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
        req.onerror = (e) => reject(e.target.error);
    });
}

async function dbAdd(store, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        const req = s.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbPut(store, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGet(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAll(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function dbGetByIndex(store, indexName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const idx = tx.objectStore(store).index(indexName);
        const req = idx.getAll(value);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// ==================== Helpers ====================
function formatCurrency(n) {
    return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusClass(s) {
    const map = { 'Available': 'available', 'Booked': 'booked', 'Sold': 'sold', 'Under Contract': 'contract' };
    return map[s] || 'available';
}

function statusLabel(s) {
    const map = { 'Available': 'Tersedia', 'Booked': 'Dipesan', 'Sold': 'Terjual', 'Under Contract': 'Kontrak' };
    return map[s] || s;
}

const STATUSES = ['Available', 'Booked', 'Sold', 'Under Contract'];
const THEMES = ['Pemandangan', 'Abstrak', 'Potret', 'Alam Benda', 'Modern', 'Klasik', 'Lainnya'];

// ==================== Theme Management ====================
const THEME_KEY = 'artvault_theme';
let currentTheme = localStorage.getItem(THEME_KEY) || 'dark';

function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem(THEME_KEY, currentTheme);
    m.redraw();
}

// ==================== Toast ====================
let toastMsg = null, toastType = 'success', toastTimer = null;
function showToast(msg, type = 'success') {
    toastMsg = msg; toastType = type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMsg = null; m.redraw(); }, 3000);
    m.redraw();
}

const Toast = { view: () => toastMsg ? m('.toast', { class: toastType }, toastMsg) : null };

// ==================== Confirm Dialog ====================
let confirmState = null;
function showConfirm(title, text) {
    return new Promise((resolve) => {
        confirmState = { title, text, resolve };
        m.redraw();
    });
}

const ConfirmDialog = {
    view: () => {
        if (!confirmState) return null;
        const { title, text, resolve } = confirmState;
        const close = (val) => { confirmState = null; resolve(val); m.redraw(); };
        return m('.modal-backdrop', { onclick: () => close(false) },
            m('.modal-content', { onclick: (e) => e.stopPropagation() }, [
                m('.modal-title', title),
                m('.modal-text', text),
                m('.modal-actions', [
                    m('button.btn.btn-secondary.btn-sm', { onclick: () => close(false) }, 'Batal'),
                    m('button.btn.btn-danger.btn-sm', { onclick: () => close(true) }, 'Hapus'),
                ])
            ])
        );
    }
};

// ==================== PIN Lock ====================
const PIN_KEY = 'artvault_pin';
let pinUnlocked = false, pinInput = '', pinMode = 'check', pinError = false, pinConfirm = '';

function checkPinExists() { return !!localStorage.getItem(PIN_KEY); }
function verifyPin(p) { return localStorage.getItem(PIN_KEY) === p; }
function savePin(p) { localStorage.setItem(PIN_KEY, p); }

const PinLock = {
    oninit: () => {
        pinInput = ''; pinError = false; pinConfirm = '';
        pinMode = checkPinExists() ? 'check' : 'create';
    },
    view: () => {
        if (pinUnlocked) return null;
        const subtitle = pinMode === 'create'
            ? (pinConfirm ? 'Konfirmasi PIN Anda' : 'Buat PIN 4 digit')
            : 'Masukkan PIN Anda';

        const handleKey = (num) => {
            if (pinInput.length >= 4) return;
            pinInput += num;
            pinError = false;
            if (pinInput.length === 4) {
                setTimeout(() => {
                    if (pinMode === 'create') {
                        if (!pinConfirm) {
                            pinConfirm = pinInput; pinInput = '';
                        } else if (pinInput === pinConfirm) {
                            savePin(pinInput); pinUnlocked = true; showToast('PIN berhasil dibuat!');
                        } else {
                            pinError = true; pinInput = ''; pinConfirm = '';
                            setTimeout(() => { pinError = false; m.redraw(); }, 1000);
                        }
                    } else {
                        if (verifyPin(pinInput)) { pinUnlocked = true; showToast('Selamat datang!'); }
                        else { pinError = true; pinInput = ''; setTimeout(() => { pinError = false; m.redraw(); }, 1000); }
                    }
                    m.redraw();
                }, 200);
            }
        };

        const handleBack = () => { pinInput = pinInput.slice(0, -1); };

        return m('.pin-overlay', [
            m('.pin-logo', '🎨'),
            m('.pin-title', 'ArtVault - Koko_Kotagede'),
            m('.pin-subtitle', subtitle),
            m('.pin-dots', [0, 1, 2, 3].map(i =>
                m('.pin-dot', { class: (pinError ? 'error' : '') + (i < pinInput.length ? ' filled' : '') })
            )),
            m('.pin-keypad', [
                ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
                    m('button.pin-key', { onclick: () => handleKey(String(n)) }, n)
                ),
                m('button.pin-key.empty'),
                m('button.pin-key', { onclick: () => handleKey('0') }, '0'),
                m('button.pin-key.backspace', { onclick: handleBack }, '⌫'),
            ])
        ]);
    }
};

// ==================== Camera Module ====================
let cameraStream = null, cameraActive = false, cameraCallback = null;

const CameraModal = {
    view: () => {
        if (!cameraActive) return null;
        return m('.camera-modal', [
            m('.camera-preview', [
                m('video', {
                    autoplay: true,
                    playsinline: true,
                    oncreate: (vnode) => {
                        const video = vnode.dom;
                        navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
                        })
                            .then(stream => { cameraStream = stream; video.srcObject = stream; video.play(); })
                            .catch(err => { showToast('Gagal mengakses kamera: ' + err.message, 'error'); closeCamera(); });
                    }
                }),
                m('canvas', { style: { display: 'none' } })
            ]),
            m('.camera-controls', [
                m('button.camera-close', { onclick: closeCamera }, '✕'),
                m('button.camera-shutter', { onclick: capturePhoto }),
                m('button.camera-flip', { onclick: () => { } }, '🔄'),
            ])
        ]);
    }
};

function openCamera(callback) { cameraActive = true; cameraCallback = callback; m.redraw(); }

function closeCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    cameraActive = false; m.redraw();
}

function capturePhoto() {
    const video = document.querySelector('.camera-modal video');
    const canvas = document.querySelector('.camera-modal canvas');
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    if (cameraCallback) cameraCallback(base64);
    closeCamera();
}

// ==================== Layout ====================
const navItems = [
    { route: '/', icon: '🏠', label: 'Beranda' },
    { route: '/projects', icon: '📁', label: 'Proyek' },
    { route: '/add', icon: '➕', label: 'Tambah', isAdd: true },
    { route: '/search', icon: '🔍', label: 'Cari' },
    { route: '/settings', icon: '⚙️', label: 'Lainnya' },
];

const Layout = {
    view: (vnode) => {
        const currentRoute = m.route.get() || '/';
        return m('#app', [
            m('.app-header', [
                m('.header-title', ['🎨 ', m('span', 'ArtVault - Koko_Kotagede')]),
                m('.header-actions', [
                    m('button.header-btn', {
                        onclick: toggleTheme,
                        title: currentTheme === 'dark' ? 'Mode Terang' : 'Mode Gelap'
                    }, currentTheme === 'dark' ? '☀️' : '🌙'),
                ])
            ]),
            m('.main-content', vnode.children),
            m('.bottom-nav', navItems.map(item =>
                m('button.nav-item', {
                    class: (item.isAdd ? 'nav-add' : '') + (currentRoute === item.route ? ' active' : ''),
                    onclick: () => m.route.set(item.route),
                }, [
                    item.isAdd
                        ? m('.nav-icon', '➕')
                        : m('.nav-icon', item.icon),
                    m('span', item.label)
                ])
            )),
            m(Toast),
            m(ConfirmDialog),
            m(CameraModal),
            m(PinLock),
        ]);
    }
};

// ==================== Dashboard ====================
const Dashboard = {
    paintings: [], projects: [], loading: true,
    oninit: async function () {
        this.loading = true;
        try {
            this.paintings = await dbGetAll('paintings');
            this.projects = await dbGetAll('projects');
        } catch (e) { console.error(e); }
        this.loading = false; m.redraw();
    },
    view: function () {
        if (this.loading) return m(Layout, m('.loading', m('.spinner')));
        const total = this.paintings.length;
        const sold = this.paintings.filter(p => p.status === 'Sold');
        const soldValue = sold.reduce((s, p) => s + (p.price || 0), 0);
        const booked = this.paintings.filter(p => p.status === 'Booked').length;
        const activeProjects = this.projects.length;
        const recent = [...this.paintings].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate)).slice(0, 10);

        return m(Layout, [
            m('.stats-grid', [
                m('.stat-card', [m('.stat-value', total), m('.stat-label', 'Total Lukisan'), m('.stat-icon', '🖼️')]),
                m('.stat-card.projects', [m('.stat-value', activeProjects), m('.stat-label', 'Proyek Aktif'), m('.stat-icon', '📁')]),
                m('.stat-card.sold', [m('.stat-value', formatCurrency(soldValue)), m('.stat-label', 'Nilai Terjual'), m('.stat-icon', '💰')]),
                m('.stat-card.booked', [m('.stat-value', booked), m('.stat-label', 'Dipesan'), m('.stat-icon', '📋')]),
            ]),
            m('.section-header', [
                m('.section-title', 'Lukisan Terbaru'),
                total > 0 ? m('button.section-link', { onclick: () => m.route.set('/search') }, 'Lihat Semua →') : null,
            ]),
            recent.length === 0
                ? m('.empty-state', [m('.empty-icon', '🎨'), m('.empty-title', 'Belum ada lukisan'), m('.empty-text', 'Tap tombol + untuk menambahkan lukisan pertama Anda')])
                : m('.painting-grid', recent.map(p =>
                    m('a.painting-card', { onclick: () => m.route.set('/painting/' + p.id) }, [
                        p.photoPaths && p.photoPaths[0]
                            ? m('img.painting-thumb', { src: p.photoPaths[0], alt: p.title, loading: 'lazy' })
                            : m('.painting-thumb-placeholder', '🖼️'),
                        m('.painting-info', [
                            m('.painting-title', p.title),
                            m('.painting-meta', [
                                m('.painting-price', formatCurrency(p.price)),
                                m('span.status-badge', { class: statusClass(p.status) }, statusLabel(p.status)),
                            ])
                        ])
                    ])
                )),
        ]);
    }
};

// ==================== Painting Form ====================
const PaintingForm = {
    painting: null, projects: [], errors: {}, isEdit: false,
    oninit: async function (vnode) {
        this.projects = await dbGetAll('projects');
        this.errors = {};
        if (vnode.attrs.id) {
            this.isEdit = true;
            this.painting = await dbGet('paintings', Number(vnode.attrs.id));
            if (!this.painting) { m.route.set('/'); return; }
        } else {
            this.isEdit = false;
            this.painting = { title: '', description: '', theme: '', dimensions: '', medium: '', price: 0, status: 'Available', photoPaths: [], creationDate: new Date().toISOString(), projectId: null, location: '' };
        }
        m.redraw();
    },
    validate: function () {
        this.errors = {};
        if (!this.painting.title.trim()) this.errors.title = 'Judul wajib diisi';
        if (!this.painting.photoPaths || this.painting.photoPaths.length === 0) this.errors.photos = 'Minimal satu foto diperlukan';
        return Object.keys(this.errors).length === 0;
    },
    save: async function () {
        if (!this.validate()) return;
        try {
            if (this.isEdit) { await dbPut('paintings', this.painting); showToast('Lukisan berhasil diperbarui!'); }
            else { const id = await dbAdd('paintings', this.painting); showToast('Lukisan berhasil ditambahkan!'); }
            m.route.set('/');
        } catch (e) { showToast('Gagal menyimpan: ' + e.message, 'error'); }
    },
    addPhoto: function (base64) {
        if (!this.painting.photoPaths) this.painting.photoPaths = [];
        this.painting.photoPaths.push(base64);
        delete this.errors.photos;
        m.redraw();
    },
    removePhoto: function (idx) { this.painting.photoPaths.splice(idx, 1); m.redraw(); },
    handleFileInput: function (e) {
        const files = e.target.files;
        for (let f of files) {
            const reader = new FileReader();
            reader.onload = (ev) => { this.addPhoto(ev.target.result); };
            reader.readAsDataURL(f);
        }
    },
    view: function () {
        if (!this.painting) return m(Layout, m('.loading', m('.spinner')));
        const p = this.painting;
        return m(Layout, [
            m('.detail-header', [
                m('button.back-btn', { onclick: () => history.back() }, '←'),
                m('.detail-title', this.isEdit ? 'Edit Lukisan' : 'Tambah Lukisan'),
            ]),
            // Photo section
            m('.photo-section', [
                m('.form-label.form-required', 'Foto Lukisan'),
                m('.photo-grid', [
                    ...(p.photoPaths || []).map((ph, i) =>
                        m('.photo-item', [m('img', { src: ph, loading: 'lazy' }), m('button.photo-remove', { onclick: () => this.removePhoto(i) }, '✕')])
                    ),
                    m('button.camera-btn', { onclick: () => openCamera((b64) => this.addPhoto(b64)) }, [m('.camera-icon', '📷'), 'Kamera']),
                    m('label.camera-btn', [m('.camera-icon', '📁'), 'Galeri', m('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => this.handleFileInput(e) })]),
                ]),
                this.errors.photos ? m('.form-error', this.errors.photos) : null,
            ]),
            // Form fields
            m('.form-group', [
                m('label.form-label.form-required', 'Judul'),
                m('input.form-input', { value: p.title, oninput: (e) => { p.title = e.target.value; delete this.errors.title; }, placeholder: 'Judul lukisan' }),
                this.errors.title ? m('.form-error', this.errors.title) : null,
            ]),
            m('.form-group', [
                m('label.form-label', 'Deskripsi'),
                m('textarea.form-textarea', { value: p.description, oninput: (e) => { p.description = e.target.value; }, placeholder: 'Deskripsi lukisan...' }),
            ]),
            m('.form-row', [
                m('.form-group', [
                    m('label.form-label', 'Tema'),
                    m('select.form-select', { value: p.theme, onchange: (e) => { p.theme = e.target.value; } },
                        [m('option', { value: '' }, '-- Pilih Tema --'), ...THEMES.map(t => m('option', { value: t }, t))]
                    ),
                ]),
                m('.form-group', [
                    m('label.form-label', 'Dimensi'),
                    m('input.form-input', { value: p.dimensions, oninput: (e) => { p.dimensions = e.target.value; }, placeholder: 'cth: 24x36 cm' }),
                ]),
            ]),
            m('.form-row', [
                m('.form-group', [
                    m('label.form-label', 'Medium'),
                    m('input.form-input', { value: p.medium, oninput: (e) => { p.medium = e.target.value; }, placeholder: 'cth: Cat minyak' }),
                ]),
                m('.form-group', [
                    m('label.form-label', 'Harga'),
                    m('input.form-input', { type: 'number', value: p.price, oninput: (e) => { p.price = Number(e.target.value); }, placeholder: '0' }),
                ]),
            ]),
            m('.form-row', [
                m('.form-group', [
                    m('label.form-label', 'Status'),
                    m('select.form-select', { value: p.status, onchange: (e) => { p.status = e.target.value; } },
                        STATUSES.map(s => m('option', { value: s }, statusLabel(s)))
                    ),
                ]),
                m('.form-group', [
                    m('label.form-label', 'Lokasi'),
                    m('input.form-input', { value: p.location, oninput: (e) => { p.location = e.target.value; }, placeholder: 'cth: Kamar 101' }),
                ]),
            ]),
            m('.form-group', [
                m('label.form-label', 'Proyek'),
                m('select.form-select', { value: p.projectId || '', onchange: (e) => { p.projectId = e.target.value ? Number(e.target.value) : null; } },
                    [m('option', { value: '' }, '-- Tidak ada proyek --'), ...this.projects.map(pr => m('option', { value: pr.id }, pr.name))]
                ),
            ]),
            m('.btn-group', { style: 'margin-top:24px' }, [
                m('button.btn.btn-primary.btn-block', { onclick: () => this.save() }, this.isEdit ? '💾 Simpan Perubahan' : '💾 Simpan Lukisan'),
            ]),
        ]);
    }
};

// ==================== Painting Detail ====================
const PaintingDetail = {
    painting: null, project: null, carouselIdx: 0, loading: true,
    oninit: async function (vnode) {
        this.loading = true; this.carouselIdx = 0;
        this.painting = await dbGet('paintings', Number(vnode.attrs.id));
        if (this.painting && this.painting.projectId) this.project = await dbGet('projects', this.painting.projectId);
        this.loading = false; m.redraw();
    },
    deletePainting: async function () {
        const ok = await showConfirm('Hapus Lukisan?', 'Lukisan "' + this.painting.title + '" akan dihapus secara permanen.');
        if (ok) { await dbDelete('paintings', this.painting.id); showToast('Lukisan berhasil dihapus'); m.route.set('/'); }
    },
    view: function () {
        if (this.loading) return m(Layout, m('.loading', m('.spinner')));
        if (!this.painting) return m(Layout, m('.empty-state', [m('.empty-icon', '❌'), m('.empty-title', 'Lukisan tidak ditemukan')]));
        const p = this.painting;
        const photos = p.photoPaths || [];
        return m(Layout, [
            m('.detail-header', [
                m('button.back-btn', { onclick: () => history.back() }, '←'),
                m('.detail-title', p.title),
                m('span.status-badge', { class: statusClass(p.status), style: 'margin-left:auto' }, statusLabel(p.status)),
            ]),
            photos.length > 0 ? m('.carousel', [
                m('img', { src: photos[this.carouselIdx], alt: p.title }),
                photos.length > 1 ? [
                    m('button.carousel-nav.prev', { onclick: () => { this.carouselIdx = (this.carouselIdx - 1 + photos.length) % photos.length; } }, '‹'),
                    m('button.carousel-nav.next', { onclick: () => { this.carouselIdx = (this.carouselIdx + 1) % photos.length; } }, '›'),
                    m('.carousel-dots', photos.map((_, i) => m('button.carousel-dot', { class: i === this.carouselIdx ? 'active' : '', onclick: () => { this.carouselIdx = i; } }))),
                ] : null,
            ]) : null,
            m('.detail-meta', [
                p.price ? m('.meta-item', [m('.meta-label', 'Harga'), m('.meta-value', formatCurrency(p.price))]) : null,
                p.dimensions ? m('.meta-item', [m('.meta-label', 'Dimensi'), m('.meta-value', p.dimensions)]) : null,
                p.medium ? m('.meta-item', [m('.meta-label', 'Medium'), m('.meta-value', p.medium)]) : null,
                p.theme ? m('.meta-item', [m('.meta-label', 'Tema'), m('.meta-value', p.theme)]) : null,
                p.location ? m('.meta-item', [m('.meta-label', 'Lokasi'), m('.meta-value', p.location)]) : null,
                this.project ? m('.meta-item', [m('.meta-label', 'Proyek'), m('.meta-value', this.project.name)]) : null,
                m('.meta-item', [m('.meta-label', 'Tanggal'), m('.meta-value', formatDate(p.creationDate))]),
            ]),
            p.description ? m('.report-card', [m('.report-title', 'Deskripsi'), m('p', { style: 'font-size:0.85rem;color:var(--text-secondary);line-height:1.6' }, p.description)]) : null,
            m('.btn-group', { style: 'margin-top:24px' }, [
                m('button.btn.btn-primary', { onclick: () => m.route.set('/edit/' + p.id) }, '✏️ Edit'),
                m('button.btn.btn-danger', { onclick: () => this.deletePainting() }, '🗑️ Hapus'),
            ]),
        ]);
    }
};

// ==================== Project List ====================
const ProjectList = {
    projects: [], paintings: [], loading: true,
    oninit: async function () {
        this.loading = true;
        this.projects = await dbGetAll('projects');
        this.paintings = await dbGetAll('paintings');
        this.loading = false; m.redraw();
    },
    view: function () {
        if (this.loading) return m(Layout, m('.loading', m('.spinner')));
        return m(Layout, [
            m('.section-header', [
                m('.section-title', 'Proyek'),
                m('button.btn.btn-primary.btn-sm', { onclick: () => m.route.set('/project/new') }, '+ Proyek Baru'),
            ]),
            this.projects.length === 0
                ? m('.empty-state', [m('.empty-icon', '📁'), m('.empty-title', 'Belum ada proyek'), m('.empty-text', 'Buat proyek untuk mengorganisir lukisan berdasarkan komisaris')])
                : this.projects.map(pr => {
                    const assigned = this.paintings.filter(p => p.projectId === pr.id).length;
                    const pct = pr.totalNeeded > 0 ? Math.round((assigned / pr.totalNeeded) * 100) : 0;
                    const daysLeft = pr.deadline ? Math.ceil((new Date(pr.deadline) - new Date()) / 86400000) : null;
                    return m('.project-card', { onclick: () => m.route.set('/project/' + pr.id) }, [
                        m('.project-name', pr.name),
                        m('.project-client', pr.client || 'Tanpa klien'),
                        m('.progress-bar', m('.progress-fill', { style: { width: Math.min(pct, 100) + '%' } })),
                        m('.progress-text', assigned + '/' + (pr.totalNeeded || '?') + ' lukisan (' + pct + '%)'),
                        daysLeft !== null ? m('.project-deadline', { class: daysLeft <= 3 ? 'deadline-danger' : daysLeft <= 7 ? 'deadline-warning' : '' },
                            '📅 ' + (daysLeft < 0 ? 'Lewat ' + Math.abs(daysLeft) + ' hari' : daysLeft + ' hari tersisa') + ' — ' + formatDate(pr.deadline)
                        ) : null,
                    ]);
                }),
        ]);
    }
};

// ==================== Project Form ====================
const ProjectForm = {
    project: null, isEdit: false,
    oninit: async function (vnode) {
        if (vnode.attrs.id && vnode.attrs.id !== 'new') {
            this.isEdit = true;
            this.project = await dbGet('projects', Number(vnode.attrs.id));
        } else {
            this.isEdit = false;
            this.project = { name: '', client: '', totalNeeded: 0, deadline: '', notes: '' };
        }
        m.redraw();
    },
    save: async function () {
        if (!this.project.name.trim()) { showToast('Nama proyek wajib diisi', 'error'); return; }
        try {
            if (this.isEdit) { await dbPut('projects', this.project); showToast('Proyek berhasil diperbarui!'); }
            else { await dbAdd('projects', this.project); showToast('Proyek berhasil ditambahkan!'); }
            m.route.set('/projects');
        } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
    },
    view: function () {
        if (!this.project) return m(Layout, m('.loading', m('.spinner')));
        const p = this.project;
        return m(Layout, [
            m('.detail-header', [
                m('button.back-btn', { onclick: () => history.back() }, '←'),
                m('.detail-title', this.isEdit ? 'Edit Proyek' : 'Proyek Baru'),
            ]),
            m('.form-group', [m('label.form-label.form-required', 'Nama Proyek'), m('input.form-input', { value: p.name, oninput: (e) => { p.name = e.target.value; }, placeholder: 'cth: Hotel Bintang 5' })]),
            m('.form-group', [m('label.form-label', 'Klien'), m('input.form-input', { value: p.client, oninput: (e) => { p.client = e.target.value; }, placeholder: 'Nama klien' })]),
            m('.form-row', [
                m('.form-group', [m('label.form-label', 'Jumlah Dibutuhkan'), m('input.form-input', { type: 'number', value: p.totalNeeded, oninput: (e) => { p.totalNeeded = Number(e.target.value); } })]),
                m('.form-group', [m('label.form-label', 'Deadline'), m('input.form-input', { type: 'date', value: p.deadline ? p.deadline.split('T')[0] : '', oninput: (e) => { p.deadline = e.target.value; } })]),
            ]),
            m('.form-group', [m('label.form-label', 'Catatan'), m('textarea.form-textarea', { value: p.notes, oninput: (e) => { p.notes = e.target.value; }, placeholder: 'Catatan tambahan...' })]),
            m('button.btn.btn-primary.btn-block', { style: 'margin-top:24px', onclick: () => this.save() }, '💾 Simpan Proyek'),
        ]);
    }
};

// ==================== Project Detail ====================
const ProjectDetail = {
    project: null, paintings: [], loading: true,
    oninit: async function (vnode) {
        this.loading = true;
        this.project = await dbGet('projects', Number(vnode.attrs.id));
        if (this.project) this.paintings = await dbGetByIndex('paintings', 'projectId', this.project.id);
        this.loading = false; m.redraw();
    },
    deleteProject: async function () {
        const ok = await showConfirm('Hapus Proyek?', 'Proyek "' + this.project.name + '" akan dihapus. Lukisan terkait tidak akan dihapus.');
        if (ok) { await dbDelete('projects', this.project.id); showToast('Proyek berhasil dihapus'); m.route.set('/projects'); }
    },
    view: function () {
        if (this.loading) return m(Layout, m('.loading', m('.spinner')));
        if (!this.project) return m(Layout, m('.empty-state', [m('.empty-icon', '❌'), m('.empty-title', 'Proyek tidak ditemukan')]));
        const pr = this.project;
        const assigned = this.paintings.length;
        const pct = pr.totalNeeded > 0 ? Math.round((assigned / pr.totalNeeded) * 100) : 0;
        return m(Layout, [
            m('.detail-header', [
                m('button.back-btn', { onclick: () => m.route.set('/projects') }, '←'),
                m('.detail-title', pr.name),
            ]),
            m('.detail-meta', [
                m('.meta-item', [m('.meta-label', 'Klien'), m('.meta-value', pr.client || '-')]),
                m('.meta-item', [m('.meta-label', 'Progres'), m('.meta-value', assigned + '/' + (pr.totalNeeded || '?'))]),
                m('.meta-item', [m('.meta-label', 'Deadline'), m('.meta-value', formatDate(pr.deadline))]),
            ]),
            m('.progress-bar', { style: 'margin-bottom:16px' }, m('.progress-fill', { style: { width: Math.min(pct, 100) + '%' } })),
            pr.notes ? m('.report-card', [m('.report-title', 'Catatan'), m('p', { style: 'font-size:0.85rem;color:var(--text-secondary)' }, pr.notes)]) : null,
            m('.section-header', { style: 'margin-top:24px' }, [m('.section-title', 'Lukisan Terkait (' + assigned + ')')]),
            this.paintings.length === 0
                ? m('.empty-state', [m('.empty-icon', '🖼️'), m('.empty-text', 'Belum ada lukisan di proyek ini')])
                : m('.painting-grid', this.paintings.map(p =>
                    m('a.painting-card', { onclick: () => m.route.set('/painting/' + p.id) }, [
                        p.photoPaths && p.photoPaths[0] ? m('img.painting-thumb', { src: p.photoPaths[0], loading: 'lazy' }) : m('.painting-thumb-placeholder', '🖼️'),
                        m('.painting-info', [m('.painting-title', p.title), m('.painting-meta', [m('.painting-price', formatCurrency(p.price)), m('span.status-badge', { class: statusClass(p.status) }, statusLabel(p.status))])])
                    ])
                )),
            m('.btn-group', { style: 'margin-top:24px' }, [
                m('button.btn.btn-primary', { onclick: () => m.route.set('/project/edit/' + pr.id) }, '✏️ Edit'),
                m('button.btn.btn-danger', { onclick: () => this.deleteProject() }, '🗑️ Hapus'),
            ]),
        ]);
    }
};

// ==================== Search ====================
const SearchView = {
    query: '', statusFilter: '', themeFilter: '', projectFilter: '',
    paintings: [], projects: [], results: [], searched: false,
    oninit: async function () {
        this.paintings = await dbGetAll('paintings');
        this.projects = await dbGetAll('projects');
        this.results = this.paintings;
        m.redraw();
    },
    doSearch: function () {
        this.searched = true;
        const q = this.query.toLowerCase();
        this.results = this.paintings.filter(p => {
            if (q && !p.title.toLowerCase().includes(q) && !(p.theme || '').toLowerCase().includes(q) && !(p.location || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false;
            if (this.statusFilter && p.status !== this.statusFilter) return false;
            if (this.themeFilter && p.theme !== this.themeFilter) return false;
            if (this.projectFilter && p.projectId !== Number(this.projectFilter)) return false;
            return true;
        });
    },
    view: function () {
        return m(Layout, [
            m('.section-title', { style: 'margin-bottom:16px' }, 'Cari Lukisan'),
            m('.search-container', [
                m('.search-input-wrapper', [
                    m('.search-icon', '🔍'),
                    m('input.search-input', { value: this.query, oninput: (e) => { this.query = e.target.value; this.doSearch(); }, placeholder: 'Cari judul, tema, lokasi...' }),
                ]),
                m('.filter-row', [
                    m('select.filter-select', { value: this.statusFilter, onchange: (e) => { this.statusFilter = e.target.value; this.doSearch(); } },
                        [m('option', { value: '' }, 'Semua Status'), ...STATUSES.map(s => m('option', { value: s }, statusLabel(s)))]
                    ),
                    m('select.filter-select', { value: this.themeFilter, onchange: (e) => { this.themeFilter = e.target.value; this.doSearch(); } },
                        [m('option', { value: '' }, 'Semua Tema'), ...THEMES.map(t => m('option', { value: t }, t))]
                    ),
                    m('select.filter-select', { value: this.projectFilter, onchange: (e) => { this.projectFilter = e.target.value; this.doSearch(); } },
                        [m('option', { value: '' }, 'Semua Proyek'), ...this.projects.map(pr => m('option', { value: pr.id }, pr.name))]
                    ),
                ]),
            ]),
            m('p', { style: 'font-size:0.8rem;color:var(--text-muted);margin-bottom:16px' }, this.results.length + ' lukisan ditemukan'),
            this.results.length === 0
                ? m('.empty-state', [m('.empty-icon', '🔍'), m('.empty-title', 'Tidak ada hasil'), m('.empty-text', 'Coba ubah kata kunci atau filter')])
                : m('.painting-grid', this.results.map(p =>
                    m('a.painting-card', { onclick: () => m.route.set('/painting/' + p.id) }, [
                        p.photoPaths && p.photoPaths[0] ? m('img.painting-thumb', { src: p.photoPaths[0], loading: 'lazy' }) : m('.painting-thumb-placeholder', '🖼️'),
                        m('.painting-info', [m('.painting-title', p.title), m('.painting-meta', [m('.painting-price', formatCurrency(p.price)), m('span.status-badge', { class: statusClass(p.status) }, statusLabel(p.status))])])
                    ])
                )),
        ]);
    }
};

// ==================== Settings / Utilities ====================
const SettingsView = {
    view: function () {
        return m(Layout, [
            m('.section-title', { style: 'margin-bottom:16px' }, 'Pengaturan & Utilitas'),
            // Theme Toggle
            m('.settings-item', { onclick: toggleTheme }, [
                m('.settings-icon', currentTheme === 'dark' ? '☀️' : '🌙'),
                m('.settings-text', [
                    m('h3', 'Mode ' + (currentTheme === 'dark' ? 'Terang' : 'Gelap')),
                    m('p', 'Ubah tampilan aplikasi ke mode ' + (currentTheme === 'dark' ? 'terang' : 'gelap'))
                ])
            ]),
            // Report
            m('.settings-item', { onclick: () => m.route.set('/report') }, [
                m('.settings-icon', '📊'), m('.settings-text', [m('h3', 'Laporan'), m('p', 'Lihat laporan per proyek dan nilai penjualan')])
            ]),
            // Backup
            m('.settings-item', { onclick: () => backupAll() }, [
                m('.settings-icon', '💾'), m('.settings-text', [m('h3', 'Cadangkan Data'), m('p', 'Export semua data sebagai file JSON')])
            ]),
            // Import
            m('.settings-item', [
                m('label', { style: 'display:flex;align-items:center;gap:16px;cursor:pointer;width:100%' }, [
                    m('.settings-icon', '📥'), m('.settings-text', [m('h3', 'Pulihkan Data'), m('p', 'Import data dari file cadangan JSON')]),
                    m('input', { type: 'file', accept: '.json', style: 'display:none', onchange: (e) => importBackup(e.target.files[0]) }),
                ])
            ]),
            // Notifications
            m('.settings-item', { onclick: requestNotifPermission }, [
                m('.settings-icon', '🔔'), m('.settings-text', [m('h3', 'Notifikasi'), m('p', 'Aktifkan pengingat deadline proyek')])
            ]),
            // Reset PIN
            m('.settings-item', { onclick: resetPin }, [
                m('.settings-icon', '🔒'), m('.settings-text', [m('h3', 'Ubah PIN'), m('p', 'Reset dan buat PIN baru')])
            ]),
        ]);
    }
};

// ==================== Report ====================
const ReportView = {
    projects: [], paintings: [], loading: true,
    oninit: async function () {
        this.loading = true;
        this.projects = await dbGetAll('projects');
        this.paintings = await dbGetAll('paintings');
        this.loading = false; m.redraw();
    },
    exportCSV: function () {
        const header = 'ID,Judul,Tema,Dimensi,Medium,Harga,Status,Lokasi,Proyek,Tanggal\n';
        const rows = this.paintings.map(p => {
            const proj = this.projects.find(pr => pr.id === p.projectId);
            return [p.id, '"' + (p.title || '') + '"', p.theme, p.dimensions, p.medium, p.price, p.status, p.location, proj ? '"' + proj.name + '"' : '', p.creationDate].join(',');
        }).join('\n');
        downloadBlob(header + rows, 'artvault-lukisan.csv', 'text/csv');
        showToast('CSV berhasil diunduh!');
    },
    exportJSON: function () {
        downloadBlob(JSON.stringify(this.paintings, null, 2), 'artvault-lukisan.json', 'application/json');
        showToast('JSON berhasil diunduh!');
    },
    view: function () {
        if (this.loading) return m(Layout, m('.loading', m('.spinner')));
        const totalSold = this.paintings.filter(p => p.status === 'Sold').reduce((s, p) => s + (p.price || 0), 0);
        const totalAll = this.paintings.reduce((s, p) => s + (p.price || 0), 0);
        return m(Layout, [
            m('.detail-header', [
                m('button.back-btn', { onclick: () => history.back() }, '←'),
                m('.detail-title', 'Laporan'),
            ]),
            // Summary
            m('.report-card', [
                m('.report-title', 'Ringkasan Keseluruhan'),
                m('.report-stat', [m('.report-stat-label', 'Total Lukisan'), m('.report-stat-value', this.paintings.length)]),
                m('.report-stat', [m('.report-stat-label', 'Terjual'), m('.report-stat-value', this.paintings.filter(p => p.status === 'Sold').length)]),
                m('.report-stat', [m('.report-stat-label', 'Nilai Terjual'), m('.report-stat-value', formatCurrency(totalSold))]),
                m('.report-stat', [m('.report-stat-label', 'Total Nilai Inventaris'), m('.report-stat-value', formatCurrency(totalAll))]),
            ]),
            // Per project
            ...this.projects.map(pr => {
                const pp = this.paintings.filter(p => p.projectId === pr.id);
                const soldVal = pp.filter(p => p.status === 'Sold').reduce((s, p) => s + (p.price || 0), 0);
                return m('.report-card', [
                    m('.report-title', pr.name),
                    m('.report-stat', [m('.report-stat-label', 'Klien'), m('.report-stat-value', pr.client || '-')]),
                    m('.report-stat', [m('.report-stat-label', 'Lukisan Terkait'), m('.report-stat-value', pp.length + '/' + (pr.totalNeeded || '?'))]),
                    m('.report-stat', [m('.report-stat-label', 'Nilai Terjual'), m('.report-stat-value', formatCurrency(soldVal))]),
                    m('.report-stat', [m('.report-stat-label', 'Deadline'), m('.report-stat-value', formatDate(pr.deadline))]),
                ]);
            }),
            m('.btn-group', { style: 'margin-top:24px' }, [
                m('button.btn.btn-secondary', { onclick: () => this.exportCSV() }, '📄 Export CSV'),
                m('button.btn.btn-secondary', { onclick: () => this.exportJSON() }, '📋 Export JSON'),
            ]),
        ]);
    }
};

// ==================== Utility Functions ====================
function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

async function backupAll() {
    try {
        const paintings = await dbGetAll('paintings');
        const projects = await dbGetAll('projects');
        const data = { version: 1, exportDate: new Date().toISOString(), paintings, projects };
        downloadBlob(JSON.stringify(data, null, 2), 'artvault-backup-' + new Date().toISOString().split('T')[0] + '.json', 'application/json');
        showToast('Cadangan berhasil diunduh!');
    } catch (e) { showToast('Gagal membuat cadangan: ' + e.message, 'error'); }
}

async function importBackup(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.paintings || !data.projects) throw new Error('Format file tidak valid');
        const ok = await showConfirm('Pulihkan Data?', 'Data saat ini akan ditimpa dengan data dari cadangan. ' + data.paintings.length + ' lukisan dan ' + data.projects.length + ' proyek akan diimpor.');
        if (!ok) return;
        // Clear existing and import
        const db = await openDB();
        const tx = db.transaction(['paintings', 'projects'], 'readwrite');
        tx.objectStore('paintings').clear();
        tx.objectStore('projects').clear();
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
        for (const pr of data.projects) await dbAdd('projects', pr);
        for (const p of data.paintings) await dbAdd('paintings', p);
        showToast('Data berhasil dipulihkan! ' + data.paintings.length + ' lukisan diimpor.');
        m.route.set('/');
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function requestNotifPermission() {
    if (!('Notification' in window)) { showToast('Browser tidak mendukung notifikasi', 'error'); return; }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') { showToast('Notifikasi diaktifkan!'); checkDeadlines(); }
        else showToast('Izin notifikasi ditolak', 'error');
    });
}

async function checkDeadlines() {
    if (Notification.permission !== 'granted') return;
    const projects = await dbGetAll('projects');
    const now = new Date();
    projects.forEach(pr => {
        if (!pr.deadline) return;
        const days = Math.ceil((new Date(pr.deadline) - now) / 86400000);
        if (days >= 0 && days <= 3) {
            new Notification('⏰ Deadline Mendekati!', {
                body: pr.name + ' — ' + (days === 0 ? 'Hari ini!' : days + ' hari lagi'),
                icon: '🎨',
            });
        }
    });
}

function resetPin() {
    localStorage.removeItem(PIN_KEY);
    pinUnlocked = false; pinInput = ''; pinMode = 'create'; pinConfirm = '';
    showToast('PIN direset. Buat PIN baru.');
    m.redraw();
}

// ==================== Routing ====================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await openDB();
    // Check deadlines on load
    if ('Notification' in window && Notification.permission === 'granted') checkDeadlines();

    m.route(document.getElementById('app'), '/', {
        '/': Dashboard,
        '/add': PaintingForm,
        '/edit/:id': PaintingForm,
        '/painting/:id': PaintingDetail,
        '/projects': ProjectList,
        '/project/new': ProjectForm,
        '/project/edit/:id': ProjectForm,
        '/project/:id': ProjectDetail,
        '/search': SearchView,
        '/settings': SettingsView,
        '/report': ReportView,
    });
});
