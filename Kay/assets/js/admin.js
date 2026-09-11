/**
 * KAY — Admin Panel Logic (admin.js)
 *
 * SEGURIDAD:
 * - Las credenciales del admin se autentican contra Supabase Auth (nunca en este archivo).
 * - El ANON KEY es una "publishable key" segura de exponer (solo permite operaciones
 *   que las políticas RLS permiten a usuarios anónimos).
 * - El SERVICE_ROLE KEY nunca toca el frontend.
 * - Las funciones RPC en Supabase usan SECURITY DEFINER para verificar auth.uid()
 *   antes de ejecutar cualquier acción sobre el stock.
 */

// ── Configuración de Supabase (igual que script.js — son claves públicas) ──
const SUPABASE_URL = 'https://tzsbxnlygxuzjmxafvez.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vr1hMYlWgzT2lkpfLzT3cg_zOqTNeQb';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Estado de la App ──
let allOrders = [];
let currentFilter = 'todos';
let currentSearch = '';
let editingOrder = null;   // Pedido actualmente en edición
let cancelingCode = null;   // Código del pedido a cancelar

// ── Helpers de UI ──
function showToast(msg, type = 'success') {
    const t = document.getElementById('adminToast');
    t.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
    t.className = `admin-toast toast-${type} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatProducts(productos) {
    if (!productos || !Array.isArray(productos)) return '—';
    return productos.map(p => `${p.qty}× ${p.name}`).join(', ');
}

function badgeHTML(estado) {
    const icons = { pendiente: '⏳', confirmado: '✅', cancelado: '❌', modificado: '✏️' };
    return `<span class="badge badge-${estado}">${icons[estado] || ''} ${estado}</span>`;
}

// ── Modales ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('closeDetailModal').addEventListener('click', () => closeModal('detailModal'));
document.getElementById('closeEditModal').addEventListener('click', () => closeModal('editModal'));
document.getElementById('closeCancelModal').addEventListener('click', () => closeModal('cancelModal'));

// Cerrar modal al hacer clic fuera
['detailModal', 'editModal', 'cancelModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(id);
    });
});

// ══════════════════════════════════════════════════════════
// AUTH — Login / Logout
// ══════════════════════════════════════════════════════════
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const btn = document.getElementById('loginBtn');
    const errDiv = document.getElementById('loginError');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando...';
    errDiv.style.display = 'none';

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        errDiv.textContent = '❌ ' + (error.message === 'Invalid login credentials'
            ? 'Correo o contraseña incorrectos.'
            : error.message);
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Iniciar sesión';
        return;
    }

    // Login exitoso
    showAdminPanel(data.user.email);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('loginBtn').textContent = 'Iniciar sesión';
    document.getElementById('loginBtn').disabled = false;
    allOrders = [];
});

// Verificar sesión activa al cargar la página
sb.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        showAdminPanel(session.user.email);
    }
});

function showAdminPanel(email) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminUserEmail').textContent = email;
    loadOrders();
    loadAuditLog();

    // Suscripción en tiempo real a nuevos pedidos
    sb.channel('pedidos-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
            loadOrders();
            loadAuditLog();
        })
        .subscribe();
}

// ══════════════════════════════════════════════════════════
// CARGAR PEDIDOS
// ══════════════════════════════════════════════════════════
async function loadOrders() {
    const { data, error } = await sb
        .from('pedidos')
        .select('id, order_code, cliente_nombre, cliente_telefono, productos, total, estado, created_at, confirmed_at, notas')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error al cargar pedidos:', error);
        showToast('Error al cargar los pedidos.', 'error');
        return;
    }

    allOrders = data || [];
    updateStats();
    renderOrders();
}

function updateStats() {
    const count = (estado) => allOrders.filter(o => o.estado === estado).length;
    document.getElementById('statPendiente').textContent = count('pendiente');
    document.getElementById('statModificado').textContent = count('modificado');
    document.getElementById('statConfirmado').textContent = count('confirmado');
    document.getElementById('statCancelado').textContent = count('cancelado');
}

function renderOrders() {
    const body = document.getElementById('ordersBody');
    let filtered = allOrders;

    // Filtro por estado
    if (currentFilter !== 'todos') {
        filtered = filtered.filter(o => o.estado === currentFilter);
    }

    // Filtro por búsqueda
    if (currentSearch) {
        const q = currentSearch.toLowerCase();
        filtered = filtered.filter(o =>
            o.order_code.toLowerCase().includes(q) ||
            o.cliente_nombre.toLowerCase().includes(q) ||
            o.cliente_telefono.includes(q)
        );
    }

    if (filtered.length === 0) {
        body.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div>No hay pedidos en este estado.</div>
                </div>
            </td></tr>`;
        return;
    }

    body.innerHTML = filtered.map(o => {
        const isActive = o.estado === 'pendiente' || o.estado === 'modificado';
        const isPending = o.estado !== 'confirmado' && o.estado !== 'cancelado';
        return `
        <tr data-id="${o.id}">
            <td><span class="order-code">${o.order_code}</span></td>
            <td>${escapeHTML(o.cliente_nombre)}</td>
            <td>${escapeHTML(o.cliente_telefono)}</td>
            <td style="max-width:240px;font-size:12px;color:var(--text-muted);">${formatProducts(o.productos)}</td>
            <td style="font-weight:600;color:var(--verde);">€ ${Number(o.total || 0).toFixed(2)}</td>
            <td style="font-size:12px;color:var(--text-muted);">${formatDate(o.created_at)}</td>
            <td>${badgeHTML(o.estado)}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-action btn-detail"   onclick="openDetail('${o.order_code}')">👁 Ver</button>
                    ${isActive ? `<button class="btn-action btn-confirm"  onclick="confirmOrder('${o.order_code}', this)">✅ Confirmar</button>` : ''}
                    ${isPending ? `<button class="btn-action btn-edit"    onclick="openEdit('${o.order_code}')">✏️ Editar</button>` : ''}
                    ${isPending ? `<button class="btn-action btn-cancel"  onclick="openCancel('${o.order_code}')">❌ Cancelar</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ── Filtros ──
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderOrders();
    });
});

