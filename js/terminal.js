/* ============================================
   🚀 SHIFTURBO — TERMINAL ENGINE (terminal.js)
   Personel Terminali İşlevleri ve Supabase Bağlantısı
   ============================================ */

// 🛡️ UCR TECHNOLOGY — DIRECT SUPABASE CONNECTION
const supabaseUrl = 'https://tnvjdppcyctmqkirlwmy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudmpkcHBjeWN0bXFraXJsd215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY0NTIsImV4cCI6MjA4ODMxMjQ1Mn0.Ft4JXQtbcXz1-qO7n06fV1vGtP4DbCVUWDojEAFoALI';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let html5QrCode = null;
let currentPin = "";
let pendingType = null;
let autoTrackInterval = null;

// 📲 Service Worker Kaydı (PWA için)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('ShiftTurbo PWA Hazır!', reg))
            .catch(err => console.log('PWA Hatası:', err));
    });
}

// 🔄 Çevrimdışı Kuyruk Eşitleyici (Offline Sync Engine - Mutex Locked)
let isSyncingOffline = false;
async function syncOfflineQueue() {
    if (!navigator.onLine || isSyncingOffline) return;
    const offlineQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
    if (offlineQueue.length === 0) return;

    isSyncingOffline = true;
    console.log(`🔄 Çevrimdışı kuyrukta ${offlineQueue.length} kayıt bulundu. Supabase'e aktarılıyor...`);
    
    // YARIŞ DURUMUNU ÖNLEMEK İÇİN KUYRUĞU ANINDA BOŞALT!!! (Başka eventler aynı veriyi kapmasın)
    localStorage.setItem('shiftTurbo_offline_queue', '[]');

    const failedItems = [];

    for (const item of offlineQueue) {
        try {
            const { error } = await _supabase.from('logs').insert([{
                personel_name: item.personel_name,
                type: item.type,
                lat: item.lat,
                lon: item.lon,
                mahalle: item.mahalle,
                created_at: item.device_time
            }]);

            if (error) {
                console.warn("Kuyruk eşitleme hatası:", error);
                failedItems.push(item);
            } else {
                console.log("✅ Çevrimdışı kayıt başarıyla aktarıldı:", item.offline_id);
            }
        } catch (e) {
            failedItems.push(item);
        }
    }

    // Eğer başarısız olanlar varsa, güncel localStorage kuyruğu ile birleştirip geri yaz
    if (failedItems.length > 0) {
        const currentQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
        localStorage.setItem('shiftTurbo_offline_queue', JSON.stringify([...failedItems, ...currentQueue]));
    } else {
        console.log("🎉 Tüm çevrimdışı kuyruk başarıyla temizlendi.");
        // AKTARIM BİTTİĞİ AN EKRANI OTOMATİK YENİLE (Kullanıcının önüne anında MESAİ BİTİR gelsin!!!)
        if (localStorage.getItem('shiftTurbo_user')) {
            console.log("🔄 Çevrimdışı aktarım tamamlandı, arayüz güncelleniyor...");
            setTimeout(() => { location.reload(); }, 1000);
        }
    }

    isSyncingOffline = false;
}

window.addEventListener('online', syncOfflineQueue);
window.addEventListener('DOMContentLoaded', syncOfflineQueue);
setInterval(syncOfflineQueue, 15000); // 15 saniyede bir otomatik denetle

const playSound = (type) => {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain); gain.connect(context.destination);

        if (type === 'success') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(440, context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
            osc.start(); osc.stop(context.currentTime + 0.3);
        } else if (type === 'error') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, context.currentTime);
            osc.frequency.linearRampToValueAtTime(50, context.currentTime + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
            osc.start(); osc.stop(context.currentTime + 0.2);
        } else {
            osc.frequency.setValueAtTime(600, context.currentTime); osc.start();
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.1); osc.stop(context.currentTime + 0.1);
        }
    } catch (e) { }
};

function toggleAboutModal(show) {
    const modal = document.getElementById('about-modal');
    if (modal) modal.style.display = show ? 'flex' : 'none';
    if (typeof playSound === "function" && show) playSound('tap');
}

function speakAI(text, audioPool = null, onEndedCallback = null) {
    let isCallbackCalled = false;
    const doCallback = () => {
        if (!isCallbackCalled && typeof onEndedCallback === 'function') {
            isCallbackCalled = true;
            onEndedCallback();
        }
    };

    if (audioPool && Array.isArray(audioPool)) {
        const randomFile = audioPool[Math.floor(Math.random() * audioPool.length)];
        console.log("🎲 Ses Havuzundan Seçilen Anons:", randomFile);
        const audio = new Audio('./audio/' + randomFile);
        audio.onended = doCallback;
        audio.onerror = () => fallbackAI(text, doCallback);
        audio.play().catch(e => {
            console.warn("MP3 çalınamadı (Havuzda dosya eksik), tarayıcı AI sesine geçiliyor:", e);
            fallbackAI(text, doCallback);
        });
    } else if (typeof audioPool === 'string') {
        const audio = new Audio('./audio/' + audioPool);
        audio.onended = doCallback;
        audio.onerror = () => fallbackAI(text, doCallback);
        audio.play().catch(e => fallbackAI(text, doCallback));
    } else {
        fallbackAI(text, doCallback);
    }
}

function fallbackAI(text, onEndedCallback = null) {
    if (!('speechSynthesis' in window)) {
        if (typeof onEndedCallback === 'function') onEndedCallback();
        return;
    }
    window.speechSynthesis.cancel(); // Önceki yarım kalan sesleri anında temizle

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 0.92;  // Daha sakin, tane tane ve insansı bir diksiyon
    utterance.pitch = 1.05; // Daha canlı, enerjik ve premium bir ton

    if (typeof onEndedCallback === 'function') {
        utterance.onend = onEndedCallback;
        utterance.onerror = onEndedCallback;
    }

    const voices = window.speechSynthesis.getVoices();
    let bestVoice = voices.find(v => v.lang.includes('tr') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Yelda') || v.name.includes('Online')));
    if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('tr'));
    if (bestVoice) utterance.voice = bestVoice;

    window.currentUtterance = utterance; // Garbage Collector (GC) silmesin diye global atama!
    window.speechSynthesis.speak(utterance);
}

