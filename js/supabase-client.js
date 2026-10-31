// ============================================================
// Supabase client singleton
// ============================================================
(function () {
  const cfg = window.ALAMEEN_CONFIG || {};
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Supabase] CDN not loaded');
    return;
  }
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    console.warn('[Supabase] Please configure assets/js/config.js');
  }
  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();