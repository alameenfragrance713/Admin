// ============================================================
// Admin Banners — file upload only
// ============================================================
window.AdminBanners = (() => {
  let banners = [];
  let dirty = false;
  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  async function load() {
    const { data, error } = await sb.from('banners').select('*').order('sort_order', { ascending: true });
    if (error) { AdminUI.toast('Load failed', 'error'); return; }
    banners = (data || []).map(b => ({
      id: b.id, image: b.image_desktop, mobileImage: b.image_mobile || '',
      title: b.title || '', subtitle: b.subtitle || '', buttonText: b.button_text || '',
      link: b.link || '', visible: !!b.is_active
    }));
    render();
  }

  function render() {
    const list = document.getElementById('banner-list');
    if (!list) return;
    if (!banners.length) {
      list.innerHTML = `<div class="empty-state"><p>No banners yet.</p><p class="small">Drop images above.</p></div>`;
      return;
    }
    list.innerHTML = banners.map((b, i) => `
      <div class="banner-item" draggable="true" data-idx="${i}">
        <div class="drag-handle">⋮⋮</div>
        <div class="thumb"><img src="${AdminUI.escape(b.image)}" alt="">${b.mobileImage ? `<span class="mobile-badge">+M</span>` : ''}</div>
        <div class="fields">
          <div><label>Title</label><input type="text" data-field="title" value="${AdminUI.escape(b.title)}"></div>
          <div><label>Subtitle</label><input type="text" data-field="subtitle" value="${AdminUI.escape(b.subtitle)}"></div>
          <div><label>Button</label><input type="text" data-field="buttonText" value="${AdminUI.escape(b.buttonText)}"></div>
          <div><label>Link</label><input type="text" data-field="link" value="${AdminUI.escape(b.link)}"></div>
          <div class="full"><label>Mobile image</label>
            <button type="button" class="btn btn-ghost btn-sm" data-action="mobile-upload" data-idx="${i}">${b.mobileImage ? 'Change' : 'Upload'}</button>
            ${b.mobileImage ? `<button type="button" class="btn btn-ghost btn-sm" data-action="mobile-remove" data-idx="${i}" style="color:var(--a-red);">Remove</button>` : ''}
          </div>
        </div>
        <div class="banner-actions">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span style="font-size:.7rem;color:var(--a-muted);">Visible</span>
            <label class="toggle"><input type="checkbox" data-field="visible" ${b.visible ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <button type="button" data-action="move-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-action="move-down" data-idx="${i}" ${i === banners.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="del" data-action="delete" data-idx="${i}">Delete</button>
        </div>
      </div>
    `).join('');
    bind();
  }

  function bind() {
    const list = document.getElementById('banner-list');
    list.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.closest('[data-idx]').dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'visible') banners[idx][f] = e.target.checked;
        else banners[idx][f] = e.target.value;
        dirty = true;
      });
    });

    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const action = btn.dataset.action;
        if (action === 'delete') {
          if (!confirm('Delete?')) return;
          banners.splice(idx, 1); dirty = true; render();
        }
        if (action === 'move-up' && idx > 0) { [banners[idx-1], banners[idx]] = [banners[idx], banners[idx-1]]; dirty = true; render(); }
        if (action === 'move-down' && idx < banners.length - 1) { [banners[idx+1], banners[idx]] = [banners[idx], banners[idx+1]]; dirty = true; render(); }
        if (action === 'mobile-upload') {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = ALLOWED.join(',');
          inp.addEventListener('change', async () => {
            const file = inp.files[0]; if (!file) return;
            const err = validateFile(file);
            if (err) { AdminUI.toast(err, 'error'); return; }
            try { banners[idx].mobileImage = await uploadImage(file, 'banners/mobile'); dirty = true; render(); }
            catch (e) { AdminUI.toast('Upload failed', 'error'); }
          });
          inp.click();
        }
        if (action === 'mobile-remove') { banners[idx].mobileImage = ''; dirty = true; render(); }
      });
    });

    let dragIdx = null;
    list.querySelectorAll('.banner-item').forEach(item => {
      item.addEventListener('dragstart', () => { dragIdx = Number(item.dataset.idx); item.classList.add('is-dragging'); });
      item.addEventListener('dragend', () => { item.classList.remove('is-dragging'); list.querySelectorAll('.banner-item').forEach(x => x.classList.remove('drag-over')); });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', (e) => {
        e.preventDefault(); item.classList.remove('drag-over');
        const dropIdx = Number(item.dataset.idx);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const [m] = banners.splice(dragIdx, 1); banners.splice(dropIdx, 0, m); dirty = true; render();
      });
    });
  }

  function validateFile(f) {
    if (!ALLOWED.includes(f.type)) return `"${f.name}" — jpg/png/webp only.`;
    if (f.size > MAX_BYTES) return `"${f.name}" — max 5 MB.`;
    return null;
  }

  async function compressImage(file, maxW = 1920, quality = 0.8) {
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

  async function uploadImage(file, folder = 'banners') {
    const blob = await compressImage(file);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('banner-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data: pub } = sb.storage.from('banner-images').getPublicUrl(path);
    return pub.publicUrl;
  }

  async function handleFiles(files) {
    const arr = Array.from(files);
    if (!arr.length) return;
    for (const f of arr) {
      const err = validateFile(f);
      if (err) { AdminUI.toast(err, 'error'); continue; }
      try {
        AdminUI.toast(`Uploading ${f.name}…`, 'info', 1200);
        const url = await uploadImage(f, 'banners');
        banners.push({ id: null, image: url, mobileImage: '', title: '', subtitle: '', buttonText: '', link: '', visible: true });
        dirty = true; render();
      } catch (e) { AdminUI.toast('Fail: ' + f.name, 'error'); }
    }
  }

  async function saveAll() {
    const btn = document.getElementById('banner-save-all');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { data: cur } = await sb.from('banners').select('id');
      const curIds = new Set((cur || []).map(b => b.id));
      const keepIds = new Set(banners.filter(b => b.id).map(b => b.id));
      const toDel = [...curIds].filter(id => !keepIds.has(id));
      if (toDel.length) await sb.from('banners').delete().in('id', toDel);

      for (let i = 0; i < banners.length; i++) {
        const b = banners[i];
        const p = {
          title: b.title || null, subtitle: b.subtitle || null, button_text: b.buttonText || null,
          image_desktop: b.image, image_mobile: b.mobileImage || null, link: b.link || null,
          sort_order: i, is_active: b.visible
        };
        if (b.id) {
          const { error } = await sb.from('banners').update(p).eq('id', b.id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('banners').insert(p);
          if (error) throw error;
        }
      }
      dirty = false;
      AdminUI.toast('Banners saved!', 'success');
      await load();
    } catch (e) {
      AdminUI.toast('Save failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  }

  async function init() {
    const dz = document.getElementById('banner-dropzone');
    const inp = document.getElementById('banner-file-input');
    const saveBtn = document.getElementById('banner-save-all');
    if (!dz.dataset.wired) {
      dz.dataset.wired = '1';
      dz.addEventListener('click', () => inp.click());
      inp.addEventListener('change', (e) => { handleFiles(e.target.files); inp.value = ''; });
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-drag'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
      saveBtn.addEventListener('click', saveAll);
    }
    await load();
  }

  return { init, load };
})();