// ── Búsqueda ──
document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderOrders();
});

// ══════════════════════════════════════════════════════════
// CONFIRMAR PEDIDO
// ══════════════════════════════════════════════════════════
async function confirmOrder(orderCode, btnEl) {
    if (!confirm(`¿Confirmar el pago del pedido ${orderCode}?\n\nEsto restará el stock definitivamente de la base de datos.`)) return;

    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner"></span>';

    const { data, error } = await sb.rpc('confirm_order', { p_order_code: orderCode });

    if (error || (data && data.success === false)) {
        showToast((data && data.message) || error?.message || 'Error al confirmar.', 'error');
        btnEl.disabled = false;
        btnEl.innerHTML = '✅ Confirmar';
        return;
    }

    showToast(`Pedido ${orderCode} confirmado. Stock actualizado.`, 'success');
    loadOrders();
    loadAuditLog();
}

// ══════════════════════════════════════════════════════════
// VER DETALLE
// ══════════════════════════════════════════════════════════
function openDetail(orderCode) {
    const o = allOrders.find(x => x.order_code === orderCode);
    if (!o) return;

    document.getElementById('detailCode').textContent = orderCode;

    const productos = Array.isArray(o.productos)
        ? o.productos.map(p => `
            <div class="modal-info-row">
                <span class="label">${escapeHTML(p.name)}</span>
                <span>${p.qty} unidad${p.qty > 1 ? 'es' : ''}</span>
            </div>`).join('')
        : '<p style="color:var(--text-muted)">Sin datos</p>';

    document.getElementById('detailContent').innerHTML = `
        <div class="modal-info-row"><span class="label">Cliente</span>    <span>${escapeHTML(o.cliente_nombre)}</span></div>
        <div class="modal-info-row"><span class="label">Teléfono</span>   <span>${escapeHTML(o.cliente_telefono)}</span></div>
        <div class="modal-info-row"><span class="label">Estado</span>     ${badgeHTML(o.estado)}</div>
        <div class="modal-info-row"><span class="label">Total</span>      <span style="color:var(--verde);font-weight:700;">€ ${Number(o.total || 0).toFixed(2)}</span></div>
        <div class="modal-info-row"><span class="label">Creado</span>     <span>${formatDate(o.created_at)}</span></div>
        ${o.confirmed_at ? `<div class="modal-info-row"><span class="label">Confirmado</span><span>${formatDate(o.confirmed_at)}</span></div>` : ''}
        ${o.notas ? `<div class="modal-info-row"><span class="label">Notas</span><span>${escapeHTML(o.notas)}</span></div>` : ''}
        <div style="margin-top:16px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Productos</div>
        ${productos}
    `;

    openModal('detailModal');
}

