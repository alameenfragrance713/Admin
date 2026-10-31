// ============================================================
// Admin Orders + Messages + Subscribers
// ============================================================
window.AdminOrders = (() => {
  let orders = [];
  let costMap = {};

  async function load() {
    const search = document.getElementById('ord-search').value.trim();
    const status = document.getElementById('ord-status-filter').value;
    const date = document.getElementById('ord-date-filter').value;

    let q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    if (search) {
      const safe = search.replace(/[%,]/g, '');
      q = q.or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }
    if (date) q = q.gte('created_at', date + 'T00:00:00').lte('created_at', date + 'T23:59:59');

    const { data, error } = await q;
    if (error) { AdminUI.toast('Load failed: ' + error.message, 'error'); return; }
    orders = data || [];

    if (orders.length) {
      const ids = orders.map(o => o.id);
      const { data: oi } = await sb.from('order_items').select('order_id, cost_total').in('order_id', ids);
      costMap = {};
      (oi || []).forEach(it => { costMap[it.order_id] = (costMap[it.order_id] || 0) + Number(it.cost_total || 0); });
    } else {
      costMap = {};
    }
    render();
  }

  function render() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="a-empty">No orders found.</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.map(o => {
      const profit = Number(o.subtotal || 0) - (costMap[o.id] || 0);
      return `
        <tr>
          <td><strong>${AdminUI.escape(o.order_number)}</strong></td>
          <td>${AdminUI.escape(o.customer_name)}</td>
          <td>${AdminUI.escape(o.phone)}</td>
          <td>${AdminUI.escape(o.city)}</td>
          <td>${AdminUI.fmtPrice(o.total)}</td>
          <td style="color:${profit >= 0 ? 'var(--a-green)' : 'var(--a-red)'};">${AdminUI.fmtPrice(profit)}</td>
          <td><span class="badge badge-${o.status}">${o.status}</span></td>
          <td>${AdminUI.fmtDate(o.created_at)}</td>
          <td class="actions"><button class="btn btn-ghost btn-sm" data-view="${o.id}">View</button></td>
        </tr>`;
    }).join('');
  }

  async function openDetail(id) {
    const { data: order, error } = await sb.from('orders').select('*').eq('id', id).single();
    if (error || !order) return AdminUI.toast('Order not found', 'error');
    const { data: items } = await sb.from('order_items').select('*').eq('order_id', id);
    const totalCost = (items || []).reduce((s, it) => s + Number(it.cost_total || 0), 0);
    const totalProfit = Number(order.subtotal || 0) - totalCost;

    const container = document.getElementById('order-detail-content');
    container.innerHTML = `
      <div class="order-detail-grid">
        <div class="order-info-block">
          <h4>Order</h4>
          <p><strong>Number:</strong> ${AdminUI.escape(order.order_number)}</p>
          <p><strong>Date:</strong> ${AdminUI.fmtDateTime(order.created_at)}</p>
          <p><strong>Status:</strong> <span class="badge badge-${order.status}">${order.status}</span></p>
          <p><strong>Payment:</strong> ${AdminUI.escape(order.payment_method || 'COD')}</p>
        </div>
        <div class="order-info-block">
          <h4>Customer</h4>
          <p><strong>Name:</strong> ${AdminUI.escape(order.customer_name)}</p>
          <p><strong>Phone:</strong> ${AdminUI.escape(order.phone)}</p>
          ${order.email ? `<p><strong>Email:</strong> ${AdminUI.escape(order.email)}</p>` : ''}
          <p><strong>Address:</strong> ${AdminUI.escape(order.address)}</p>
          <p><strong>City:</strong> ${AdminUI.escape(order.city)}${order.province ? ', ' + AdminUI.escape(order.province) : ''}</p>
          ${order.landmark ? `<p><strong>Landmark:</strong> ${AdminUI.escape(order.landmark)}</p>` : ''}
          ${order.notes ? `<p><strong>Notes:</strong> ${AdminUI.escape(order.notes)}</p>` : ''}
        </div>
      </div>
      <div class="panel">
        <h3>Items</h3>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Unit</th><th>Cost</th><th>Line Total</th><th>Profit</th></tr></thead>
            <tbody>
              ${(items || []).map(it => {
                const ip = Number(it.line_total || 0) - Number(it.cost_total || 0);
                return `<tr>
                  <td>${AdminUI.escape(it.product_name)}</td>
                  <td>${AdminUI.escape(it.variant_size || '—')}</td>
                  <td>${it.quantity}</td>
                  <td>${AdminUI.fmtPrice(it.unit_price)}</td>
                  <td style="color:var(--a-muted);">${AdminUI.fmtPrice(it.cost_price)}</td>
                  <td>${AdminUI.fmtPrice(it.line_total)}</td>
                  <td style="color:${ip >= 0 ? 'var(--a-green)' : 'var(--a-red)'};">${AdminUI.fmtPrice(ip)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="text-align:right;margin-top:14px;">
          <p>Subtotal: <strong>${AdminUI.fmtPrice(order.subtotal)}</strong></p>
          <p>Shipping: <strong>${AdminUI.fmtPrice(order.shipping)}</strong></p>
          <p>Total Cost: <strong style="color:var(--a-muted);">${AdminUI.fmtPrice(totalCost)}</strong></p>
          <p style="font-size:1.15rem;">Profit: <strong style="color:${totalProfit >= 0 ? 'var(--a-green)' : 'var(--a-red)'};">${AdminUI.fmtPrice(totalProfit)}</strong></p>
          <p style="font-size:1.15rem;color:var(--a-gold);">Customer Total: <strong>${AdminUI.fmtPrice(order.total)}</strong></p>
        </div>
      </div>
      <div class="panel">
        <h3>Update</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Status</label>
            <select class="form-control" id="order-status-select">
              ${['pending','confirmed','shipped','delivered','cancelled'].map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Admin Note</label>
            <input class="form-control" id="order-note-input" value="${AdminUI.escape(order.admin_note || '')}">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn btn-gold" id="order-save-btn">Save</button>
          <button class="btn btn-ghost" id="order-print-btn">Print Invoice</button>
          <a class="btn btn-ghost" id="order-wa-btn" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn btn-danger" id="order-del-btn">Delete</button>
        </div>
      </div>
    `;

    const waNum = (order.phone || '').replace(/[^0-9]/g, '');
    const waMsg = `Assalam o Alaikum ${order.customer_name}, order ${order.order_number} (Rs. ${Number(order.total).toLocaleString('en-PK')}) - status: ${order.status}.`;
    document.getElementById('order-wa-btn').href = `https://wa.me/${waNum.startsWith('92') ? waNum : '92' + waNum.replace(/^0/, '')}?text=${encodeURIComponent(waMsg)}`;

    document.getElementById('order-save-btn').onclick = async () => {
      const s = document.getElementById('order-status-select').value;
      const n = document.getElementById('order-note-input').value.trim();
      const { error } = await sb.from('orders').update({ status: s, admin_note: n }).eq('id', order.id);
      if (error) return AdminUI.toast('Save failed', 'error');
      AdminUI.toast('Order updated', 'success');
      AdminUI.closeModal('order-modal');
      load();
    };
    document.getElementById('order-del-btn').onclick = async () => {
      if (!confirm('Delete this order?')) return;
      await sb.from('order_items').delete().eq('order_id', order.id);
      const { error } = await sb.from('orders').delete().eq('id', order.id);
      if (error) return AdminUI.toast('Delete failed', 'error');
      AdminUI.toast('Deleted', 'success');
      AdminUI.closeModal('order-modal');
      load();
    };
    document.getElementById('order-print-btn').onclick = () => printInvoice(order, items || []);

    AdminUI.openModal('order-modal');
  }

  function printInvoice(order, items) {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return AdminUI.toast('Popup blocked', 'error');
    const html = `<!DOCTYPE html><html><head><title>Invoice ${order.order_number}</title>
      <style>body{font-family:Georgia,serif;padding:30px;color:#111}h1{margin:0;color:#b8923a}.head{display:flex;justify-content:space-between;border-bottom:2px solid #d4af37;padding-bottom:14px;margin-bottom:22px}table{width:100%;border-collapse:collapse;margin-bottom:18px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:.9rem}th{background:#f7f7f5}.totals{text-align:right}.grand{font-size:1.2rem;color:#b8923a;font-weight:bold}</style>
      </head><body>
      <div class="head"><div><h1>AL AMEEN</h1></div><div style="text-align:right;"><p>Invoice: ${order.order_number}</p><p>${AdminUI.fmtDateTime(order.created_at)}</p></div></div>
      <p><strong>Bill To:</strong> ${order.customer_name} · ${order.phone} · ${order.address}, ${order.city}</p>
      <table><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${items.map(it => `<tr><td>${it.product_name}</td><td>${it.variant_size || '-'}</td><td>${it.quantity}</td><td>Rs. ${Number(it.unit_price).toLocaleString('en-PK')}</td><td>Rs. ${Number(it.line_total).toLocaleString('en-PK')}</td></tr>`).join('')}
      </tbody></table>
      <div class="totals"><p>Subtotal: Rs. ${Number(order.subtotal).toLocaleString('en-PK')}</p><p>Shipping: Rs. ${Number(order.shipping).toLocaleString('en-PK')}</p><p class="grand">Total: Rs. ${Number(order.total).toLocaleString('en-PK')}</p></div>
      </body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  function exportCsv() {
    if (!orders.length) return AdminUI.toast('No orders', 'error');
    const headers = ['Order #','Date','Customer','Phone','City','Subtotal','Shipping','Total','Profit','Status'];
    const rows = orders.map(o => {
      const profit = Number(o.subtotal || 0) - (costMap[o.id] || 0);
      return [o.order_number, o.created_at, o.customer_name, o.phone, o.city, o.subtotal, o.shipping, o.total, profit, o.status];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
  }

  async function init() {
    await load();
    document.getElementById('ord-search').oninput = debounce(() => load(), 300);
    document.getElementById('ord-status-filter').onchange = load;
    document.getElementById('ord-date-filter').onchange = load;
    document.getElementById('ord-export').onclick = exportCsv;
    document.getElementById('orders-tbody').onclick = (e) => {
      const v = e.target.closest('[data-view]');
      if (v) openDetail(v.dataset.view);
    };
  }

  function debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }

  return { init, load, reload: load };
})();

window.AdminMessages = {
  async load() {
    const { data } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200);
    const tbody = document.getElementById('messages-tbody');
    if (!tbody) return;
    if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="6" class="a-empty">No messages.</td></tr>`; return; }
    tbody.innerHTML = data.map(m => `
      <tr style="${m.is_read ? '' : 'background:rgba(212,175,55,.05);'}">
        <td>${AdminUI.fmtDateTime(m.created_at)}</td>
        <td>${AdminUI.escape(m.name)}</td>
        <td>${AdminUI.escape(m.email || '')}${m.phone ? `<br><small>${AdminUI.escape(m.phone)}</small>` : ''}</td>
        <td>${AdminUI.escape(m.subject || '—')}</td>
        <td style="max-width:340px;">${AdminUI.escape(m.message)}</td>
        <td class="actions">${m.is_read ? '' : `<button class="btn btn-ghost btn-sm" data-read="${m.id}">Mark Read</button>`}<button class="btn btn-danger btn-sm" data-mdel="${m.id}">Delete</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => { await sb.from('messages').update({ is_read: true }).eq('id', b.dataset.read); AdminMessages.load(); });
    tbody.querySelectorAll('[data-mdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete?')) return; await sb.from('messages').delete().eq('id', b.dataset.mdel); AdminMessages.load(); });
  }
};

window.AdminSubscribers = {
  async load() {
    const { data } = await sb.from('subscribers').select('*').order('created_at', { ascending: false }).limit(500);
    const tbody = document.getElementById('subs-tbody');
    if (!tbody) return;
    if (!data || !data.length) { tbody.innerHTML = `<tr><td colspan="3" class="a-empty">No subscribers.</td></tr>`; return; }
    tbody.innerHTML = data.map(s => `
      <tr><td>${AdminUI.escape(s.email)}</td><td>${AdminUI.fmtDate(s.created_at)}</td><td><button class="btn btn-danger btn-sm" data-sdel="${s.id}">Delete</button></td></tr>
    `).join('');
    tbody.querySelectorAll('[data-sdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete?')) return; await sb.from('subscribers').delete().eq('id', b.dataset.sdel); AdminSubscribers.load(); });
    document.getElementById('subs-export').onclick = () => {
      const csv = ['email,subscribed_at', ...data.map(s => `"${s.email}","${s.created_at}"`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'subscribers.csv';
      link.click();
    };
  }
};