function speakGreeting(name) {
    const firstName = name.split(' ')[0];
    speakAI(`Hoş geldin ${firstName}. Kimliğin başarıyla doğrulandı.`);
}

function updateTime() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (dateEl) dateEl.innerText = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}
setInterval(updateTime, 1000); updateTime();

function acceptKVKK() {
    localStorage.setItem('shiftTurbo_kvkk', 'true');
    if (typeof playSound === "function") playSound('success');
    const overlay = document.getElementById('kvkk-overlay');
    if (overlay) overlay.style.display = 'none';
    console.log("🛡️ KVKK Protokolü Onaylandı.");
    location.reload();
}

function initKVKK() {
    const hasAccepted = localStorage.getItem('shiftTurbo_kvkk');
    const overlay = document.getElementById('kvkk-overlay');
    const checkbox = document.getElementById('kvkk-check');
    const btn = document.getElementById('kvkk-btn');

    if (hasAccepted !== 'true') {
        if (overlay) overlay.style.display = 'flex';
        if (checkbox && btn) {
            checkbox.addEventListener('change', function () {
                if (this.checked) {
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    if (typeof playSound === "function") playSound('tap');
                } else {
                    btn.style.opacity = "0.3";
                    btn.style.pointerEvents = "none";
                }
            });
        }
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

function createNumPad() {
    const grid = document.getElementById('numpad-grid');
    if (!grid) return;
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"];
    grid.innerHTML = nums.map(n => `<button class="num-btn" onclick="pressNum('${n}')">${n}</button>`).join('');
}

function pressNum(n) {
    playSound('tap');
    if (n === "C") { currentPin = ""; }
    else if (n === "OK") { checkPin(); return; }
    else { if (currentPin.length < 4) currentPin += n; }

    const display = document.getElementById('pin-display');
    if (display) display.innerText = "*".repeat(currentPin.length) || "****";
    if (currentPin.length === 4) setTimeout(checkPin, 300);
}

async function startQR() {
    playSound('tap');
    document.getElementById('qrWrapper').style.display = 'block';
    document.getElementById('scanBtn').style.display = 'none';

    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start({ facingMode: "environment" }, { fps: 25, qrbox: 250 }, async (decodedText) => {
        if (decodedText.toUpperCase().includes("SHIFT")) {
            playSound('success');
            await html5QrCode.stop();
            document.getElementById('qrWrapper').style.display = 'none';
            document.getElementById('pin-pad').style.display = 'block';
            createNumPad();
        }
    }).catch(err => {
        playSound('error');
        document.getElementById('qrWrapper').style.display = 'none';
        document.getElementById('scanBtn').style.display = 'block';

        const errorMsgBody = document.getElementById('error-msg-body');
        const errorModal = document.getElementById('error-modal');
        if (errorMsgBody && errorModal) {
            errorMsgBody.innerHTML = `<b>⚠️ KAMERA İZNİ REDDEDİLDİ:</b><br><br>Kameraya erişim izni vermediğiniz veya "Vazgeç" butonuna bastığınız için QR okuyucu başlatılamadı.<br><br>Lütfen tarayıcı ayarlarınızdan (adres çubuğundaki kilit simgesi veya site ayarları) kamera iznini açıp tekrar deneyiniz.`;
            errorModal.style.display = 'flex';
        }
    });
}

function getDeviceUUID() {
    let uuid = localStorage.getItem('shiftTurbo_device_uuid');
    if (!uuid) {
        uuid = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        if (window.crypto && crypto.randomUUID) {
            try { uuid = crypto.randomUUID(); } catch (e) { }
        }
        localStorage.setItem('shiftTurbo_device_uuid', uuid);
    }
    return uuid;
}

async function checkPin() {
    const pin = currentPin.trim();
    const { data, error } = await _supabase.from('users').select('*').eq('pin', pin);

    if (data && data.length > 0) {
        const userObj = data[0];
        const fullName = userObj.ad_soyad;
        const clientUUID = getDeviceUUID();

        // 🔍 CİHAZ EŞLEŞME KONTROLÜ (DEVICE BINDING)
        if (userObj.device_id !== undefined) {
            const dbDeviceId = userObj.device_id;
            if (dbDeviceId && dbDeviceId !== clientUUID) {
                playSound('error');
                document.getElementById('main-card').classList.add('shake');
                setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
                currentPin = ""; document.getElementById('pin-display').innerText = "****";

                document.getElementById('error-msg-body').innerHTML = `<b>⚠️ GÜVENLİK KİLİDİ (CİHAZ EŞLEŞME HATASI):</b><br><br>Bu PIN kodu daha önce başka bir telefon veya tarayıcı ile eşleştirilmiş!<br><br>💡 <b>Aynı telefonu kullanıyor olsanız bile</b>, tarayıcı geçmişini/önbelleğini temizlediğinizde veya uygulamayı silip yüklediğinizde cihaz kimliğiniz değişir.<br><br>🛠️ <b>ÇÖZÜM:</b> Lütfen yöneticinizden <b>Yönetici Paneli -> Personel Yönetimi</b> sekmesinden isminizin yanındaki <b>'📱 CİHAZ KİLİDİNİ AÇ'</b> butonuna basmasını talep ediniz. Ardından tekrar PIN girerek bu cihazı yeni cihazınız olarak tanımlayabilirsiniz.`;
                document.getElementById('error-modal').style.display = 'flex';
                return;
            }
        } else {
            console.warn("⚠️ Supabase 'users' tablosunda 'device_id' sütunu bulunamadı.");
        }

        playSound('success');
        localStorage.setItem('temp_user_name', fullName);
        localStorage.setItem('temp_user_pin', pin);

        document.getElementById('pin-pad').style.display = 'none';
        document.getElementById('user-check-text').innerText = `MERHABA ${fullName.split(' ')[0].toUpperCase()}, GİRİŞ YAPAN SEN MİSİN?`;
        document.getElementById('confirm-box').style.display = 'block';

    } else {
        playSound('error');
        document.getElementById('main-card').classList.add('shake');
        setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
        currentPin = ""; document.getElementById('pin-display').innerText = "****";
    }
}

async function verifySuccess() {
    const fullName = localStorage.getItem('temp_user_name') || "PERSONEL";
    const pin = localStorage.getItem('temp_user_pin');
    const clientUUID = getDeviceUUID();

    // 1. Cihaz ID Güncellemesini Arka Planda Yap (Ana akışı asla bloklama!)
    if (pin) {
        _supabase.from('users').update({ device_id: clientUUID }).eq('pin', pin)
            .then(() => console.log("Cihaz kaydı güncellendi."))
            .catch(e => console.warn("Cihaz kaydı uyarısı:", e));
    }

    // 2. Bildirim İzni İsteme (Ana akışı asla bloklama!)
    if ('Notification' in window && 'serviceWorker' in navigator) {
        try {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') console.log("🔔 Push Aktif.");
            }).catch(e => console.warn("Push uyarısı:", e));
        } catch (e) { console.warn("Push catch:", e); }
    }

    // 3. Sesli Karşılama (Hata verirse bile durmasın)
    try { speakGreeting(fullName); } catch (e) { console.warn("Ses uyarısı:", e); }

    // 🚀 4. ASIL GİRİŞ İŞLEMİ (KESİN VE ANINDA ÇALIŞIR!)
    localStorage.setItem('shiftTurbo_user', fullName);
    localStorage.setItem('auth_active', 'true');
    localStorage.removeItem('temp_user_name');
    localStorage.removeItem('temp_user_pin');

    // Ekranın anında geçmesi için UI'ı hemen güncelle (Arka planda sinsi reload YOK!)
    const confirmBox = document.getElementById('confirm-box');
    const mainActions = document.getElementById('main-actions');
    if (confirmBox) confirmBox.style.display = 'none';
    if (mainActions) mainActions.style.display = 'block';

    // Ekranın takılmaması ve Mesai Başlat butonunun ANINDA gelmesi için bootSystem çağrılıyor!
    if (typeof window.bootSystem === 'function') {
        window.systemStarted = false; // Yeniden tetiklenebilmesi için sıfırla
        window.bootSystem();
    }
}

