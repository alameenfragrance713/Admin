// ============================================================
// Admin Auth — robust, no redirect loop
// ============================================================
window.AdminAuth = {
  async login(email, password) {
    if (!window.sb) throw new Error('Supabase client not loaded');
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const ok = await this.isAdmin(data.user.id);
    if (!ok) {
      await window.sb.auth.signOut();
      throw new Error('This account is not an admin.');
    }
    return true;
  },

  async logout() {
    try { if (window.sb) await window.sb.auth.signOut(); } catch (e) {}
    window.location.href = 'index.html';
  },

  async getSession() {
    if (!window.sb) return null;
    try {
      const { data, error } = await window.sb.auth.getSession();
      if (error) { console.error('[auth] getSession error:', error); return null; }
      return data.session || null;
    } catch (e) {
      console.error('[auth] getSession threw:', e);
      return null;
    }
  },

  async isAdmin(userId) {
    if (!userId || !window.sb) return false;
    try {
      const { data, error } = await window.sb.from('admins').select('id').eq('user_id', userId).maybeSingle();
      if (error) { console.error('[auth] isAdmin error:', error); return false; }
      return !!data;
    } catch (e) {
      console.error('[auth] isAdmin threw:', e);
      return false;
    }
  },

  async requireAdmin() {
    const currentPath = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (currentPath === 'index.html' || currentPath === '') return null;

    const session = await this.getSession();
    if (!session) {
      console.warn('[auth] No session — redirecting to login');
      window.location.href = 'index.html';
      return null;
    }

    const ok = await this.isAdmin(session.user.id);
    if (!ok) {
      console.warn('[auth] Not admin — signing out');
      try { await window.sb.auth.signOut(); } catch (e) {}
      window.location.href = 'index.html';
      return null;
    }
    return session.user;
  },

  async redirectIfAuthed() {
    const session = await this.getSession();
    if (!session) return;
    const ok = await this.isAdmin(session.user.id);
    if (ok) window.location.href = 'dashboard.html';
  }
};

// Auth state: reload only on SIGNED_OUT
(function () {
  function attach() {
    if (!window.sb) { setTimeout(attach, 200); return; }
    try {
      window.sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          const currentPath = (window.location.pathname.split('/').pop() || '').toLowerCase();
          if (currentPath !== 'index.html' && currentPath !== '') {
            window.location.href = 'index.html';
          }
        }
      });
    } catch (e) { console.warn('[auth] onAuthStateChange fail:', e); }
  }
  attach();
})();