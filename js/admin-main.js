// ============================================================
// Admin Main — UI helpers + shell + boot
// ============================================================
window.AdminUI = {
  toast(msg, type = 'info', timeout = 2800) {
    const wrap = document.getElementById('admin-toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'admin-toast ' + type;
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 300);
    }, timeout);
  },
  escape(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  fmtPrice(n) { return 'Rs. ' + Number(n || 0).toLocaleString('en-PK'); },
  fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; },
  fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; },
  openModal(id) { document.getElementById(id)?.classList.add('is-open'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('is-open'); }
};

const SECTION_TITLES = {
  dashboard: ['Dashboard', 'Overview of your store'],
  banners: ['Banners', 'Manage homepage hero slider'],
  categories: ['Categories', 'Control what appears on the website'],
  products: ['Products', 'Manage your catalog'],
  orders: ['Orders', 'Review and manage customer orders'],
  messages: ['Messages', 'Contact form submissions'],
  subscribers: ['Subscribers', 'Newsletter subscribers'],
  settings: ['Settings', 'Store-wide configuration']
};

window.showSection = function (name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('is-active'));
  const sectionEl = document.getElementById('section-' + name);
  if (sectionEl) sectionEl.classList.add('is-active');

  document.querySelectorAll('.sidebar-nav button').forEach(b => {
    b.classList.toggle('is-active', b.dataset.section === name);
  });
  const [title, sub] = SECTION_TITLES[name] || ['', ''];
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;

  document.getElementById('admin-sidebar')?.classList.remove('is-open');

  const initMap = {
    dashboard: () => window.AdminDashboard?.load(),
    banners: () => window.AdminBanners?.init(),
    categories: () => window.AdminCategories?.init(),
    products: () => window.AdminProducts?.init(),
    orders: () => window.AdminOrders?.init(),
    messages: () => window.AdminMessages?.load?.(),
    subscribers: () => window.AdminSubscribers?.load?.(),
    settings: () => window.AdminSettings?.init()
  };
  if (initMap[name]) {
    try { initMap[name](); } catch (e) { console.error('[showSection]', name, e); }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[Boot] Starting dashboard boot...');
    if (!window.sb) {
      console.error('[Boot] sb missing');
      return;
    }

    const user = await AdminAuth.requireAdmin();
    if (!user) {
      console.warn('[Boot] Not authenticated');
      return;
    }
    console.log('[Boot] Authenticated as', user.email);

    const emailEl = document.getElementById('admin-email');
    const userLabelEl = document.getElementById('user-label');
    const userAvatarEl = document.getElementById('user-avatar');
    if (emailEl) emailEl.textContent = user.email;
    if (userLabelEl) userLabelEl.textContent = user.email.split('@')[0];
    if (userAvatarEl) userAvatarEl.textContent = (user.email[0] || 'A').toUpperCase();

    document.querySelectorAll('.sidebar-nav button').forEach(b => {
      b.addEventListener('click', () => showSection(b.dataset.section));
    });
    document.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => showSection(b.dataset.goto));
    });
    document.getElementById('logout-btn')?.addEventListener('click', () => AdminAuth.logout());
    document.getElementById('admin-menu-toggle')?.addEventListener('click', () => {
      document.getElementById('admin-sidebar')?.classList.toggle('is-open');
    });

    document.querySelectorAll('[data-close-modal]').forEach(b => {
      b.addEventListener('click', () => AdminUI.closeModal(b.dataset.closeModal));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('is-open'); });
    });

    showSection('dashboard');
    console.log('[Boot] Dashboard booted');
  } catch (e) {
    console.error('[Boot] FATAL:', e);
    const grid = document.getElementById('stats-grid');
    if (grid) {
      grid.innerHTML = `<div class="stat-card" style="grid-column:1/-1;border-color:var(--a-red);">
        <div class="label">Boot error</div>
        <div class="value" style="font-size:1rem;color:var(--a-red);">${e.message || 'Unknown'}</div>
        <div style="font-size:.78rem;color:var(--a-muted);margin-top:8px;">Check console.</div>
      </div>`;
    }
  }
});

// Realtime
(function initRealtime() {
  if (!window.sb) return;
  let ch = null;
  function start() {
    if (ch) return;
    try {
      ch = window.sb.channel('admin-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const o = payload.new;
          AdminUI.toast(`🔔 New order ${o.order_number} — ${o.customer_name}`, 'success', 6000);
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o1 = ctx.createOscillator();
            const g = ctx.createGain();
            o1.frequency.value = 880; g.gain.value = 0.06;
            o1.connect(g); g.connect(ctx.destination); o1.start();
            setTimeout(() => { o1.frequency.value = 1320; }, 140);
            setTimeout(() => { o1.stop(); ctx.close(); }, 320);
          } catch (e) {}
          if (document.getElementById('section-dashboard')?.classList.contains('is-active')) window.AdminDashboard?.load();
          if (document.getElementById('section-orders')?.classList.contains('is-active')) window.AdminOrders?.reload();
        })
        .subscribe();
    } catch (e) { console.warn('[Realtime] fail:', e); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (window.AdminAuth?.requireAdmin) {
      AdminAuth.requireAdmin().then(u => { if (u) start(); }).catch(() => {});
    }
  });
})();