// ============================================================
// Admin Categories
// ============================================================
window.AdminCategories = (() => {
  let categories = [];
  let pendingImageFile = null;
  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  async function load() {
    const { data, error } = await sb.from('categories').select('*')
      .order('sort_order', { ascending: true }).order('name', { ascending: true });
    if (error) { AdminUI.toast('Load failed', 'error'); return; }
    categories = (data || []).map(c => ({
      id: c.id, name: c.name, slug: c.slug, image: c.image || '',
      parent_id: c.parent_id || null, visible: !!c.is_active
    }));
    render();
  }

  function render() {
    const list = document.getElementById('category-list');
    if (!list) return;
    const top = categories.filter(c => !c.parent_id);
    if (!top.length) {
      list.innerHTML = `<div class="empty-state"><p>No categories yet.</p></div>`;
      return;
    }
    const fallback = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1a1a1d"/><text x="50" y="55" text-anchor="middle" fill="#d4af37" font-family="Georgia" font-size="30">?</text></svg>');

    list.innerHTML = top.map(c => {
      const idx = categories.findIndex(x => x.id === c.id);
      return `
        <div class="category-item" draggable="true" data-idx="${idx}" data-id="${c.id}">
          <div class="drag-handle">⋮⋮</div>
          <div class="cat-thumb"><img src="${AdminUI.escape(c.image || fallback)}" alt="" onerror="this.onerror=null;this.src='${fallback}';"></div>
          <div class="cat-info">
            <input type="text" data-field="name" value="${AdminUI.escape(c.name)}">
            <small>/${AdminUI.escape(c.slug)}</small>
          </div>
          <div class="cat-actions">
            <button type="button" data-action="change-image" data-idx="${idx}">Image</button>
            <button type="button" data-action="edit" data-idx="${idx}">Edit</button>
            <button type="button" class="del" data-action="delete" data-idx="${idx}">Delete</button>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <span style="font-size:.65rem;color:var(--a-muted);">Visible</span>
            <label class="toggle"><input type="checkbox" data-field="visible" ${c.visible ? 'checked' : ''}><span class="slider"></span></label>
          </div>
        </div>`;
    }).join('');
    bind();
  }

  function bind() {
    const list = document.getElementById('category-list');
    list.querySelectorAll('[data-field="name"]').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const idx = Number(e.target.closest('[data-idx]').dataset.idx);
        try { await sb.from('categories').update({ name: e.target.value }).eq('id', categories[idx].id); }
        catch { AdminUI.toast('Save failed', 'error'); }
      });
    });
    list.querySelectorAll('[data-field="visible"]').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        const idx = Number(e.target.closest('[data-idx]').dataset.idx);
        const c = categories[idx];
        c.visible = e.target.checked;
        try {
          const { error } = await sb.from('categories').update({ is_active: c.visible }).eq('id', c.id);
          if (error) throw error;
          AdminUI.toast(`${c.name}: ${c.visible ? 'visible' : 'hidden'}`, 'success', 1500);
        } catch {
          c.visible = !c.visible; e.target.checked = c.visible;
          AdminUI.toast('Failed', 'error');
        }
      });
    });
    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const action = btn.dataset.action;
        const c = categories[idx];

        if (action === 'change-image') {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = ALLOWED.join(',');
          inp.addEventListener('change', async () => {
            const file = inp.files[0]; if (!file) return;
            const err = validateFile(file);
            if (err) { AdminUI.toast(err, 'error'); return; }
            try {
              const url = await uploadImage(file, 'categories');
              await sb.from('categories').update({ image: url }).eq('id', c.id);
              c.image = url; render();
              AdminUI.toast('Image updated', 'success');
            } catch { AdminUI.toast('Upload failed', 'error'); }
          });
          inp.click();
        }
        if (action === 'edit') openEditModal(c);
        if (action === 'delete') {
          if (!confirm(`Delete "${c.name}"?`)) return;
          try {
            const { error } = await sb.from('categories').delete().eq('id', c.id);
            if (error) throw error;
            AdminUI.toast('Deleted', 'success');
            await load();
          } catch { AdminUI.toast('Delete failed', 'error'); }
        }
      });
    });

    let dragIdx = null;
    list.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('dragstart', () => { dragIdx = Number(item.dataset.idx); item.classList.add('is-dragging'); });
      item.addEventListener('dragend', () => { item.classList.remove('is-dragging'); list.querySelectorAll('.category-item').forEach(x => x.classList.remove('drag-over')); });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', async (e) => {
        e.preventDefault(); item.classList.remove('drag-over');
        const dropIdx = Number(item.dataset.idx);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const [m] = categories.splice(dragIdx, 1); categories.splice(dropIdx, 0, m);
        try {
          const updates = categories.filter(c => !c.parent_id).map((c, i) => ({ id: c.id, sort_order: i }));
          for (const u of updates) await sb.from('categories').update({ sort_order: u.sort_order }).eq('id', u.id);
          AdminUI.toast('Order saved', 'success', 1200);
        } catch { AdminUI.toast('Order save failed', 'error'); }
        render();
      });
    });
  }

  function openEditModal(cat = null) {
    const form = document.getElementById('category-form');
    form.reset();
    pendingImageFile = null;
    document.getElementById('cat-image-preview').innerHTML = '';

    const parentSel = document.getElementById('cf-parent');
    parentSel.innerHTML = `<option value="">— Top level —</option>` +
      categories.filter(c => !c.parent_id && (!cat || c.id !== cat.id))
        .map(c => `<option value="${c.id}">${AdminUI.escape(c.name)}</option>`).join('');

    if (cat) {
      document.querySelector('#category-modal .modal-head h2').textContent = 'Edit Category';
      form.elements.name.value = cat.name;
      form.elements.slug.value = cat.slug;
      form.elements.parent_id.value = cat.parent_id || '';
      form.elements.is_active.checked = cat.visible;
      form.dataset.editId = cat.id;
      if (cat.image) document.getElementById('cat-image-preview').innerHTML = `<img src="${AdminUI.escape(cat.image)}" style="max-height:120px;border-radius:6px;">`;
    } else {
      document.querySelector('#category-modal .modal-head h2').textContent = 'Add Category';
      form.dataset.editId = '';
      form.elements.is_active.checked = true;
    }
    AdminUI.openModal('category-modal');
  }

  async function saveFromModal(e) {
    e.preventDefault();
    const form = e.target;
    const editId = form.dataset.editId;
    const name = form.elements.name.value.trim();
    let slug = form.elements.slug.value.trim();
    if (!name) return AdminUI.toast('Name required', 'error');
    if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const btn = document.getElementById('cat-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
      let imageUrl = null;
      if (pendingImageFile) {
        const err = validateFile(pendingImageFile);
        if (err) throw new Error(err);
        imageUrl = await uploadImage(pendingImageFile, 'categories');
      }
      const p = {
        name, slug,
        parent_id: form.elements.parent_id.value || null,
        is_active: form.elements.is_active.checked
      };
      if (imageUrl) p.image = imageUrl;

      if (editId) {
        const { error } = await sb.from('categories').update(p).eq('id', editId);
        if (error) throw error;
      } else {
        p.sort_order = 0;
        p.image = p.image || null;
        const { error } = await sb.from('categories').insert(p);
        if (error) throw error;
      }
      AdminUI.toast('Saved', 'success');
      AdminUI.closeModal('category-modal');
      pendingImageFile = null;
      await load();
    } catch (err) {
      AdminUI.toast(err.message || 'Save failed', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Category';
    }
  }

  function validateFile(f) {
    if (!ALLOWED.includes(f.type)) return `"${f.name}" — jpg/png/webp only.`;
    if (f.size > MAX_BYTES) return `"${f.name}" — max 5 MB.`;
    return null;
  }

  async function compressImage(file, maxW = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          c.toBlob(b => resolve(b), 'image/jpeg', quality);
        };
        img.onerror = reject; img.src = reader.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file, folder = 'categories') {
    const blob = await compressImage(file);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('banner-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data: pub } = sb.storage.from('banner-images').getPublicUrl(path);
    return pub.publicUrl;
  }

  async function init() {
    const addBtn = document.getElementById('category-add-btn');
    if (!addBtn.dataset.wired) {
      addBtn.dataset.wired = '1';
      addBtn.addEventListener('click', () => openEditModal(null));
      document.getElementById('category-form').addEventListener('submit', saveFromModal);

      const dz = document.getElementById('cat-image-dropzone');
      const inp = document.getElementById('cat-image-input');
      dz.addEventListener('click', () => inp.click());
      inp.addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        const err = validateFile(f);
        if (err) { AdminUI.toast(err, 'error'); return; }
        pendingImageFile = f;
        document.getElementById('cat-image-preview').innerHTML = `<img src="${URL.createObjectURL(f)}" style="max-height:120px;border-radius:6px;">`;
      });
    }
    await load();
  }

  return { init, load };
})();