function requestConfirm(type) {
    playSound('tap'); pendingType = type;
    document.getElementById('main-actions').style.display = 'none';
    document.getElementById('action-confirm').style.display = 'block';
    const actionText = document.getElementById('action-text');
    const okBtn = document.getElementById('final-ok-btn');

    if (type === 'GİRİŞ') { actionText.innerText = "MESAİ BAŞLATILSIN MI?"; okBtn.className = "btn-in"; }
    else { actionText.innerText = "MESAİ BİTİRİLSİN MI?"; okBtn.className = "btn-out"; }
}

function cancelAction() { document.getElementById('action-confirm').style.display = 'none'; document.getElementById('main-actions').style.display = 'block'; }

async function executeAction() {
    if (!pendingType) return;
    if (isSyncingOffline) {
        playSound('error');
        document.getElementById('status').innerText = "🔄 ÇEVRİMD DIŞI KAYITLAR AKTARILIYOR... (Lütfen Bekleyin)";
        return;
    }
    window.isExecutingAction = true; // Realtime kanalı sinsi reload atmasın diye bayrak açıldı!
    const type = pendingType;
    const name = localStorage.getItem('shiftTurbo_user');

    let buluttakiSonDurum = localStorage.getItem('shiftTurbo_last_status_' + name) || 'ÇIKIŞ';
    if (navigator.onLine) {
        try {
            const res = await _supabase
                .from('logs')
                .select('type')
                .eq('personel_name', name)
                .in('type', ['GİRİŞ', 'ÇIKIŞ'])
                .order('created_at', { ascending: false })
                .limit(1);
            if (res && res.data && res.data.length > 0) {
                buluttakiSonDurum = res.data[0].type;
                localStorage.setItem('shiftTurbo_last_status_' + name, buluttakiSonDurum);
            }
        } catch (e) { console.warn("Supabase son durum çekilemedi:", e); }
    }

    // HİBRİT KONTROL: Çevrimdışı kuyrukta bu personele ait daha güncel bir işlem var mı?
    const currentOfflineQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
    const personOfflineLogs = currentOfflineQueue.filter(item => item.personel_name === name);
    if (personOfflineLogs.length > 0) {
        const lastOfflineItem = personOfflineLogs[personOfflineLogs.length - 1];
        buluttakiSonDurum = lastOfflineItem.type;
        localStorage.setItem('shiftTurbo_last_status_' + name, buluttakiSonDurum);
        console.log(`⚡ Çevrimdışı kuyruktan son durum algılandı: ${buluttakiSonDurum}`);
    }

    if (type === 'ÇIKIŞ' && buluttakiSonDurum === 'ÇIKIŞ') {
        playSound('error');
        document.getElementById('status').innerText = "❌ ZATEN ÇIKIŞ YAPILMIŞ! (VEYA KUYRUKTA BEKLİYOR)";
        setTimeout(() => { location.reload(); }, 1500);
        return;
    }

    if (type === 'GİRİŞ' && buluttakiSonDurum === 'GİRİŞ') {
        playSound('error');
        document.getElementById('status').innerText = "❌ ZATEN MESAİDESİNİZ! (VEYA KUYRUKTA BEKLİYOR)";
        setTimeout(() => { location.reload(); }, 1500);
        return;
    }

    document.getElementById('action-confirm').style.display = 'none';
    const statusEl = document.getElementById('status');
    statusEl.innerText = "🛰️ KONUM İŞLENİYOR...";

    const finalizeLocation = async (accuracy, lat, lon) => {
        console.log("Kullanılan Hassasiyet: " + accuracy + "m");

        if (!navigator.onLine) {
            console.log("⚠️ İnternet bağlantısı yok! İşlem çevrimdışı kuyruğa alınıyor...");
            playSound('success');

            const offlineQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
            const offlineRecord = {
                offline_id: 'off_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
                personel_name: name,
                type: type,
                lat: lat,
                lon: lon,
                mahalle: `DOĞRULUK: ${Math.round(accuracy)}m (⚡ Çevrimdışı)`,
                device_time: new Date().toISOString(),
                is_offline_sync: true
            };
            offlineQueue.push(offlineRecord);
            localStorage.setItem('shiftTurbo_offline_queue', JSON.stringify(offlineQueue));
            localStorage.setItem('shiftTurbo_last_status_' + name, type);

            // Çevrimdışı İşlem Başladı Ekranı (Kullanıcının istediği Güvenlik Protokolü ekranını ANINDA veriyoruz)
            statusEl.innerHTML = type === 'ÇIKIŞ' ? `🛑 GÜVENLİK PROTOKOLÜ: MESAİ BİTİRİLDİ (ÇEVRİMDİŞI)` : `<span class="plane-animation">✈️</span> 🛰️ GÜVENLİK PROTOKOLÜ: MESAİ AKTİF (ÇEVRİMDİŞI)`;
            statusEl.classList.add('success-glow');

            // %100 Garantili Yönlendirme Kilidi (Ses bitmeden sayfa ASLA yenilenemez)
            window.isRedirectingNow = false;
            const performFinalRedirect = () => {
                if (window.isRedirectingNow) return;
                window.isRedirectingNow = true;
                console.log("🚀 Ses tamamen bitti veya garanti süre doldu, sayfa yönlendiriliyor!");
                if (type === 'ÇIKIŞ') {
                    localStorage.removeItem('shiftTurbo_user');
                    localStorage.removeItem('auth_active');
                    localStorage.removeItem('isShiftActive');
                    localStorage.removeItem('temp_user_name');
                    window.location.href = window.location.pathname;
                } else {
                    localStorage.setItem('isShiftActive', 'true');
                    location.reload();
                }
            };

            // Yapay Zeka Sesli Anons (Çevrimdışı - Rastgele Ses Havuzu + Callback + Garanti Timer)
            try {
                const firstName = name ? name.split(' ')[0] : 'Personel';
                speakAI(
                    type === 'ÇIKIŞ' ? `Sayın ${firstName}, internet bağlantısı algılanamadı. Mesai bitiş kaydınız çevrimdışı olarak yerel hafızaya güvence altına alındı.` : `Sayın ${firstName}, internet bağlantısı algılanamadı. Mesai başlangıç kaydınız çevrimdışı olarak yerel hafızaya güvence altına alındı.`,
                    type === 'ÇIKIŞ' ? ["mesai_bitir_cevrimdisi_1.mp3", "mesai_bitir_cevrimdisi_2.mp3"] : ["mesai_baslat_cevrimdisi_1.mp3", "mesai_baslat_cevrimdisi_2.mp3"],
                    performFinalRedirect
                );
            } catch(e) { console.warn("TTS Error:", e); }

            // Olası bir tarayıcı onended tetiklenmeme bug'ına karşı 8.5 saniyelik KABAK GİBİ Garanti Timer!
            setTimeout(performFinalRedirect, 8500);
            return;
        }

        const { error } = await _supabase.from('logs').insert([{
            personel_name: name,
            type: type,
            lat: lat,
            lon: lon,
            mahalle: `DOĞRULUK: ${Math.round(accuracy)}m`
        }]);

        if (error) {
            playSound('error');
            statusEl.innerText = "❌ VERİTABANI HATASI";
            document.getElementById('error-msg-body').innerText = "Kayıt Başarısız: " + error.message;
            document.getElementById('error-modal').style.display = 'flex';
        } else {
            localStorage.setItem('shiftTurbo_last_status_' + name, type);
            // Çevrimiçi İşlem Başladı Ekranı (Kullanıcının istediği Güvenlik Protokolü ekranını ANINDA veriyoruz)
            statusEl.innerHTML = type === 'ÇIKIŞ' ? `🛑 GÜVENLİK PROTOKOLÜ: MESAİ BİTİRİLDİ` : `<span class="plane-animation">✈️</span> 🛰️ GÜVENLİK PROTOKOLÜ: MESAİ AKTİF`;
            statusEl.classList.add('success-glow');

            // %100 Garantili Yönlendirme Kilidi (Ses bitmeden sayfa ASLA yenilenemez)
            window.isRedirectingNow = false;
            const performFinalRedirect = () => {
                if (window.isRedirectingNow) return;
                window.isRedirectingNow = true;
                console.log("🚀 Ses tamamen bitti veya garanti süre doldu, sayfa yönlendiriliyor!");
                if (type === 'ÇIKIŞ') {
                    localStorage.removeItem('shiftTurbo_user');
                    localStorage.removeItem('auth_active');
                    localStorage.removeItem('isShiftActive');
                    localStorage.removeItem('temp_user_name');
                    window.location.href = window.location.pathname;
                } else {
                    localStorage.setItem('isShiftActive', 'true');
                    location.reload();
                }
            };

            // Yapay Zeka Sesli Anons (Çevrimiçi - Rastgele Ses Havuzu + Callback + Garanti Timer)
            try {
                const firstName = name ? name.split(' ')[0] : 'Personel';
                speakAI(
                    type === 'ÇIKIŞ' ? `Sayın ${firstName}, mesainiz başarıyla sonlandırıldı. Tüm operasyonel kayıtlar merkeze aktarıldı ve güvence altına alındı. İyi istirahatler dileriz.` : `Sayın ${firstName}, mesainiz başarıyla başlatıldı. Shift Turbo güvenlik sistemleri devrede. İyi çalışmalar dileriz.`,
                    type === 'ÇIKIŞ' ? ["mesai_bitir_1.mp3", "mesai_bitir_2.mp3", "mesai_bitir_3.mp3"] : ["mesai_baslat_1.mp3", "mesai_baslat_2.mp3", "mesai_baslat_3.mp3"],
                    performFinalRedirect
                );
            } catch(e) { console.warn("TTS Error:", e); }

            // Olası bir tarayıcı onended tetiklenmeme bug'ına karşı 8.5 saniyelik KABAK GİBİ Garanti Timer!
            setTimeout(performFinalRedirect, 8500);
        }
    };

    if (window.bgLocation && window.bgLocation.accuracy <= 40) {
        finalizeLocation(window.bgLocation.accuracy, window.bgLocation.latitude, window.bgLocation.longitude);
    } else {
        const getLocation = (useHighAcc = true) => {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                finalizeLocation(pos.coords.accuracy, pos.coords.latitude, pos.coords.longitude);
            }, (err) => {
                if (useHighAcc && err.code === 3) {
                    statusEl.innerText = "⚠️ BİNA İÇİ HIZLI TARAMA YAPILIYOR...";
                    getLocation(false);
                    return;
                }
                playSound('error');
                let errMsg = "Bilinmeyen konum hatası.";
                if (err.code === 1) errMsg = "💥 ERİŞİM REDDİ: Tarayıcı veya telefondan KONUM izni (GPS) vermeniz şarttır.";
                else if (err.code === 2) errMsg = "📡 SİNYAL YOK: Lütfen cihazınızın Konum (GPS) ayarını açık konuma getirin.";
                else if (err.code === 3) errMsg = "⏱️ ZAMAN AŞIMI: Sinyal çok zayıf... Cihaz konumunuzu doğrulayamıyor.";

                document.getElementById('error-msg-body').innerText = errMsg;
                document.getElementById('error-modal').style.display = 'flex';
                statusEl.innerText = "❌ İŞLEM İPTAL EDİLDİ";
            }, { enableHighAccuracy: useHighAcc, timeout: useHighAcc ? 6000 : 8000, maximumAge: 10000 });
        };
        getLocation(true);
    }
}

