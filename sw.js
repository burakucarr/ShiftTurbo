const CACHE_NAME = 'shift-turbo-v10'; // Sürüm yükseltmek zorunlu cache silmeyi tetikler
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './yonetici.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap',
  './audio/kimlik_dogrulandi_1.mp3',
  './audio/kimlik_dogrulandi_2.mp3',
  './audio/kimlik_dogrulandi_3.mp3',
  './audio/mesai_baslat_1.mp3',
  './audio/mesai_baslat_2.mp3',
  './audio/mesai_baslat_3.mp3',
  './audio/mesai_bitir_1.mp3',
  './audio/mesai_bitir2.mp3',
  './audio/mesai_bitir_3.mp3',
  './audio/mesai_baslat_cevrimdisi_1.mp3',
  './audio/mesai_baslat_cevrimdisi_2.mp3',
  './audio/mesai_bitir_cevrimdisi_1.mp3',
  './audio/mesai_bitir_cevrimdisi_2.mp3'
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
  // Sadece GET isteklerini önbelleğe al
  if (event.request.method !== 'GET') return;

  // Supabase API veya dış bağlantıları önbelleğe alma
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // İnternet varsa, yeni cevabı cache'e de atalım (güncel kalsın)
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(async () => {
        // İnternet yoksa (Offline) veya sunucu hatası varsa cache'den getir
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Eğer sayfa yönlendirmesi (/yonetici veya /panel) ise ve önbellekte doğrudan yoksa yonetici.html'e fallback yap
        if (event.request.mode === 'navigate' || event.request.url.includes('/yonetici') || event.request.url.includes('/panel')) {
          return caches.match('./yonetici.html');
        }
        return caches.match('./index.html');
      })
  );
});

// 🔔 PUSH BİLDİRİMLERİ (Web Push Notifications)
self.addEventListener('push', (event) => {
  let data = {
    title: "📢 ShiftTurbo Bildirisi",
    body: "Yeni bir sistem hareketi işlendi.",
    url: "/yonetici.html"
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || data.body;
      data.url = payload.url || data.url;
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './logom.png',
    badge: './logom.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/yonetici.html' },
    tag: 'shift-turbo-notification',
    renotify: true,
    actions: [
      { action: 'open', title: '🚀 Görüntüle' },
      { action: 'close', title: 'Kapat' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 🖱️ BİLDİRİME TIKLAMA OLAYI (Notification Click)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action !== 'close') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        const urlToOpen = event.notification.data.url || '/yonetici.html';
        for (const client of clientList) {
          if (client.url.includes('yonetici.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// 🔄 ARKA PLAN SENKRONİZASYONU (Background Sync & Periodic Check)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-new-logs') {
    event.waitUntil(checkNewLogsSilently());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-shift-turbo-logs') {
    event.waitUntil(checkNewLogsSilently());
  }
});

async function checkNewLogsSilently() {
  // Arka planda Supabase kontrolü yapıp yeni log varsa Push bildirimi basar
  try {
    const supabaseUrl = 'https://tnvjdppcyctmqkirlwmy.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmpkcHBjeWN0bXFraXJsd215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY0NTIsImV4cCI6MjA4ODMxMjQ1Mn0.Ft4JXQtbcXz1-qO7n06fV1vGtP4DbCVUWDojEAFoALI';
    const resp = await fetch(`${supabaseUrl}/rest/v1/logs?select=*&order=created_at.desc&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const logs = await resp.json();
    if (logs && logs.length > 0) {
      const newest = logs[0];
      const lastSeenId = await getIndexedDBValue('last_seen_log_id');
      if (newest.id !== lastSeenId) {
        await setIndexedDBValue('last_seen_log_id', newest.id);
        await self.registration.showNotification(`ShiftTurbo: ${newest.personel_name}`, {
          body: `${newest.type} kaydı işlendi. (${newest.mahalle || ''})`,
          icon: '/logom.png',
          badge: '/logom.png',
          vibrate: [200, 100, 200],
          data: { url: '/yonetici.html' }
        });
      }
    }
  } catch (e) {
    console.warn("Arka plan log kontrolü yapılamadı:", e);
  }
}

// Basit IndexedDB Helper (Arka planda son log id saklamak için - Singleton DB Connection)
let dbInstance = null;

function getDBConnection() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }
    const req = indexedDB.open('ShiftTurboBG', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => {
      reject(e);
    };
  });
}

async function getIndexedDBValue(key) {
  try {
    const db = await getDBConnection();
    return new Promise((resolve) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const getReq = store.get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function setIndexedDBValue(key, val) {
  try {
    const db = await getDBConnection();
    return new Promise((resolve) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      const putReq = store.put(val, key);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

