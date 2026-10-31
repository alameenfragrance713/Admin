// ============================================================
// Admin Coupons — Full CRUD
// ============================================================
window.AdminCoupons = (() => {
  let coupons = [];

  async function load() {
    const tbody = document.getElementById('coupons-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;

    const { data, error } = await sb.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('[Coupons] load error:', error);
      AdminUI.toast('Load failed: ' + error.message, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="a-empty" style="color:var(--a-red);">Load failed — see console</td></tr>`;
      return;
    }
    coupons = data || [];
    render();
  }

  function render() {
    const tbody = document.getElementById('coupons-tbody');
    if (!tbody) return;

    if (!coupons.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="a-empty">No coupons yet. Click "+ New Coupon" to create one.</td></tr>`;
      return;
    }

    tbody.innerHTML = coupons.map(c => {
      const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
      const usage = c.max_uses ? `${c.used_count}/${c.max_uses}` : `${c.used_count}/∞`;
      return `
        <tr>
          <td>
            <code style="color:var(--a-gold);font-size:.95rem;letter-spacing:1px;font-weight:700;">${AdminUI.escape(c.code)}</code>
            ${c.description ? `<br><small style="color:var(--a-muted);">${AdminUI.escape(c.description)}</small>` : ''}
          </td>
          <td>
            ${c.discount_type === 'percent'
              ? `<strong style="color:var(--a-gold-l);">${c.discount_value}%</strong>`
              : `<strong style="color:var(--a-gold-l);">${AdminUI.fmtPrice(c.discount_value)}</strong>`}
          </td>
          <td>${AdminUI.fmtPrice(c.min_order)}</td>
          <td>${usage}</td>
          <td>${c.expires_at ? AdminUI.fmtDate(c.expires_at) : '—'}</td>
          <td>
            ${isExpired ? `<span class="badge badge-inactive">Expired</span>` :
              c.is_active ? `<span class="badge badge-active">Active</span>` : `<span class="badge badge-inactive">Inactive</span>`}
          </td>
          <td class="actions">
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    // Bind events
    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = coupons.find(x => x.id === btn.dataset.edit);
        if (c) openEditor(c);
      });
    });
    tbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => deleteCoupon(btn.dataset.del));
    });
  }

  function openEditor(coupon = null) {
    const form = document.getElementById('coupon-form');
    form.reset();
    form.dataset.editId = coupon?.id || '';

    document.getElementById('coupon-modal-title').textContent = coupon ? 'Edit Coupon' : 'New Coupon';
    document.getElementById('coupon-usage-note').style.display = coupon ? 'block' : 'none';
    if (coupon) {
      document.getElementById('coupon-usage-note').textContent = `Used ${coupon.used_count} time${coupon.used_count === 1 ? '' : 's'}.`;
    }

    if (coupon) {
      form.elements.code.value = coupon.code;
      form.elements.description.value = coupon.description || '';
      form.elements.discount_type.value = coupon.discount_type;
      form.elements.discount_value.value = coupon.discount_value;
      form.elements.min_order.value = coupon.min_order || 0;
      form.elements.max_uses.value = coupon.max_uses ?? '';
      form.elements.expires_at.value = coupon.expires_at ? coupon.expires_at.slice(0, 16) : '';
      form.elements.is_active.checked = !!coupon.is_active;
    } else {
      form.elements.is_active.checked = true;
      form.elements.discount_type.value = 'percent';
      form.elements.min_order.value = 0;
    }

    AdminUI.openModal('coupon-modal');
  }

  async function saveCoupon(e) {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId;

    const code = (form.elements.code.value || '').trim().toUpperCase();
    const discountType = form.elements.discount_type.value;
    const discountValue = Number(form.elements.discount_value.value);

    if (!code) return AdminUI.toast('Coupon code required', 'error');
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      return AdminUI.toast('Code must be 3-30 chars, letters/numbers/_/- only', 'error');
    }
    if (!discountValue || discountValue <= 0) {
      return AdminUI.toast('Discount value must be greater than 0', 'error');
    }
    if (discountType === 'percent' && discountValue > 100) {
      return AdminUI.toast('Percent discount cannot exceed 100%', 'error');
    }

    const payload = {
      code,
      description: form.elements.description.value.trim() || null,
      discount_type: discountType,
      discount_value: discountValue,
      min_order: Number(form.elements.min_order.value) || 0,
      max_uses: form.elements.max_uses.value ? Number(form.elements.max_uses.value) : null,
      expires_at: form.elements.expires_at.value ? new Date(form.elements.expires_at.value).toISOString() : null,
      is_active: form.elements.is_active.checked
    };

    const btn = document.getElementById('coupon-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      if (editId) {
        const { error } = await sb.from('coupons').update(payload).eq('id', editId);
        if (error) throw error;
        AdminUI.toast('Coupon updated', 'success');
      } else {
        const { error } = await sb.from('coupons').insert(payload);
        if (error) {
          if (error.code === '23505') throw new Error('A coupon with this code already exists');
          throw error;
        }
        AdminUI.toast('Coupon created', 'success');
      }
      AdminUI.closeModal('coupon-modal');
      await load();
    } catch (err) {
      console.error(err);
      AdminUI.toast(err.message || 'Save failed', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Coupon';
    }
  }

  async function deleteCoupon(id) {
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete coupon "${c.code}"?\n\nThis cannot be undone.`)) return;

    const { error } = await sb.from('coupons').delete().eq('id', id);
    if (error) return AdminUI.toast('Delete failed: ' + error.message, 'error');
    AdminUI.toast('Coupon deleted', 'success');
    await load();
  }

  async function init() {
    // Wire "+ New Coupon" button once
    const addBtn = document.getElementById('coupon-add-btn');
    if (addBtn && !addBtn.dataset.wired) {
      addBtn.dataset.wired = '1';
      addBtn.addEventListener('click', () => openEditor(null));
    }

    // Wire form submit once
    const form = document.getElementById('coupon-form');
    if (form && !form.dataset.wired) {
      form.dataset.wired = '1';
      form.addEventListener('submit', saveCoupon);
    }

    // Auto-uppercase code input
    const codeInput = form?.elements.code;
    if (codeInput && !codeInput.dataset.wired) {
      codeInput.dataset.wired = '1';
      codeInput.addEventListener('input', (e) => {
        const pos = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        e.target.setSelectionRange(pos, pos);
      });
    }

    // Discount type helper
    const typeSel = form?.elements.discount_type;
    if (typeSel && !typeSel.dataset.wired) {
      typeSel.dataset.wired = '1';
      typeSel.addEventListener('change', () => {
        const valInput = form.elements.discount_value;
        if (typeSel.value === 'percent') {
          valInput.placeholder = 'e.g. 20 (means 20%)';
          valInput.max = '100';
        } else {
          valInput.placeholder = 'e.g. 500 (Rs.)';
          valInput.removeAttribute('max');
        }
      });
    }

    await load();
  }

  return { init, load };
})();