function toggleModal(show) { document.getElementById('message-modal').style.display = show ? 'flex' : 'none'; }

async function sendMessage() {
    const msg = document.getElementById('msg-area').value.trim();
    let user = localStorage.getItem('shiftTurbo_user');
    if (!user) user = "BİLİNMEYEN PERSONEL (KAYITSIZ)";
    if (!msg) return;

    toggleModal(false);
    document.getElementById('status').innerText = "⏳ MESAJ İLETİLİYOR...";

    const finalizeMsg = async (lat, lon) => {
        if (!navigator.onLine) {
            console.log("⚠️ İnternet yok! Mesaj çevrimdışı kuyruğa alınıyor...");
            playSound('success');
            document.getElementById('status').innerText = "⚡ MESAJ ÇEVRİMDİŞI KAYDEDİLDİ";
            const offlineQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
            offlineQueue.push({
                offline_id: 'off_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
                personel_name: user,
                type: 'MESAJ',
                mahalle: msg + " (⚡ Çevrimdışı)",
                lat: lat, lon: lon,
                device_time: new Date().toISOString(),
                is_offline_sync: true
            });
            localStorage.setItem('shiftTurbo_offline_queue', JSON.stringify(offlineQueue));
            finishMessage();
            return;
        }

        await _supabase.from('logs').insert([{ personel_name: user, type: 'MESAJ', mahalle: msg, lat: lat, lon: lon }]);
        finishMessage();
    };

    navigator.geolocation.getCurrentPosition(async (pos) => {
        finalizeMsg(pos.coords.latitude, pos.coords.longitude);
    }, (err) => {
        finalizeMsg(0, 0);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function finishMessage() {
    playSound('success');
    const message = new SpeechSynthesisUtterance();
    message.text = "Mesajınız başarıyla merkeze iletildi.";
    message.lang = 'tr-TR';
    window.speechSynthesis.speak(message);

    const statusEl = document.getElementById('status');
    statusEl.innerHTML = `<span class="plane-animation">✈️</span> ✅ MESAJ MERKEZE İLETİLDİ`;
    statusEl.classList.add('success-glow');
    document.getElementById('msg-area').value = "";

    setTimeout(() => {
        statusEl.innerHTML = "SHIFT TURBO GÜVENLİK SİSTEMİ";
        statusEl.classList.remove('success-glow');
    }, 4000);
}

window.bootSystem = async () => {
    if (window.systemStarted) return;
    window.systemStarted = true;

    console.log("🚀 SİSTEM BAŞLATILIYOR...");
    const user = localStorage.getItem('shiftTurbo_user');
    const auth = localStorage.getItem('auth_active') === 'true';

    if (user && auth && navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => { window.bgLocation = pos.coords; },
            (err) => { console.log("BG GPS Isıtma Hatası:", err); },
            { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
        );
    }
    const scanBtn = document.getElementById('scanBtn');
    const mainActions = document.getElementById('main-actions');

    if (user && auth) {
        const clientUUID = getDeviceUUID();
        const { data: userCheck } = await _supabase.from('users').select('device_id').eq('ad_soyad', user).limit(1);

        if (userCheck && userCheck.length > 0) {
            const dbDeviceId = userCheck[0].device_id;
            if (dbDeviceId && dbDeviceId !== clientUUID) {
                console.warn("⚠️ GÜVENLİK İHLALİ: Oturum başka bir cihaza taşınmış. Yerel oturum kapatılıyor.");
                if (typeof playSound === 'function') playSound('error');
                localStorage.removeItem('shiftTurbo_user');
                localStorage.removeItem('auth_active');
                localStorage.removeItem('isShiftActive');
                localStorage.removeItem('temp_user_name');

                const errorMsgBody = document.getElementById('error-msg-body');
                const errorModal = document.getElementById('error-modal');
                if (errorMsgBody && errorModal) {
                    errorMsgBody.innerHTML = `<b>⚠️ GÜVENLİK KİLİDİ (CİHAZ EŞLEŞME HATASI):</b><br><br>Bu hesap daha önce başka bir telefon veya tarayıcı ile eşleştirilmiş!<br><br>💡 <b>Aynı telefonu kullanıyor olsanız bile</b>, tarayıcı geçmişini/önbelleğini temizlediğinizde veya uygulamayı silip yüklediğinizde cihaz kimliğiniz değişir.<br><br>🛠️ <b>ÇÖZÜM:</b> Lütfen yöneticinizden <b>Yönetici Paneli -> Personel Yönetimi</b> sekmesinden isminizin yanındaki <b>'📱 CİHAZ KİLİDİNİ AÇ'</b> butonuna basmasını talep ediniz. Ardından tekrar PIN girerek bu cihazı yeni cihazınız olarak tanımlayabilirsiniz.`;
                    errorModal.style.display = 'flex';
                }
                if (scanBtn) scanBtn.style.display = 'block';
                return;
            }
        }

        let lastAction = localStorage.getItem('shiftTurbo_last_status_' + user) || 'ÇIKIŞ';
        if (navigator.onLine) {
            try {
                const res = await _supabase
                    .from('logs').select('type').eq('personel_name', user)
                    .in('type', ['GİRİŞ', 'ÇIKIŞ']).order('created_at', { ascending: false }).limit(1);
                if (res && res.data && res.data.length > 0) {
                    lastAction = res.data[0].type;
                    localStorage.setItem('shiftTurbo_last_status_' + user, lastAction);
                }
            } catch (e) { console.warn("Supabase buton durumu çekilemedi:", e); }
        }

        // HİBRİT KONTROL: Çevrimdışı kuyrukta bu personele ait daha güncel bir işlem var mı?
        const currentOfflineQueue = JSON.parse(localStorage.getItem('shiftTurbo_offline_queue') || '[]');
        const personOfflineLogs = currentOfflineQueue.filter(item => item.personel_name === user);
        if (personOfflineLogs.length > 0) {
            const lastOfflineItem = personOfflineLogs[personOfflineLogs.length - 1];
            lastAction = lastOfflineItem.type;
            localStorage.setItem('shiftTurbo_last_status_' + user, lastAction);
            console.log(`⚡ Çevrimdışı kuyruktan buton durumu algılandı: ${lastAction}`);
        }

        if (lastAction === 'GİRİŞ') {
            document.getElementById('status-bar').style.width = "100%";
            document.getElementById('greeting').innerText = "SYSTEM ACTIVE / " + user.toUpperCase();
            mainActions.innerHTML = `
                <button class="btn-out" onclick="requestConfirm('ÇIKIŞ')">MESAİ BİTİR</button>
                <button class="btn-out btn-mini" onclick="localStorage.removeItem('shiftTurbo_user'); localStorage.removeItem('auth_active'); location.reload();" style="background: #334155; margin-top: 15px; font-family: 'Poppins', sans-serif; font-weight: bold; letter-spacing: 1px;">🔄 ANA EKRANA DÖN</button>
            `;
        } else {
            document.getElementById('status-bar').style.width = "50%";
            document.getElementById('greeting').innerText = "SYSTEM READY / " + user.toUpperCase();
            mainActions.innerHTML = `
                <button class="btn-in" onclick="requestConfirm('GİRİŞ')">MESAİ BAŞLAT</button>
                <button class="btn-out btn-mini" onclick="localStorage.removeItem('shiftTurbo_user'); localStorage.removeItem('auth_active'); location.reload();" style="background: #334155; margin-top: 15px; font-family: 'Poppins', sans-serif; font-weight: bold; letter-spacing: 1px;">🔄 ANA EKRANA DÖN</button>
            `;
        }

        // 🎮 OYUNLAŞTIRMA (GAMIFICATION) VE ROZET HESAPLAMA MOTORU
        try {
            const { data: allStoreLogs } = await _supabase.from('logs').select('*');
            if (allStoreLogs && allStoreLogs.length > 0) {
                const staffNames = [...new Set(allStoreLogs.map(l => l.personel_name || l.personel))].filter(Boolean);
                let bestStaffName = "";
                let maxScore = -1;
                let currentUserScore = 100;
                let currentUserHasViolation = false;

                staffNames.forEach(pName => {
                    let pScore = 100;
                    let pViolation = false;
                    const pLogs = allStoreLogs
                        .filter(l => ((l.personel_name || l.personel || "").trim().toUpperCase() === (pName || "").trim().toUpperCase()))
                        .sort((a, b) => new Date(a.created_at || a.raw_time) - new Date(b.created_at || b.raw_time));

                    if (pLogs.length > 0) {
                        for (let i = 0; i < pLogs.length; i++) {
                            if (pLogs[i].type === 'GİRİŞ') {
                                const girisZamani = new Date(pLogs[i].created_at || pLogs[i].raw_time);
                                let cikisLogu = null;
                                for (let j = i + 1; j < pLogs.length; j++) {
                                    if (pLogs[j].type === 'ÇIKIŞ') { cikisLogu = pLogs[j]; break; }
                                }
                                let bitisZamani = cikisLogu ? new Date(cikisLogu.created_at || cikisLogu.raw_time) : new Date();
                                let saatFarki = (bitisZamani - girisZamani) / 3600000;
                                if (saatFarki > 10.5) pScore -= 15;
                            }
                        }

                        pLogs.forEach(l => {
                            if (l.mahalle && l.mahalle.includes('DOĞRULUK:')) {
                                const match = l.mahalle.match(/DOĞRULUK:\s*(\d+)m/);
                                if (match && parseInt(match[1]) > 300) { pScore -= 5; pViolation = true; }
                            }
                        });

                        pScore += Math.floor(pLogs.length / 5) * 2;
                        pScore = Math.min(Math.max(pScore, 10), 100);
                    }

                    if (pScore > maxScore) { maxScore = pScore; bestStaffName = pName; }
                    if (pName.toUpperCase() === user.toUpperCase()) { currentUserScore = pScore; currentUserHasViolation = pViolation; }
                });

                const badgesBox = document.getElementById('badges-container');
                const msgBox = document.getElementById('gamification-msg');
                const gCard = document.getElementById('gamification-card');

                if (badgesBox && msgBox && gCard) {
                    let badgesHtml = "";
                    let gMsg = "";

                    if (currentUserScore >= 95) {
                        badgesHtml += `<span style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #10b981; padding: 6px 12px; border-radius: 8px; font-family: 'Poppins', sans-serif; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; box-shadow: 0 0 10px rgba(16,185,129,0.2);">ÜSTÜN BAŞARI</span>`;
                        gMsg = `<b>Yüksek Performans:</b> Operasyonel verimlilik puanınız ${currentUserScore}. Gösterdiğiniz üstün devamlılık ve disiplin için teşekkür ederiz.`;
                    } else if (currentUserScore >= 80) {
                        gMsg = `<b>İstikrarlı Performans:</b> Verimlilik puanınız ${currentUserScore}. Operasyonel standartlara uyumunuz için teşekkür ederiz.`;
                    } else {
                        gMsg = `<b>Gelişim Beklenen Performans:</b> Verimlilik puanınız ${currentUserScore}. Mesai başlangıçlarına ve konum hassasiyetine dikkat ederek puanınızı yükseltebilirsiniz.`;
                    }

                    if (!currentUserHasViolation) {
                        badgesHtml += `<span style="background: rgba(59,130,246,0.15); border: 1px solid #3b82f6; color: #60a5fa; padding: 6px 12px; border-radius: 8px; font-family: 'Poppins', sans-serif; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; box-shadow: 0 0 10px rgba(59,130,246,0.2);">TAM UYUM</span>`;
                    }

                    if (bestStaffName.toUpperCase() === user.toUpperCase() && currentUserScore >= 90) {
                        badgesHtml += `<span style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; color: #fbbf24; padding: 6px 12px; border-radius: 8px; font-family: 'Poppins', sans-serif; font-size: 11px; font-weight: bold; display: inline-flex; align-items: center; box-shadow: 0 0 10px rgba(245,158,11,0.2);">AYIN PERSONELİ</span>`;
                        gMsg += `<br><br><b>Tebrikler:</b> Bu ay mağazadaki en yüksek operasyonel puana sahipsiniz. Başarılarınızın devamını dileriz.`;
                    }

                    if (!badgesHtml) badgesHtml = `<span style="color:#64748b; font-size:11px; font-family:'Poppins', sans-serif;">Henüz değerlendirme kriteri oluşmadı.</span>`;

                    badgesBox.innerHTML = badgesHtml;
                    msgBox.innerHTML = gMsg;
                    gCard.style.display = 'block';
                }
            }
        } catch(e) { console.warn("Gamification Error:", e); }
    } else {
        if (scanBtn) scanBtn.style.display = 'block';
    }

    if (typeof updateTime === "function") {
        updateTime(); setInterval(updateTime, 1000);
    }

    const currentUserForRealtime = localStorage.getItem('shiftTurbo_user');
    if (currentUserForRealtime && auth) {
        _supabase.channel('db-changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs', filter: `personel_name=eq.${currentUserForRealtime}` }, payload => { 
            if (window.isExecutingAction) return; // Anons çalıyorsa sinsi reload atma!
            location.reload(); 
        }).subscribe();
        _supabase.channel('broadcast-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, payload => { fetchLatestBroadcast(); }).subscribe();

        fetchLatestBroadcast(); setInterval(fetchLatestBroadcast, 30000);
    }
};

window.onload = async () => {
    initNetworkMonitor(); checkKVKKStatus();
    if (localStorage.getItem('shiftTurbo_kvkk') === 'true') bootSystem();
};

function initNetworkMonitor() {
    const updateStatus = () => {
        const netIcon = document.getElementById('net-status-icon');
        if (!netIcon) return;
        if (navigator.onLine) {
            netIcon.innerHTML = `<span class="live-ping-wrapper"><span class="live-ping-wave"></span><span class="live-ping-dot"></span></span> GÜVENLİ_AĞ`; netIcon.style.color = ""; netIcon.classList.remove('status-error'); netIcon.classList.add('blink');
        } else {
            netIcon.innerHTML = `<span class="live-ping-wrapper live-ping-error"><span class="live-ping-wave"></span><span class="live-ping-dot"></span></span> BAĞLANTI_YOK`; netIcon.style.color = "var(--error)"; netIcon.classList.add('status-error'); netIcon.classList.remove('blink');
        }
    };
    window.addEventListener('online', updateStatus); window.addEventListener('offline', updateStatus); updateStatus();
}

async function deleteBroadcasts() {
    const { error } = await _supabase.from('broadcasts').delete().gte('id', 0);
    if (error) console.error("Broadcasts silinirken hata oluştu:", error);
    else console.log("Tüm eski broadcasts silindi.");
}

async function fetchLatestBroadcast() {
    const user = localStorage.getItem('shiftTurbo_user');
    const auth = localStorage.getItem('auth_active') === 'true';
    if (!user || !auth) {
        const banner = document.getElementById('broadcast-banner');
        if (banner) banner.style.display = 'none';
        document.body.style.paddingTop = "0"; return;
    }

    try {
        const { data } = await _supabase.from('broadcasts').select('message').order('created_at', { ascending: false });
        if (data && data.length > 0) {
            let matchedMsg = null;
            for (let b of data) {
                let m = b.message;
                if (m.startsWith('[ALL] ')) {
                    matchedMsg = m.replace('[ALL] ', '');
                    break;
                } else if (m.match(/^\[(.*?)\]\s*(.*)/)) {
                    const match = m.match(/^\[(.*?)\]\s*(.*)/);
                    const target = match[1];
                    const content = match[2];
                    if (target.toUpperCase() === user.toUpperCase()) {
                        matchedMsg = "👤 ÖZEL BİLDİRİM: " + content;
                        break;
                    }
                } else {
                    matchedMsg = m;
                    break;
                }
            }

            if (matchedMsg) {
                document.getElementById('broadcast-text').innerText = matchedMsg;
                document.getElementById('broadcast-banner').style.display = 'block';
                document.body.style.paddingTop = "35px";
            } else {
                document.getElementById('broadcast-banner').style.display = 'none';
                document.body.style.paddingTop = "0";
            }
        } else {
            document.getElementById('broadcast-text').innerText = "";
            document.getElementById('broadcast-banner').style.display = 'none';
            document.body.style.paddingTop = "0";
        }
    } catch (e) { console.log("Duyuru çekilemedi."); }
}

function checkKVKKStatus() {
    const hasAccepted = localStorage.getItem('shiftTurbo_kvkk');
    const overlay = document.getElementById('kvkk-overlay');
    const checkbox = document.getElementById('kvkk-check');
    const btn = document.getElementById('kvkk-btn');

    if (hasAccepted !== 'true') {
        if (overlay) overlay.style.display = 'flex';
        if (checkbox && btn) {
            checkbox.onchange = function () {
                if (this.checked) {
                    btn.style.opacity = "1"; btn.style.pointerEvents = "auto";
                    if (typeof playSound === "function") playSound('tap');
                } else {
                    btn.style.opacity = "0.3"; btn.style.pointerEvents = "none";
                }
            };
        }
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}

window.acceptKVKK = function () {
    console.log("KVKK Onaylandı."); localStorage.setItem('shiftTurbo_kvkk', 'true');
    if (typeof playSound === "function") playSound('success');
    document.getElementById('kvkk-overlay').style.display = 'none';
    bootSystem();
};

setTimeout(() => {
    const splashText = document.getElementById('splash-text');
    if (splashText) splashText.innerText = "GÜVENLİK PROTOKOLLERİ DOĞRULANIYOR...";

    setTimeout(() => {
        const splash = document.getElementById('cyber-splash');
        const landing = document.getElementById('landing-wrapper');
        const hasAcceptedKVKK = localStorage.getItem('shiftTurbo_kvkk');

        if (hasAcceptedKVKK === 'true') {
            if (splash) splash.style.opacity = '0';
            setTimeout(() => { if (splash) splash.style.display = 'none'; }, 500);
        } else {
            if (landing) landing.style.display = 'flex';
            if (splash) splash.style.opacity = '0';
            setTimeout(() => { if (splash) splash.style.display = 'none'; }, 500);
        }
    }, 1200);
}, 1500);

window.enterTerminal = function () {
    if (typeof playSound === "function") playSound('tap');
    const landing = document.getElementById('landing-wrapper');
    if (landing) {
        landing.style.transform = "translateY(-30px) scale(1.05)";
        landing.style.opacity = "0";
        setTimeout(() => { landing.style.display = 'none'; }, 800);
    }
};

window.showKVKKOnly = function () {
    if (typeof playSound === "function") playSound('tap');
    const overlay = document.getElementById('kvkk-overlay');
    const btn = document.getElementById('kvkk-btn');

    if (btn) {
        btn.style.opacity = "1"; btn.style.pointerEvents = "auto";
        btn.innerText = "KAPAT"; btn.className = "btn-out";
        btn.onclick = function () {
            if (typeof playSound === "function") playSound('tap');
            if (overlay) overlay.style.display = 'none';
            btn.innerText = "SİSTEME ERİŞİM SAĞLA"; btn.className = "btn-in";
            btn.onclick = acceptKVKK;
            if (localStorage.getItem('shiftTurbo_kvkk') !== 'true') {
                btn.style.opacity = "0.3"; btn.style.pointerEvents = "none";
            }
        };
    }
    if (overlay) overlay.style.display = 'flex';
};

function initDynamicSubtitle() {
    const phrases = [
        "Emeğin, Dijital Güvencemiz Altında", "Geleceği Bugünden Tasarla",
        "Hız ve Verimlilik Bir Arada", "Dijital Dönüşümün Parçası Ol",
        "ShiftTurbo ile Sınırları Aş", "UCR Technology Güvencesiyle",
        "Verimliliğin Yeni Adresi", "Sizin İçin, Sizinle Beraber"
    ];
    const subtitleEl = document.getElementById('dynamic-subtitle');
    if (subtitleEl) subtitleEl.innerText = phrases[Math.floor(Math.random() * phrases.length)];
}
document.addEventListener('DOMContentLoaded', initDynamicSubtitle);

window.showBioScan = function () {
    if (typeof playSound === "function") playSound('tap');
    const scanner = document.getElementById('bio-scanner');
    if (scanner) {
        scanner.style.display = 'flex';
        setTimeout(() => {
            scanner.style.opacity = '0';
            setTimeout(() => {
                scanner.style.display = 'none';
                window.enterTerminal();
            }, 500);
        }, 1500);
    }
};

window.startQR = startQR;
window.checkPin = checkPin;
window.pressNum = pressNum;
window.verifySuccess = verifySuccess;
window.requestConfirm = requestConfirm;
window.cancelAction = cancelAction;
window.executeAction = executeAction;
window.sendMessage = sendMessage;
window.toggleModal = toggleModal;
window.toggleAboutModal = toggleAboutModal;
