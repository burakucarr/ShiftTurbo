const CACHE_NAME = 'shift-turbo-v3'; // Sürüm yükseltmek zorunlu cache silmeyi tetikler
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/yonetici.html', // admin.html yerine sizin dosya adınız yonetici.html'dir
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

// 🛠️ Kurulum: Dosyaları Önbelleğe Al
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Yeni versiyonu beklemeden hemen devreye al
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 🚀 Aktifleştirme: Eski Önbellekleri Temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 📡 Veri Getirme: ÖNCE İNTERNETE BAK, YOKSA ÖNBELLEĞE GİT (Network First)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // İnternet varsa, yeni cevabı cache'e de atalım (güncel kalsın)
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => {
        // İnternet yoksa (Offline), cache'den getir
        return caches.match(event.request);
      })
  );
});