// ══════════════════════════════════════════════════════════
// EDITAR PEDIDO
// ══════════════════════════════════════════════════════════
function openEdit(orderCode) {
    editingOrder = allOrders.find(x => x.order_code === orderCode);
    if (!editingOrder) return;

    document.getElementById('editCode').textContent = orderCode;
    document.getElementById('editNotes').value = editingOrder.notas || '';

    const container = document.getElementById('editProductsContainer');
    container.innerHTML = Array.isArray(editingOrder.productos)
        ? editingOrder.productos.map(p => `
            <div class="product-edit-row" data-product="${escapeHTML(p.name)}">
                <span style="font-size:14px;">${escapeHTML(p.name)}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:12px;color:var(--text-muted);">Cant:</span>
                    <input class="qty-input edit-qty" type="number" min="0" max="99"
                           value="${p.qty}" data-product="${escapeHTML(p.name)}">
                </div>
            </div>`).join('')
        : '<p style="color:var(--text-muted)">Sin productos</p>';

    openModal('editModal');
}

document.getElementById('saveEditBtn').addEventListener('click', async () => {
    if (!editingOrder) return;

    const newItems = [];
    document.querySelectorAll('.edit-qty').forEach(input => {
        const qty = parseInt(input.value) || 0;
        if (qty > 0) {
            newItems.push({ name: input.dataset.product, qty });
        }
    });

    if (newItems.length === 0) {
        showToast('El pedido no puede quedar sin productos. Cancélalo en su lugar.', 'error');
        return;
    }

    const notas = document.getElementById('editNotes').value.trim();
    const saveBtn = document.getElementById('saveEditBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Guardando...';

    const { data, error } = await sb.rpc('edit_order', {
        p_order_code: editingOrder.order_code,
        p_new_items: newItems,
        p_notas: notas
    });

    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar cambios';

    if (error || (data && data.success === false)) {
        showToast((data && data.message) || error?.message || 'Error al editar.', 'error');
        return;
    }

    showToast(`Pedido ${editingOrder.order_code} actualizado. Nuevo total: € ${Number(data.nuevo_total || 0).toFixed(2)}`, 'success');
    closeModal('editModal');
    editingOrder = null;
    loadOrders();
    loadAuditLog();
});

// ══════════════════════════════════════════════════════════
// CANCELAR PEDIDO
// ══════════════════════════════════════════════════════════
function openCancel(orderCode) {
    cancelingCode = orderCode;
    document.getElementById('cancelCode').textContent = orderCode;
    document.getElementById('cancelMotivo').value = '';
    openModal('cancelModal');
}

document.getElementById('confirmCancelBtn').addEventListener('click', async () => {
    if (!cancelingCode) return;

    const motivo = document.getElementById('cancelMotivo').value.trim();
    const cancelBtn = document.getElementById('confirmCancelBtn');
    cancelBtn.disabled = true;
    cancelBtn.innerHTML = '<span class="spinner"></span> Cancelando...';

    const { data, error } = await sb.rpc('cancel_order', {
        p_order_code: cancelingCode,
        p_motivo: motivo
    });

    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Confirmar cancelación';

    if (error || (data && data.success === false)) {
        showToast((data && data.message) || error?.message || 'Error al cancelar.', 'error');
        return;
    }

    showToast(`Pedido ${cancelingCode} cancelado.`, 'success');
    closeModal('cancelModal');
    cancelingCode = null;
    loadOrders();
    loadAuditLog();
});

// ══════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════
async function loadAuditLog() {
    const { data, error } = await sb
        .from('audit_log')
        .select('id, order_code, accion, usuario, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) return;

    const list = document.getElementById('auditList');

    if (!data || data.length === 0) {
        list.innerHTML = '<div class="audit-item" style="color:var(--text-muted);">Sin acciones registradas aún.</div>';
        return;
    }

    list.innerHTML = data.map(log => `
        <div class="audit-item">
            <div class="audit-dot audit-dot-${log.accion}"></div>
            <span class="audit-code">${escapeHTML(log.order_code)}</span>
            <span style="color:var(--text-muted);">→</span>
            <span>${log.accion}</span>
            ${log.usuario ? `<span style="font-size:12px;color:var(--text-muted);">por ${escapeHTML(log.usuario)}</span>` : ''}
            <span class="audit-time">${formatDate(log.created_at)}</span>
        </div>
    `).join('');
}

// ── Sanitización básica contra XSS ──
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
