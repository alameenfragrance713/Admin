// ============================================================
// Admin Settings
// ============================================================
window.AdminSettings = (() => {
  const FIELDS = ['store_name','announcement','shipping_charge','free_shipping_threshold',
                  'whatsapp_number','email','phone','address','facebook','instagram','tiktok','youtube'];

  async function load() {
    const { data } = await sb.from('settings').select('key,value');
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    const form = document.getElementById('settings-form');
    if (!form) return;
    FIELDS.forEach(k => {
      const el = form.querySelector(`[name=${k}]`);
      if (el) el.value = map[k] || '';
    });
  }

  async function save(e) {
    e.preventDefault();
    const form = e.target;
    const payload = FIELDS.map(k => ({
      key: k,
      value: form.querySelector(`[name=${k}]`)?.value || '',
      updated_at: new Date().toISOString()
    }));
    try {
      const { error } = await sb.from('settings').upsert(payload, { onConflict: 'key' });
      if (error) throw error;
      AdminUI.toast('Settings saved', 'success');
    } catch (err) {
      AdminUI.toast('Save failed: ' + err.message, 'error');
    }
  }

  async function init() {
    await load();
    const form = document.getElementById('settings-form');
    if (form) form.onsubmit = save;
  }

  return { init };
})();