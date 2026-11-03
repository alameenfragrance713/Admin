// ============================================================
// Admin Products — per-variant price / old / cost / stock
// ============================================================
window.AdminProducts = (() => {
  const PAGE_SIZE = 20;
  let offset = 0, total = 0, items = [], categories = [], currentImages = [];

  async function loadCategories() {
    const { data } = await sb.from('categories').select('*').order('sort_order');
    categories = data || [];
    const opts = categories.map(c => `<option value="${c.id}">${AdminUI.escape(c.name)}</option>`).join('');
    const pf = document.getElementById('pf-category');
    if (pf) pf.innerHTML = `<option value="">— Select —</option>` + opts;
    const pf2 = document.getElementById('prod-cat-filter');
    if (pf2) pf2.innerHTML = `<option value="">All Categories</option>` + opts;
  }

  async function fetchList(append = false) {
    const search = (document.getElementById('prod-search').value || '').trim();
    const cat = document.getElementById('prod-cat-filter').value;
    const activeF = document.getElementById('prod-active-filter').value;

    let q = sb.from('products').select('*', { count: 'exact' });
    if (search) {
      const safe = search.replace(/[%,]/g, '');
      q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
    }
    if (cat) q = q.eq('category_id', cat);
    if (activeF === 'active') q = q.eq('is_active', true);
    if (activeF === 'inactive') q = q.eq('is_active', false);
    q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

    const { data, error, count } = await q;
    if (error) { AdminUI.toast('Load failed: ' + error.message, 'error'); return; }
    if (append) items = items.concat(data || []);
    else items = data || [];
    total = count || 0;
    render();
  }

  function render() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="a-empty">No products found.</td></tr>`;
    } else {
      tbody.innerHTML = items.map(p => {
        const img = (p.images && p.images[0]) || '';
        const cat = categories.find(c => c.id === p.category_id);
        const variants = Array.isArray(p.variants) ? p.variants : [];

        let priceDisplay;
        if (variants.length > 0) {
          const minPrice = Math.min(...variants.map(v => Number(v.price) || 0).filter(x => x > 0));
          const minCost = Math.min(...variants.map(v => Number(v.cost_price) || 0).filter(x => x >= 0));
          const minMargin = minPrice > 0 ? (((minPrice - minCost) / minPrice) * 100).toFixed(0) : 0;
          priceDisplay = `
            <div style="color:var(--a-gold-l);font-weight:600;">From ${AdminUI.fmtPrice(minPrice)}</div>
            <div style="color:var(--a-muted);font-size:.72rem;">${variants.length} variant${variants.length > 1 ? 's' : ''}</div>
            <div style="color:var(--a-green);font-size:.68rem;">Margin: ${minMargin}%+</div>
          `;
        } else {
          const sell = Number(p.base_price) || 0;
          const cost = Number(p.cost_price) || 0;
          const margin = sell > 0 ? (((sell - cost) / sell) * 100).toFixed(0) : 0;
          priceDisplay = `
            <div style="color:var(--a-gold-l);font-weight:600;">${AdminUI.fmtPrice(sell)}</div>
            <div style="color:var(--a-muted);font-size:.72rem;">Cost: ${AdminUI.fmtPrice(cost)}</div>
            <div style="color:var(--a-green);font-size:.68rem;">Margin: ${margin}%</div>
          `;
        }

        return `
        <tr>
          <td><img src="${AdminUI.escape(img)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:6px;background:#000;" onerror="this.style.display='none';"></td>
          <td><strong>${AdminUI.escape(p.name)}</strong><br><small style="color:var(--a-muted);">${AdminUI.escape(p.gender || '')}</small></td>
          <td>${AdminUI.escape(p.sku || '—')}</td>
          <td>${cat ? AdminUI.escape(cat.name) : '—'}</td>
          <td>${priceDisplay}</td>
          <td>${p.stock ?? 0}</td>
          <td><span class="badge ${p.is_active ? 'badge-active' : 'badge-inactive'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
          <td class="actions">
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button>
          </td>
        </tr>`;
      }).join('');
    }
    document.getElementById('products-count').textContent = `${total} product${total === 1 ? '' : 's'}`;
    document.getElementById('prod-load-more').style.display = items.length < total ? '' : 'none';
  }

  function openEditor(product = null) {
    const form = document.getElementById('product-form');
    form.reset();
    form.querySelector('[name=id]').value = '';
    document.getElementById('product-modal-title').textContent = product ? 'Edit Product' : 'Add Product';
    currentImages = [];
    document.getElementById('variants-container').innerHTML = '';

    if (product) {
      form.querySelector('[name=id]').value = product.id || '';
      ['name','slug','sku','sub_category','short_description','description','notes_top','notes_middle','notes_base','gender','sort_order'].forEach(k => {
        const el = form.querySelector(`[name=${k}]`);
        if (el) el.value = product[k] ?? '';
      });
      form.querySelector('[name=category_id]').value = product.category_id || '';
      ['is_active','is_featured','is_trending','is_best_seller','is_signature','is_bundle','is_gift_set'].forEach(k => {
        const el = form.querySelector(`[name=${k}]`);
        if (el) el.checked = !!product[k];
      });
      currentImages = Array.isArray(product.images) ? [...product.images] : [];
      const variants = Array.isArray(product.variants) ? product.variants : [];
      variants.forEach(v => addVariantRow(v));
    }

    if (!form.querySelector('#variants-container').children.length) addVariantRow();
    renderImages();
    AdminUI.openModal('product-modal');
  }

  // ⭐ Variant row: 5 fields (size, price, old_price, cost_price, stock)
  function addVariantRow(v = {}) {
    const container = document.getElementById('variants-container');
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.style.cssText = 'display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr 1fr 44px;gap:8px;margin-bottom:12px;align-items:end;padding:12px;background:var(--a-bg-2);border-radius:8px;border:1px solid var(--a-line);';

    row.innerHTML = `
      <div>
        <label style="font-size:.65rem;color:var(--a-muted);display:block;margin-bottom:3px;letter-spacing:1px;">SIZE</label>
        <input class="form-control" placeholder="6ml" data-v="size" value="${AdminUI.escape(v.size || '')}">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--a-gold-l);display:block;margin-bottom:3px;letter-spacing:1px;">SELLING</label>
        <input class="form-control" type="number" placeholder="850" data-v="price" value="${v.price ?? ''}">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--a-muted);display:block;margin-bottom:3px;letter-spacing:1px;">OLD PRICE</label>
        <input class="form-control" type="number" placeholder="1100" data-v="old_price" value="${v.old_price ?? ''}">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--a-red);display:block;margin-bottom:3px;letter-spacing:1px;">COST</label>
        <input class="form-control" type="number" placeholder="500" data-v="cost_price" value="${v.cost_price ?? ''}">
      </div>
      <div>
        <label style="font-size:.65rem;color:var(--a-muted);display:block;margin-bottom:3px;letter-spacing:1px;">STOCK</label>
        <input class="form-control" type="number" placeholder="40" data-v="stock" value="${v.stock ?? ''}">
      </div>
      <button type="button" class="rm-variant" style="background:transparent;border:1px solid var(--a-line);color:var(--a-red);border-radius:6px;height:38px;font-size:1.2rem;cursor:pointer;" title="Remove">×</button>
    `;
    row.querySelector('.rm-variant').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function getVariants() {
    const rows = document.querySelectorAll('#variants-container .variant-row');
    const list = [];
    rows.forEach(r => {
      const size = r.querySelector('[data-v=size]').value.trim();
      const price = r.querySelector('[data-v=price]').value.trim();
      const old_price = r.querySelector('[data-v=old_price]').value.trim();
      const cost_price = r.querySelector('[data-v=cost_price]').value.trim();
      const stock = r.querySelector('[data-v=stock]').value.trim();
      if (!size && !price) return;
      list.push({
        size: size || 'Default',
        price: Number(price) || 0,
        old_price: Number(old_price) || 0,
        cost_price: Number(cost_price) || 0,
        stock: Number(stock) || 0
      });
    });
    return list;
  }

  function renderImages() {
    const uploader = document.getElementById('images-uploader');
    uploader.innerHTML = '';
    currentImages.forEach((src, i) => {
      const tile = document.createElement('div');
      tile.className = 'img-tile';
      tile.innerHTML = `<img src="${AdminUI.escape(src)}" alt=""><button type="button" class="rm">×</button>`;
      tile.querySelector('.rm').addEventListener('click', () => { currentImages.splice(i, 1); renderImages(); });
      uploader.appendChild(tile);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'add-tile'; addBtn.textContent = '+';
    uploader.appendChild(addBtn);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    uploader.appendChild(input);
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', handleUpload);
  }

  async function compressImage(file, maxW = 1000, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => resolve(b), 'image/jpeg', quality);
        };
        img.onerror = reject; img.src = reader.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    AdminUI.toast('Uploading ' + files.length + ' image(s)…', 'info');
    for (const file of files) {
      try {
        const blob = await compressImage(file);
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error } = await sb.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        const { data: pub } = sb.storage.from('product-images').getPublicUrl(path);
        currentImages.push(pub.publicUrl);
        renderImages();
      } catch (err) { AdminUI.toast('Upload failed: ' + file.name, 'error'); }
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    const form = e.target;
    const fd = Object.fromEntries(new FormData(form).entries());
    const id = fd.id;
    const variants = getVariants();

    // ⭐ If variants exist, base_price = cheapest variant's price
    let basePrice = Number(fd.base_price) || 0;
    let costPrice = Number(fd.cost_price) || 0;
    if (variants.length > 0) {
      const validPrices = variants.map(v => Number(v.price) || 0).filter(p => p > 0);
      const validCosts = variants.map(v => Number(v.cost_price) || 0).filter(c => c >= 0);
      basePrice = validPrices.length ? Math.min(...validPrices) : 0;
      costPrice = validCosts.length ? Math.min(...validCosts) : 0;
    }

    const payload = {
      name: (fd.name || '').trim(),
      slug: (fd.slug || '').trim() || String(fd.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      sku: fd.sku || null,
      category_id: fd.category_id || null,
      sub_category: fd.sub_category || null,
      short_description: fd.short_description || null,
      description: fd.description || null,
      notes_top: fd.notes_top || null,
      notes_middle: fd.notes_middle || null,
      notes_base: fd.notes_base || null,
      base_price: basePrice,
      cost_price: costPrice,
      old_price: Number(fd.old_price) || null,
      stock: Number(fd.stock) || 0,
      gender: fd.gender || 'Unisex',
      sort_order: Number(fd.sort_order) || 0,
      variants: variants,
      images: currentImages,
      is_active: form.querySelector('[name=is_active]').checked,
      is_featured: form.querySelector('[name=is_featured]').checked,
      is_trending: form.querySelector('[name=is_trending]').checked,
      is_best_seller: form.querySelector('[name=is_best_seller]').checked,
      is_signature: form.querySelector('[name=is_signature]').checked,
      is_bundle: form.querySelector('[name=is_bundle]').checked,
      is_gift_set: form.querySelector('[name=is_gift_set]').checked
    };

    if (!payload.name) return AdminUI.toast('Name required', 'error');
    if (variants.length === 0 && basePrice <= 0) return AdminUI.toast('Add at least one variant or price', 'error');

    const btn = document.getElementById('product-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      if (id) {
        const { error } = await sb.from('products').update(payload).eq('id', id);
        if (error) throw error;
        AdminUI.toast('Product updated', 'success');
      } else {
        const { error } = await sb.from('products').insert(payload);
        if (error) throw error;
        AdminUI.toast('Product added', 'success');
      }
      AdminUI.closeModal('product-modal');
      offset = 0; fetchList();
    } catch (err) {
      console.error(err);
      AdminUI.toast(err.message || 'Save failed', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Product';
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) return AdminUI.toast('Delete failed', 'error');
    AdminUI.toast('Product deleted', 'success');
    offset = 0; fetchList();
  }

  async function init() {
    await loadCategories();
    offset = 0;
    await fetchList();

    document.getElementById('prod-search').oninput = debounce(() => { offset = 0; fetchList(); }, 300);
    document.getElementById('prod-cat-filter').onchange = () => { offset = 0; fetchList(); };
    document.getElementById('prod-active-filter').onchange = () => { offset = 0; fetchList(); };
    document.getElementById('prod-add-btn').onclick = () => openEditor();
    document.getElementById('prod-load-more').onclick = () => { offset += PAGE_SIZE; fetchList(true); };
    document.getElementById('add-variant-btn').onclick = () => addVariantRow();
    document.getElementById('product-form').onsubmit = saveProduct;

    document.getElementById('products-tbody').onclick = (e) => {
      const ed = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (ed) { const p = items.find(x => x.id === ed.dataset.edit); if (p) openEditor(p); }
      if (del) deleteProduct(del.dataset.del);
    };
  }

  function debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }

  return { init };
})();
