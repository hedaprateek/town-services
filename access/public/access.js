/* Shared sign-in and authenticated API client. Contact data never enters localStorage. */
(function () {
  'use strict';
  const base = 'https://www.gstatic.com/firebasejs/13.2.0/';
  let auth, sdk, user, current;
  const config = fetch('/api/config', { cache: 'no-store' }).then(r => r.json());
  const ready = (async () => {
    const c = await config;
    if (!c.configured) throw Error('Google sign-in has not been configured yet. Please contact the administrator.');
    const [app, authSdk] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js')]);
    sdk = authSdk; auth = sdk.getAuth(app.initializeApp(c.firebase));
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    user = await new Promise(resolve => {
      const off = sdk.onAuthStateChanged(auth, value => { off(); resolve(value); });
    });
    if (user) {
      const response = await fetch('/api/session', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken() } });
      const value = await response.json(); if (!response.ok) throw Error(value.error); current = value.user;
    }
    return current;
  })();
  // Sign-in pages handle the error and show a useful setup message.
  ready.catch(() => {});
  function loginUrl() { return '/signin.html?return=' + encodeURIComponent(location.pathname + location.search + location.hash); }
  async function api(path, options = {}) {
    await ready;
    if (!user) { location.replace(loginUrl()); throw Error('Sign in to continue.'); }
    const token = await user.getIdToken(), headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    if (options.body && typeof options.body !== 'string') { headers.set('Content-Type', 'application/json'); options = { ...options, body: JSON.stringify(options.body) }; }
    let response = await fetch(path, { ...options, headers, cache: 'no-store' });
    if (response.status === 401) {
      headers.set('Authorization', 'Bearer ' + await user.getIdToken(true));
      response = await fetch(path, { ...options, headers, cache: 'no-store' });
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 403 && !location.pathname.startsWith('/admin/') && !location.pathname.endsWith('/admin.html')) location.replace(loginUrl());
      throw Error(error.error || 'The request failed. Please try again.');
    }
    return response;
  }
  async function get(path, options) { return (await api(path, options)).json(); }
  async function signOut() {
    await ready.catch(() => {});
    await fetch('/api/logout', { method: 'POST' });
    if (auth) await sdk.signOut(auth);
    location.replace('/signin.html');
  }
  window.DirectoryAccess = { ready, api, get, config, signOut,
    async signIn() {
      await ready;
      const provider = new sdk.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
      await sdk.signInWithPopup(auth, provider); location.reload();
    },
    async ensure(scope, requireAdmin = false) {
      let m; try { m = await ready; } catch { location.replace(loginUrl()); throw Error('Sign-in setup is incomplete.'); }
      if (!m || m.status !== 'approved' || (requireAdmin ? !['owner', 'admin'].includes(m.role) : !(['owner', 'admin'].includes(m.role) || m.scopes.includes(scope)))) {
        location.replace(loginUrl()); throw Error('Access requires approval.');
      }
      document.documentElement.classList.remove('auth-loading');
      if (!document.getElementById('accessAccount')) {
        const bar = document.createElement('div'); bar.id = 'accessAccount'; bar.className = 'access-account';
        const label = document.createElement('span'); label.textContent = m.email;
        const out = document.createElement('button'); out.type = 'button'; out.textContent = 'Sign out'; out.onclick = signOut;
        bar.append(label, out);
        if (['owner', 'admin'].includes(m.role)) { const a = document.createElement('a'); a.href = '/admin/'; a.textContent = 'Manage access'; bar.append(a); }
        document.body.prepend(bar);
      }
      return m;
    }
  };
  // Retire only directory-owned offline caches. No private data is cached again.
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.filter(r => new URL(r.scope).origin === location.origin).map(r => r.unregister()))).catch(() => {});
  if ('caches' in window) caches.keys().then(keys => Promise.all(keys.filter(k => /^(town-services:|society-|society:|directory-)/.test(k)).map(k => caches.delete(k)))).catch(() => {});
  // Keep the protected-document cookie fresh without ever putting tokens in URLs.
  setInterval(async () => { if (!user || document.visibilityState !== 'visible') return; try {
    const m = (await get('/api/session', { method: 'POST' })).user; current = m;
    if (m.status !== 'approved' && location.pathname !== '/signin.html') location.replace(loginUrl());
  } catch { if (location.pathname !== '/signin.html') location.replace(loginUrl()); } }, 45 * 60 * 1000);
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  addEventListener('offline', () => {
    if (location.pathname !== '/signin.html') { document.documentElement.classList.add('auth-loading'); location.replace(loginUrl()); }
  });
})();
