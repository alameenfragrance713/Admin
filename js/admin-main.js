// ============================================================
// Admin Main — UI helpers + shell + boot + NEW broadcast/backup
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
  closeModal(id) { document.getElementById(id)?.classList.remove('is-open'); },
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); return true; }
      catch { return false; }
      finally { document.body.removeChild(ta); }
    }
  }
};

const SECTION_TITLES = {
  dashboard:   ['Dashboard', 'Overview of your store'],
  banners:     ['Banners', 'Manage homepage hero slider'],
  categories:  ['Categories', 'Control what appears on the website'],
  products:    ['Products', 'Manage your catalog'],
  coupons:     ['Coupons', 'Discount codes & promotions'],
  orders:      ['Orders', 'Review and manage customer orders'],
  messages:    ['Messages', 'Contact form submissions'],
  subscribers: ['Subscribers', 'Newsletter subscribers'],
  settings:    ['Settings', 'Store-wide configuration']
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
    dashboard:   () => window.AdminDashboard?.load(),
    banners:     () => window.AdminBanners?.init(),
    categories:  () => window.AdminCategories?.init(),
    products:    () => window.AdminProducts?.init(),
    coupons:     () => window.AdminCoupons?.init(),
    orders:      () => { window.AdminOrders?.init(); initOrdersBackup(); },
    messages:    () => { window.AdminMessages?.load?.(); initMessagesBroadcast(); },
    subscribers: () => { window.AdminSubscribers?.load?.(); initSubsBroadcast(); },
    settings:    () => window.AdminSettings?.init()
  };
  if (initMap[name]) {
    try { initMap[name](); } catch (e) { console.error('[showSection]', name, e); }
  }
};

// ---------- Message templates ----------
const MESSAGE_TEMPLATES = {
  contactReply: `Assalam o Alaikum {name},

Thank you for contacting Al Ameen Fragrance. We received your message regarding:
"{subject}"

Our team is looking into this and will get back to you shortly.

For faster response, you can also reach us on WhatsApp: +92 317 2077664

JazakAllah,
Al Ameen Fragrance Team`,

  newsletterPromo: `Assalam o Alaikum,

*Al Ameen Fragrance* — خوشبو جو یاد رہ جائے

🎁 Special offer for our valued subscribers!

Use coupon *{coupon_code}* to get *{discount}% OFF* on your next order.

Don't miss out — visit our store now!

Shop: {store_url}

For queries: WhatsApp +92 317 2077664

JazakAllah,
Al Ameen Fragrance Team`,

  orderConfirmation: `Assalam o Alaikum {name},

Your order *{order_number}* has been confirmed.

Total: {total}
Payment: Cash on Delivery

We'll dispatch within 2-3 days. Track updates on WhatsApp.

JazakAllah for shopping with us!
Al Ameen Fragrance`
};

window.getMessageTemplate = function (key) {
  return MESSAGE_TEMPLATES[key] || '';
};

window.fillTemplate = function (template, vars) {
  return Object.keys(vars).reduce((s, k) => {
    return s.replace(new RegExp('{' + k + '}', 'g'), vars[k] ?? '');
  }, template);
};

