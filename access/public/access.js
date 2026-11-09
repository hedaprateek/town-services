/* Shared sign-in and authenticated API client. Contact data never enters localStorage. */
(function () {
  'use strict';
  const base = 'https://www.gstatic.com/firebasejs/13.2.0/';
  let auth, sdk, user, current;
  function message(error) {
    const messages = {
      'auth/popup-blocked': 'Allow the Google sign-in popup and try again. If you opened this inside another app, open the link in Chrome or Safari.',
      'auth/popup-closed-by-user': 'Google sign-in was cancelled. Choose Continue with Google to try again.',
      'auth/cancelled-popup-request': 'Finish the open Google sign-in window, or try again.',
      'auth/unauthorized-domain': 'Google sign-in is not enabled for this website address yet. Ask the owner to add this hostname in Firebase Authentication settings.',
      'auth/operation-not-allowed': 'Google sign-in has not been enabled by the owner yet.',
      'auth/network-request-failed': 'Cannot reach Google. Check your internet connection and try again.',
      'auth/user-disabled': 'This Google login has been disabled for the directory. Contact the administrator.',
      'auth/user-token-expired': 'Your Google session expired. Sign in again to continue.',
      'auth/invalid-user-token': 'Your Google session expired. Sign in again to continue.',
      'auth/web-storage-unsupported': 'Allow browser storage for this website, then reload and sign in again.'
    };
    return messages[error?.code] || error?.message || 'The request failed. Please try again.';
  }
  async function request(path, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try { return await fetch(path, { ...options, cache: 'no-store', signal: controller.signal }); }
    catch (e) { throw Error(e.name === 'AbortError' ? 'The connection timed out. Check your internet connection and try again.' : 'Cannot reach the directory. Check your internet connection and try again.'); }
    finally { clearTimeout(timer); }
  }
  const config = request('/api/config').then(async r => {
    if (!r.ok) throw Error('The sign-in service is unavailable. Reload to try again.');
    try { return await r.json(); } catch { throw Error('This address is not serving the directory application. Ask the owner to check the Cloudflare Worker deployment.'); }
  });
  const initialization = (async () => {
    const c = await config;
    if (!c.configured) throw Error('Google sign-in has not been configured yet. Please contact the administrator.');
    const [app, authSdk] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js')]);
    sdk = authSdk; auth = sdk.getAuth(app.initializeApp(c.firebase));
    try { await sdk.setPersistence(auth, sdk.browserLocalPersistence); }
    catch { await sdk.setPersistence(auth, sdk.inMemoryPersistence); }
    user = await new Promise(resolve => {
      const off = sdk.onAuthStateChanged(auth, value => { off(); resolve(value); });
    });
  })();
  let lastSession = 0;
  async function session() {
    const response = await request('/api/session', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken(true) } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(value.error || 'Your sign-in could not be checked. Reload to try again.'), { status: response.status });
    lastSession = Date.now(); return current = value.user;
  }
  const ready = initialization.then(() => user ? session() : null).catch(e => { throw Object.assign(Error(message(e)), { code: e.code, status: e.status }); });
  // Sign-in pages handle the error and show a useful setup message.
  ready.catch(() => {});
  function loginUrl() { return '/signin.html?return=' + encodeURIComponent(location.pathname + location.search + location.hash); }
  async function api(path, options = {}) {
    await ready;
    if (!user) { location.replace(loginUrl()); throw Error('Sign in to continue.'); }
    const token = await user.getIdToken(), headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    if (options.body && typeof options.body !== 'string') { headers.set('Content-Type', 'application/json'); options = { ...options, body: JSON.stringify(options.body) }; }
    let response = await request(path, { ...options, headers });
    if (response.status === 401) {
      headers.set('Authorization', 'Bearer ' + await user.getIdToken(true));
      response = await request(path, { ...options, headers });
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if ([401,403].includes(response.status) && location.pathname !== '/signin.html' && (response.status === 401 || !location.pathname.startsWith('/admin/') && !location.pathname.endsWith('/admin.html'))) location.replace(loginUrl());
      throw Object.assign(Error(error.error || 'The request failed. Please try again.'), { status: response.status });
    }
    return response;
  }
  async function get(path, options) { return (await api(path, options)).json(); }
  async function signOut() {
    await initialization.catch(() => {});
    const response = await request('/api/logout', { method: 'POST' });
    if (!response.ok) throw Error('Sign-out could not be completed. Please try again.');
    if (auth) await sdk.signOut(auth);
    location.replace('/signin.html');
  }
  window.DirectoryAccess = { ready, api, get, config, signOut, message,
    async signIn() {
      await initialization;
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
  async function refreshSession() {
    if (!user || document.visibilityState !== 'visible' || Date.now() - lastSession < 40 * 60 * 1000) return;
    try { const m = await session(); if (m.status !== 'approved' && location.pathname !== '/signin.html') location.replace(loginUrl()); }
    catch (e) { if ([401,403].includes(e.status) && location.pathname !== '/signin.html') location.replace(loginUrl()); }
  }
  setInterval(refreshSession, 45 * 60 * 1000);
  document.addEventListener('visibilitychange', refreshSession);
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  addEventListener('offline', () => {
    if (location.pathname !== '/signin.html') { document.documentElement.classList.add('auth-loading'); location.replace(loginUrl()); }
  });
})();
