// ============================================================
// Al Ameen Fragrance — Supabase Configuration
// Paste your Project URL and anon key from:
//   Supabase Dashboard → Project Settings → API
// ============================================================
window.ALAMEEN_CONFIG = {
  SUPABASE_URL: 'https://mvhkakncuzgkmizmdzng.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12aGtha25jdXpna21pem1kem5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjAzMjYsImV4cCI6MjEwOTAzNjMyNn0.X8VCWYuWtVEPK_P0hWvJuE2Y3t-9e_bqAg_p_9C_sEc',
  STORE_NAME: 'Al Ameen Fragrance',
  WHATSAPP_NUMBER: '923172077664',
  CURRENCY: 'Rs.',

  // Fallback values (real values come from `settings` table)
  SHIPPING_CHARGE: 250,
  FREE_SHIPPING_THRESHOLD: 2999
};


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