// ============================================================
// ⭐ ORDERS BACKUP & DELETE
// ============================================================
function initOrdersBackup() {
  const dlJson = document.getElementById('backup-download');
  const dlCsv  = document.getElementById('backup-download-csv');
  const delBtn = document.getElementById('backup-delete-old');
  if (!dlJson || !dlCsv || !delBtn) return;
  if (dlJson.dataset.wired) return;
  dlJson.dataset.wired = '1';

  function getRange() {
    const from = document.getElementById('backup-from').value;
    const to   = document.getElementById('backup-to').value;
    return {
      from: from ? from + 'T00:00:00' : null,
      to:   to   ? to   + 'T23:59:59' : null
    };
  }

  async function fetchOrdersInRange() {
    const { from, to } = getRange();
    let q = sb.from('orders').select('*').order('created_at', { ascending: true });
    if (from) q = q.gte('created_at', from);
    if (to)   q = q.lte('created_at', to);
    const { data: orders, error } = await q;
    if (error) throw error;
    if (!orders || !orders.length) return { orders: [], items: [] };
    const ids = orders.map(o => o.id);
    const { data: items } = await sb.from('order_items').select('*').in('order_id', ids);
    return { orders, items: items || [] };
  }

  dlJson.addEventListener('click', async () => {
    dlJson.disabled = true; const orig = dlJson.textContent; dlJson.textContent = 'Preparing…';
    try {
      const { orders, items } = await fetchOrdersInRange();
      if (!orders.length) { AdminUI.toast('No orders in this range', 'error'); return; }
      const backup = {
        generated_at: new Date().toISOString(),
        store: 'Al Ameen Fragrance',
        total_orders: orders.length,
        total_items: items.length,
        orders,
        order_items: items
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `alameen-backup-${stamp}.json`;
      link.click();
      AdminUI.toast(`Backup downloaded: ${orders.length} orders`, 'success');
    } catch (err) {
      AdminUI.toast('Backup failed: ' + err.message, 'error');
    } finally {
      dlJson.disabled = false; dlJson.textContent = orig;
    }
  });

  dlCsv.addEventListener('click', async () => {
    dlCsv.disabled = true; const orig = dlCsv.textContent; dlCsv.textContent = 'Preparing…';
    try {
      const { orders, items } = await fetchOrdersInRange();
      if (!orders.length) { AdminUI.toast('No orders in this range', 'error'); return; }
      const headers = ['Order #','Date','Customer','Phone','Email','Address','City','Province','Subtotal','Shipping','Total','Status','Payment','Coupon','Coupon Disc'];
      const rows = orders.map(o => [
        o.order_number, o.created_at, o.customer_name, o.phone, o.email || '',
        o.address, o.city, o.province || '', o.subtotal, o.shipping, o.total,
        o.status, o.payment_method || 'COD', o.coupon_code || '', o.coupon_discount || 0
      ]);
      const itemsHeaders = ['Order #','Product','Size','Qty','Unit Price','Line Total','Cost Price','Cost Total','Profit'];
      const orderMap = {}; orders.forEach(o => orderMap[o.id] = o.order_number);
      const itemRows = items.map(it => [
        orderMap[it.order_id] || '', it.product_name, it.variant_size || '',
        it.quantity, it.unit_price, it.line_total, it.cost_price || 0,
        it.cost_total || 0, it.profit || 0
      ]);
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        '# ORDERS',
        headers.map(esc).join(','),
        ...rows.map(r => r.map(esc).join(',')),
        '',
        '# ORDER ITEMS',
        itemsHeaders.map(esc).join(','),
        ...itemRows.map(r => r.map(esc).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `alameen-backup-${stamp}.csv`;
      link.click();
      AdminUI.toast(`CSV downloaded: ${orders.length} orders`, 'success');
    } catch (err) {
      AdminUI.toast('Backup failed: ' + err.message, 'error');
    } finally {
      dlCsv.disabled = false; dlCsv.textContent = orig;
    }
  });

  delBtn.addEventListener('click', async () => {
    const { from, to } = getRange();
    if (!from && !to) { AdminUI.toast('Please select at least one date', 'error'); return; }
    const confirmMsg = '⚠️ This will PERMANENTLY delete all DELIVERED and CANCELLED orders in the selected range.\n\n' +
                       'Pending / Confirmed / Shipped orders will be SAFE.\n\n' +
                       'Make sure you have downloaded a backup first!\n\nContinue?';
    if (!confirm(confirmMsg)) return;
    delBtn.disabled = true; const orig = delBtn.textContent; delBtn.textContent = 'Deleting…';
    try {
      let q = sb.from('orders').select('id, status').in('status', ['delivered', 'cancelled']);
      if (from) q = q.gte('created_at', from);
      if (to)   q = q.lte('created_at', to);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || !data.length) { AdminUI.toast('No delivered/cancelled orders in this range', 'error'); return; }
      const ids = data.map(o => o.id);
      // delete items first
      await sb.from('order_items').delete().in('order_id', ids);
      // delete orders
      const { error: e2 } = await sb.from('orders').delete().in('id', ids);
      if (e2) throw e2;
      AdminUI.toast(`Deleted ${ids.length} old orders`, 'success');
      window.AdminOrders?.reload?.();
    } catch (err) {
      AdminUI.toast('Delete failed: ' + err.message, 'error');
    } finally {
      delBtn.disabled = false; delBtn.textContent = orig;
    }
  });
}

// ============================================================
// ⭐ MESSAGES — Product Broadcast
// ============================================================
async function initMessagesBroadcast() {
  const sel = document.getElementById('broadcast-product-select');
  const disc = document.getElementById('broadcast-discount-text');
  const preview = document.getElementById('broadcast-preview');
  const copyWa = document.getElementById('broadcast-copy-wa');
  const copyEm = document.getElementById('broadcast-copy-email');
  if (!sel || sel.dataset.wired) return;
  sel.dataset.wired = '1';

  // Load products
  const { data } = await sb.from('products').select('id, name, base_price, old_price, short_description, images').eq('is_active', true).order('created_at', { ascending: false }).limit(100);
  const products = data || [];
  sel.innerHTML = `<option value="">— Select Product —</option>` +
    products.map(p => `<option value="${p.id}">${AdminUI.escape(p.name)}</option>`).join('');

  function buildMessage(product, forEmail = false) {
    if (!product) return '';
    const siteUrl = window.location.origin.replace(/\/admin\/.*$/, '') || 'https://your-site.com';
    const productUrl = `${siteUrl}/product.html?id=${product.id}`;
    const price = Number(product.base_price) || 0;
    const oldPrice = Number(product.old_price) || 0;
    const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    const extra = (disc.value || '').trim();

    if (forEmail) {
      return `Subject: New Arrival at Al Ameen Fragrance — ${product.name}${discount > 0 ? ' (Save ' + discount + '%)' : ''}

Assalam o Alaikum,

We're excited to introduce our latest fragrance:

*${product.name}*

${product.short_description || 'A premium fragrance crafted for those who appreciate the finer things.'}

💰 Price: Rs. ${price.toLocaleString('en-PK')}${oldPrice > price ? `  (Was Rs. ${oldPrice.toLocaleString('en-PK')} — ${discount}% OFF!)` : ''}
${extra ? `\n🎁 ${extra}\n` : ''}
🛒 Order now: ${productUrl}

Cash on Delivery all over Pakistan.
For queries: WhatsApp +92 317 2077664

JazakAllah,
Al Ameen Fragrance Team`;
    }

    return `Assalam o Alaikum,

*Al Ameen Fragrance* — خوشبو جو یاد رہ جائے

✨ *NEW ARRIVAL* ✨

*${product.name}*

${product.short_description || 'A premium fragrance crafted for those who appreciate the finer things.'}

💰 Price: Rs. ${price.toLocaleString('en-PK')}${oldPrice > price ? `\n❌ Was: Rs. ${oldPrice.toLocaleString('en-PK')}\n🔥 Save ${discount}%!` : ''}
${extra ? `\n🎁 ${extra}\n` : ''}
🛒 Order: ${productUrl}

🚚 Cash on Delivery all over Pakistan
📱 WhatsApp: +92 317 2077664

JazakAllah,
Al Ameen Fragrance`;
  }

  function refresh() {
    const id = sel.value;
    const product = products.find(p => p.id === id);
    preview.value = product ? buildMessage(product, false) : '';
  }

  sel.addEventListener('change', refresh);
  disc.addEventListener('input', refresh);

  copyWa.addEventListener('click', async () => {
    const id = sel.value;
    if (!id) return AdminUI.toast('Select a product first', 'error');
    const product = products.find(p => p.id === id);
    const msg = buildMessage(product, false);
    const ok = await AdminUI.copyToClipboard(msg);
    AdminUI.toast(ok ? 'WhatsApp message copied! Paste in WhatsApp.' : 'Copy failed', ok ? 'success' : 'error');
  });

  copyEm.addEventListener('click', async () => {
    const id = sel.value;
    if (!id) return AdminUI.toast('Select a product first', 'error');
    const product = products.find(p => p.id === id);
    const msg = buildMessage(product, true);
    const ok = await AdminUI.copyToClipboard(msg);
    AdminUI.toast(ok ? 'Email message copied! Paste in Gmail/Outlook.' : 'Copy failed', ok ? 'success' : 'error');
  });
}

// ============================================================
// ⭐ SUBSCRIBERS — Product Broadcast
// ============================================================
async function initSubsBroadcast() {
  const sel = document.getElementById('subs-broadcast-product');
  const offer = document.getElementById('subs-broadcast-offer');
  const preview = document.getElementById('subs-broadcast-preview');
  const copyWa = document.getElementById('subs-copy-wa');
  const copyEm = document.getElementById('subs-copy-email');
  const waWeb = document.getElementById('subs-open-wa-web');
  if (!sel || sel.dataset.wired) return;
  sel.dataset.wired = '1';

  const { data } = await sb.from('products').select('id, name, base_price, old_price, short_description').eq('is_active', true).order('created_at', { ascending: false }).limit(100);
  const products = data || [];
  sel.innerHTML = `<option value="">— Select Product —</option>` +
    products.map(p => `<option value="${p.id}">${AdminUI.escape(p.name)}</option>`).join('');

  function buildMessage(product, forEmail = false) {
    if (!product) return '';
    const siteUrl = window.location.origin.replace(/\/admin\/.*$/, '') || 'https://your-site.com';
    const productUrl = `${siteUrl}/product.html?id=${product.id}`;
    const price = Number(product.base_price) || 0;
    const oldPrice = Number(product.old_price) || 0;
    const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    const extra = (offer.value || '').trim();

    if (forEmail) {
      return `Subject: 🎁 New Arrival at Al Ameen Fragrance — ${product.name}${discount > 0 ? ' (' + discount + '% OFF)' : ''}

Assalam o Alaikum,

We've just launched a brand new fragrance and thought of you first!

*${product.name}*

${product.short_description || 'A premium fragrance crafted for those who appreciate the finer things.'}

💰 Price: Rs. ${price.toLocaleString('en-PK')}${oldPrice > price ? `  (Was Rs. ${oldPrice.toLocaleString('en-PK')} — ${discount}% OFF!)` : ''}
${extra ? `\n🎁 ${extra}\n` : ''}
🛒 Shop Now: ${productUrl}

Cash on Delivery all over Pakistan.
For queries: WhatsApp +92 317 2077664

JazakAllah for subscribing!
Al Ameen Fragrance Team`;
    }

    return `Assalam o Alaikum,

*Al Ameen Fragrance* — خوشبو جو یاد رہ جائے

✨ *NEW LAUNCH* ✨

*${product.name}*

${product.short_description || 'A premium fragrance crafted for those who appreciate the finer things.'}

💰 Only Rs. ${price.toLocaleString('en-PK')}${oldPrice > price ? `  (was Rs. ${oldPrice.toLocaleString('en-PK')} — save ${discount}%!)` : ''}
${extra ? `\n🎁 ${extra}\n` : ''}
🛒 Order: ${productUrl}

🚚 COD all over Pakistan
📱 +92 317 2077664

JazakAllah,
Al Ameen Fragrance`;
  }

  function refresh() {
    const product = products.find(p => p.id === sel.value);
    preview.value = product ? buildMessage(product, false) : '';
    if (product) {
      waWeb.style.display = 'inline-flex';
      const waNum = (window.AAF_SETTINGS?.whatsapp_number) || (window.ALAMEEN_CONFIG?.WHATSAPP_NUMBER) || '923172077664';
      waWeb.href = `https://wa.me/${waNum}?text=${encodeURIComponent(buildMessage(product, false))}`;
    } else {
      waWeb.style.display = 'none';
    }
  }

  sel.addEventListener('change', refresh);
  offer.addEventListener('input', refresh);

  copyWa.addEventListener('click', async () => {
    if (!sel.value) return AdminUI.toast('Select a product first', 'error');
    const product = products.find(p => p.id === sel.value);
    const ok = await AdminUI.copyToClipboard(buildMessage(product, false));
    AdminUI.toast(ok ? 'WhatsApp message copied! Paste in WhatsApp.' : 'Copy failed', ok ? 'success' : 'error');
  });

  copyEm.addEventListener('click', async () => {
    if (!sel.value) return AdminUI.toast('Select a product first', 'error');
    const product = products.find(p => p.id === sel.value);
    const ok = await AdminUI.copyToClipboard(buildMessage(product, true));
    AdminUI.toast(ok ? 'Email message copied! Paste in Gmail/Outlook.' : 'Copy failed', ok ? 'success' : 'error');
  });
}

// ---------- BOOT ----------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[Boot] Starting dashboard boot...');

    if (!window.sb) {
      console.error('[Boot] sb missing');
      const grid = document.getElementById('stats-grid');
      if (grid) grid.innerHTML = `<div class="stat-card" style="grid-column:1/-1;border-color:var(--a-red);">
        <div class="label">Supabase not loaded</div>
        <div class="value" style="font-size:1rem;color:var(--a-red);">js/config.js check karein</div>
      </div>`;
      return;
    }

    const user = await AdminAuth.requireAdmin();
    if (!user) { console.warn('[Boot] Not authenticated'); return; }
    console.log('[Boot] Authenticated as', user.email);

    const emailEl = document.getElementById('admin-email');
    const userLabelEl = document.getElementById('user-label');
    const userAvatarEl = document.getElementById('user-avatar');
    if (emailEl) emailEl.textContent = user.email;
    if (userLabelEl) userLabelEl.textContent = user.email.split('@')[0];
    if (userAvatarEl) userAvatarEl.textContent = (user.email[0] || 'A').toUpperCase();

    // Sidebar buttons
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

    // Modal close
    document.querySelectorAll('[data-close-modal]').forEach(b => {
      b.addEventListener('click', () => AdminUI.closeModal(b.dataset.closeModal));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('is-open'); });
    });

    // Copy contact template
    document.getElementById('msg-copy-template')?.addEventListener('click', async () => {
      const tpl = window.getMessageTemplate('contactReply');
      const ok = await AdminUI.copyToClipboard(tpl);
      AdminUI.toast(ok ? 'Message template copied!' : 'Copy failed', ok ? 'success' : 'error');
    });

    // Copy newsletter promo template
    document.getElementById('subs-copy-template')?.addEventListener('click', async () => {
      const cfg = window.ALAMEEN_CONFIG || {};
      const tpl = window.getMessageTemplate('newsletterPromo');
      const filled = window.fillTemplate(tpl, {
        coupon_code: 'EID20',
        discount: '20',
        store_url: 'https://your-site.com'
      });
      const ok = await AdminUI.copyToClipboard(filled);
      AdminUI.toast(ok ? 'Promo template copied!' : 'Copy failed', ok ? 'success' : 'error');
    });

    showSection('dashboard');
    console.log('[Boot] Dashboard booted');
  } catch (e) {
    console.error('[Boot] FATAL:', e);
  }
});

// ---------- Realtime ----------
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