// Retires earlier offline workers when updating an existing installation.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(/^(town-services:|society-|society:|directory-)/.test(key))await caches.delete(key);
 await self.registration.unregister();await self.clients.claim();
})()));
