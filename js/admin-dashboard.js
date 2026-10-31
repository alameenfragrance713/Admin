// ============================================================
// Admin Dashboard — error-safe, never stuck on loading
// ============================================================
window.AdminDashboard = {
  currentRange: 'month',
  allOrders: [],
  allOrderItems: [],

  getDateRange() {
    const now = new Date();
    const start = new Date();
    switch (this.currentRange) {
      case 'today': start.setHours(0, 0, 0, 0); return { start, end: now };
      case 'week': start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); return { start, end: now };
      case 'month': start.setDate(1); start.setHours(0, 0, 0, 0); return { start, end: now };
      default: return { start: null, end: now };
    }
  },

  async load() {
    const grid = document.getElementById('stats-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="stat-card skeleton" style="height:96px;"></div>
      <div class="stat-card skeleton" style="height:96px;"></div>
      <div class="stat-card skeleton" style="height:96px;"></div>
      <div class="stat-card skeleton" style="height:96px;"></div>
    `;

    if (!window.sb) {
      grid.innerHTML = `<div class="stat-card" style="grid-column:1/-1;">
        <div class="label">Supabase not loaded</div>
        <div class="value" style="font-size:1rem;color:var(--a-red);">Check config.js</div>
      </div>`;
      return;
    }

    try {
      const ordersRes = await window.sb.from('orders').select('*').order('created_at', { ascending: false });
      if (ordersRes.error) throw new Error('Orders: ' + ordersRes.error.message);

      const itemsRes = await window.sb.from('order_items').select('*');
      if (itemsRes.error) throw new Error('Order items: ' + itemsRes.error.message);

      this.allOrders = ordersRes.data || [];
      this.allOrderItems = itemsRes.data || [];
      console.log('[Dashboard] Loaded', this.allOrders.length, 'orders,', this.allOrderItems.length, 'items');
      this.renderAll();
    } catch (e) {
      console.error('[Dashboard]', e);
      grid.innerHTML = `<div class="stat-card" style="grid-column:1/-1;border-color:var(--a-red);">
        <div class="label">Dashboard load fail</div>
        <div class="value" style="font-size:1rem;color:var(--a-red);">${e.message}</div>
        <div style="font-size:.78rem;color:var(--a-muted);margin-top:8px;">Missing columns? Run supabase.sql.</div>
      </div>`;
      const lb = document.getElementById('latest-orders-body');
      if (lb) lb.innerHTML = `<tr><td colspan="7" class="a-empty" style="color:var(--a-red);">Failed to load</td></tr>`;
    }
  },

  renderAll() {
    const grid = document.getElementById('stats-grid');
    if (!grid) return;

    const { start, end } = this.getDateRange();
    const filtered = this.allOrders.filter(o => {
      if (!start) return true;
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
    const valid = filtered.filter(o => o.status !== 'cancelled');
    const ids = new Set(valid.map(o => o.id));
    const itemsRange = this.allOrderItems.filter(it => ids.has(it.order_id));

    const revenue = valid.reduce((s, o) => s + Number(o.total || 0), 0);
    const subtotal = valid.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const cost = itemsRange.reduce((s, it) => s + Number(it.cost_total || 0), 0);
    const profit = subtotal - cost;
    const pending = filtered.filter(o => o.status === 'pending').length;
    const margin = subtotal > 0 ? ((profit / subtotal) * 100).toFixed(1) : 0;
    const rangeLabel = { today: 'Today', week: 'Last 7 Days', month: 'This Month', all: 'All Time' }[this.currentRange] || '';

    grid.innerHTML = `
      <div class="stat-card"><div class="label">Total Orders</div><div class="value">${valid.length}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">${rangeLabel}</div></div>
      <div class="stat-card ${pending ? 'warn' : ''}"><div class="label">Pending</div><div class="value">${pending}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">${rangeLabel}</div></div>
      <div class="stat-card"><div class="label">Gross Revenue</div><div class="value" style="font-size:1.35rem;">${AdminUI.fmtPrice(revenue)}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">Incl. shipping</div></div>
      <div class="stat-card"><div class="label">Product Revenue</div><div class="value" style="font-size:1.35rem;">${AdminUI.fmtPrice(subtotal)}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">Excl. shipping</div></div>
      <div class="stat-card"><div class="label">Total Cost</div><div class="value" style="font-size:1.35rem;">${AdminUI.fmtPrice(cost)}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">Your purchase</div></div>
      <div class="stat-card" style="border-color:var(--a-green);"><div class="label">Net Profit</div><div class="value" style="font-size:1.35rem;color:${profit >= 0 ? 'var(--a-green)' : 'var(--a-red)'};">${AdminUI.fmtPrice(profit)}</div><div style="font-size:.72rem;color:var(--a-muted);margin-top:4px;">Margin: ${margin}%</div></div>
    `;

    let rangeBar = document.getElementById('dashboard-range-bar');
    if (!rangeBar) {
      rangeBar = document.createElement('div');
      rangeBar.id = 'dashboard-range-bar';
      rangeBar.style.cssText = 'display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap;';
      grid.after(rangeBar);
    }
    rangeBar.innerHTML = `
      <button class="btn ${this.currentRange === 'today' ? 'btn-gold' : 'btn-ghost'}" data-range="today">Today</button>
      <button class="btn ${this.currentRange === 'week' ? 'btn-gold' : 'btn-ghost'}" data-range="week">Last 7 Days</button>
      <button class="btn ${this.currentRange === 'month' ? 'btn-gold' : 'btn-ghost'}" data-range="month">This Month</button>
      <button class="btn ${this.currentRange === 'all' ? 'btn-gold' : 'btn-ghost'}" data-range="all">All Time</button>
    `;
    rangeBar.querySelectorAll('[data-range]').forEach(btn => {
      btn.onclick = () => { this.currentRange = btn.dataset.range; this.renderAll(); };
    });

    const cbars = document.getElementById('chart-bars');
    const clabels = document.getElementById('chart-labels');
    if (cbars && clabels) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        days.push(d);
      }
      const buckets = days.map(d => {
        const key = d.toISOString().slice(0, 10);
        const dayOrders = valid.filter(o => (o.created_at || '').slice(0, 10) === key);
        const daySub = dayOrders.reduce((s, o) => s + Number(o.subtotal || 0), 0);
        const dayIds = new Set(dayOrders.map(o => o.id));
        const dayCost = this.allOrderItems.filter(it => dayIds.has(it.order_id))
          .reduce((s, it) => s + Number(it.cost_total || 0), 0);
        return { label: d.toLocaleDateString('en-PK', { weekday: 'short' }), revenue: daySub, profit: daySub - dayCost };
      });
      const max = Math.max(1, ...buckets.map(b => b.revenue));
      cbars.innerHTML = buckets.map(b => `
        <div class="chart-bar" style="height:${(b.revenue / max) * 100}%;position:relative;" title="Revenue: ${AdminUI.fmtPrice(b.revenue)} | Profit: ${AdminUI.fmtPrice(b.profit)}">
          <span style="font-size:.62rem;">${b.revenue > 0 ? AdminUI.fmtPrice(b.revenue) : ''}</span>
        </div>
      `).join('');
      clabels.innerHTML = buckets.map(b => `<span>${b.label}</span>`).join('');
    }

    const lb = document.getElementById('latest-orders-body');
    if (lb) {
      const recent = valid.slice(0, 10);
      if (!recent.length) {
        lb.innerHTML = `<tr><td colspan="7" class="a-empty">No orders in this period.</td></tr>`;
      } else {
        lb.innerHTML = recent.map(o => {
          const items = this.allOrderItems.filter(it => it.order_id === o.id);
          const oc = items.reduce((s, it) => s + Number(it.cost_total || 0), 0);
          const op = Number(o.subtotal || 0) - oc;
          return `
            <tr>
              <td><strong>${AdminUI.escape(o.order_number)}</strong></td>
              <td>${AdminUI.escape(o.customer_name)}</td>
              <td>${AdminUI.escape(o.phone)}</td>
              <td>${AdminUI.fmtPrice(o.total)}</td>
              <td style="color:${op >= 0 ? 'var(--a-green)' : 'var(--a-red)'};">${AdminUI.fmtPrice(op)}</td>
              <td><span class="badge badge-${o.status}">${o.status}</span></td>
              <td>${AdminUI.fmtDate(o.created_at)}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }
};