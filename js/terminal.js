/* ============================================
   🚀 SHIFTURBO — TERMINAL ENGINE (terminal.js)
   Personel Terminali İşlevleri ve Supabase Bağlantısı
   ============================================ */

// 🛡️ SHIFTURBO — SECURE PROXY CONNECTION
const proxyUrl = 'https://shiftturbo-proxy.burakkucar55-5af.workers.dev';
const localSupabaseConfig = (typeof SHIFTURBO_CONFIG !== 'undefined' && SHIFTURBO_CONFIG && SHIFTURBO_CONFIG.supabaseUrl && SHIFTURBO_CONFIG.supabaseKey)
    ? SHIFTURBO_CONFIG
    : null;

let _supabase = null;
let _supabaseClientType = 'proxy';

// testSupabaseClient ve initSupabaseClient → shared.js'den gelir (window.ShiftTurboShared)

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

async function ensureSupabaseClient() {
    if (!_supabase) {
        if (window.ShiftTurboShared && typeof window.ShiftTurboShared.initSupabaseClient === 'function') {
            const result = await window.ShiftTurboShared.initSupabaseClient(proxyUrl, localSupabaseConfig);
            if (result) {
                _supabase = result.client;
                _supabaseClientType = result.type;
            }
        }
    }
    return _supabase;
}

window.addEventListener('load', async () => {
    await ensureSupabaseClient();
});

// 🔄 Çevrimdışı Kuyruk Eşitleyici (Offline Sync Engine - Mutex Locked)
let isSyncingOffline = false;
async function syncOfflineQueue() {
    if (!navigator.onLine || isSyncingOffline) return;
    const offlineQueue = window.ShiftTurboShared.getObfuscated('shiftTurbo_offline_queue') || [];
    if (offlineQueue.length === 0) return;

    await ensureSupabaseClient();
    if (!_supabase) return;

    isSyncingOffline = true;
    console.log(`🔄 Çevrimdışı kuyrukta ${offlineQueue.length} kayıt bulundu. Supabase'e aktarılıyor...`);

    // YARIŞ DURUMUNU ÖNLEMEK İÇİN KUYRUĞU ANINDA BOŞALT!!! (Başka eventler aynı veriyi kapmasın)
    window.ShiftTurboShared.setObfuscated('shiftTurbo_offline_queue', []);

    const failedItems = [];

    for (const item of offlineQueue) {
        try {
            const currentBizId = item.business_id || localStorage.getItem('shiftTurbo_business_id') || window.currentBusinessId || null;
            const insertPayload = {
                personel_name: item.personel_name,
                type: item.type,
                lat: item.lat,
                lon: item.lon,
                mahalle: item.mahalle,
                created_at: item.device_time
            };
            if (currentBizId && currentBizId !== 'default') {
                insertPayload.business_id = currentBizId;
            }
            const { error } = await _supabase.from('logs').insert([insertPayload]);

            if (error) {
                console.warn("Kuyruk eşitleme hatası:", error);
                failedItems.push(item);
            } else {
                console.log("✅ Çevrimdışı kayıt başarıyla aktarıldı:", item.offline_id);
                // Senkronizasyon başarılı: yerel status cache'ini de güncelle (GİRİŞ/ÇIKIŞ için)
                if (item.personel_name && (item.type === 'GİRİŞ' || item.type === 'ÇIKIŞ')) {
                    window.ShiftTurboShared.setStatus(item.personel_name, item.type);
                    console.log(`🔄 Yerel status cache güncellendi: ${item.personel_name} → ${item.type}`);
                }
            }
        } catch (e) {
            failedItems.push(item);
        }
    }

    // Eğer başarısız olanlar varsa, güncel localStorage kuyruğu ile birleştirip geri yaz
    if (failedItems.length > 0) {
        const currentQueue = window.ShiftTurboShared.getObfuscated('shiftTurbo_offline_queue') || [];
        window.ShiftTurboShared.setObfuscated('shiftTurbo_offline_queue', [...failedItems, ...currentQueue]);
    } else {
        console.log("🎉 Tüm çevrimdışı kuyruk başarıyla temizlendi.");
        // OTOMATİK YENİLEME KALDIRILDI - Akışı bozmamak için
    }

    isSyncingOffline = false;
}

window.addEventListener('online', syncOfflineQueue);
window.addEventListener('DOMContentLoaded', syncOfflineQueue);
setInterval(syncOfflineQueue, 15000); // 15 saniyede bir otomatik denetle

const playSound = (type) => {
    try {
        if (navigator.vibrate) {
            if (type === 'success') {
                navigator.vibrate([70, 50, 70]);
            } else if (type === 'error') {
                navigator.vibrate([150, 100, 150]);
            } else {
                navigator.vibrate(30);
            }
        }
    } catch (e) {
        console.warn("Haptic feedback error:", e);
    }

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
        if (isCallbackCalled) return;
        isCallbackCalled = true;
        if (typeof onEndedCallback === 'function') {
            onEndedCallback();
        }
    };

    // Güvenlik bariyeri: ses kesilmezse doğal sonunda çalışsın, yoksa uzun timeout sonrası zorla devam etsin.
    const safetyTimer = setTimeout(() => {
        console.warn("⚠️ Yapay zeka sesi için güvenlik süresi doldu; yönlendirme zorla devam ediyor.");
        doCallback();
    }, 20000);

    const clearSafetyTimer = () => {
        clearTimeout(safetyTimer);
        doCallback();
    };

    if (audioPool && Array.isArray(audioPool)) {
        const randomFile = audioPool[Math.floor(Math.random() * audioPool.length)];
        console.log("🎲 Ses Havuzundan Seçilen Anons:", randomFile);
        const audio = new Audio('./audio/' + randomFile);
        audio.onended = clearSafetyTimer;
        audio.onerror = () => fallbackAI(text, clearSafetyTimer);
        audio.play().catch(e => {
            console.warn("MP3 çalınamadı (Havuzda dosya eksik), tarayıcı AI sesine geçiliyor:", e);
            fallbackAI(text, clearSafetyTimer);
        });
    } else if (typeof audioPool === 'string') {
        const audio = new Audio('./audio/' + audioPool);
        audio.onended = clearSafetyTimer;
        audio.onerror = () => fallbackAI(text, clearSafetyTimer);
        audio.play().catch(e => fallbackAI(text, clearSafetyTimer));
    } else {
        fallbackAI(text, clearSafetyTimer);
    }
}

function fallbackAI(text, onEndedCallback = null) {
    if (!('speechSynthesis' in window)) {
        if (typeof onEndedCallback === 'function') onEndedCallback();
        return;
    }
    window.speechSynthesis.cancel(); // Önceki yarım kalan sesleri anında temizle

    // Android TTS büyük harfli isimleri harf harf kodlamasın (B-U-R-A-K) diye düzelt
    let cleanedText = (text || "").replace(/([A-ZÇĞİÖŞÜ]{2,})/g, function (match) {
        return match.charAt(0) + match.slice(1).toLowerCase();
    });

    const utterance = new SpeechSynthesisUtterance(cleanedText);
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
    const firstName = name ? name.split(' ')[0] : 'Personel';
    const formattedName = firstName ? (firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()) : 'Personel';
    speakAI(`Hoş geldin ${formattedName}. Kimliğin başarıyla doğrulandı.`, ["kimlik_dogrulandi_1.mp3", "kimlik_dogrulandi_2.mp3", "kimlik_dogrulandi_3.mp3"]);
}

function updateTime() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (dateEl) dateEl.innerText = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}
setInterval(updateTime, 1000); updateTime();

// acceptKVKK ve initKVKK eski sürümleri kaldırıldı (aktif sürümler dosyanın sonunda: window.acceptKVKK ve checkKVKKStatus)

function createNumPad() {
    const grid = document.getElementById('numpad-grid');
    if (!grid) return;
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "OK"];
    grid.innerHTML = nums.map(n => `<button class="num-btn" onclick="pressNum('${n}')">${n}</button>`).join('');
}

function pressNum(n) {
    playSound('tap');
    if (n === "⌫" || n === "C") { currentPin = currentPin.slice(0, -1); }
    else if (n === "OK") { checkPin(); return; }
    else { if (currentPin.length < 4) currentPin += n; }

    const display = document.getElementById('pin-display');
    if (display) display.innerText = "*".repeat(currentPin.length) || "****";
}

let isQrProcessing = false;
async function startQR() {
    if (isQrProcessing) return;
    playSound('tap');
    const qrWrap = document.getElementById('qrWrapper');
    const scanBtn = document.getElementById('scanBtn');
    if (qrWrap) qrWrap.style.display = 'block';
    if (scanBtn) scanBtn.style.display = 'none';

    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    isQrProcessing = false;

    html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, async (decodedText) => {
        if (isQrProcessing) return; // 🔒 Çift ve peş peşe okumaları anında engelle
        if (decodedText.toUpperCase().includes("SHIFT")) {
            isQrProcessing = true; // 🔒 Anında kilitle
            playSound('success');
            try { await html5QrCode.stop(); } catch (e) { }
            if (qrWrap) qrWrap.style.display = 'none';
            const pinPad = document.getElementById('pin-pad');
            if (pinPad) pinPad.style.display = 'block';
            createNumPad();
            setTimeout(() => { isQrProcessing = false; }, 2000);
        }
    }).catch(err => {
        isQrProcessing = false;
        playSound('error');
        if (qrWrap) qrWrap.style.display = 'none';
        if (scanBtn) scanBtn.style.display = 'block';

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
    const clientUUID = getDeviceUUID();

    if (!pin) {
        playSound('error');
        return;
    }

    // 🔴 Supabase bağlantısı henüz hazır değilse bekle
    if (!_supabase) {
        document.getElementById('error-msg-body').innerHTML = `<b>⚠️ BAĞLANTI HATASI:</b><br><br>Sunucu bağlantısı henüz hazır değil. Lütfen birkaç saniye bekleyip tekrar deneyin.`;
        document.getElementById('error-modal').style.display = 'flex';
        currentPin = ""; document.getElementById('pin-display').innerText = "****";
        return;
    }

    let data, error;
    try {
        // 🔴 KRİTİK GÜVENLİK DÜZELTMESİ:
        // GET request (url parametresi) yerine RPC (Remote Procedure Call) kullanarak
        // POST request atıyoruz. Böylece PIN kodu ağ loglarında plaintext olarak gözükmüyor.
        ({ data, error } = await _supabase.rpc('verify_pin', {
            input_pin: pin,
            client_device_id: clientUUID
        }));
    } catch (e) {
        console.error('PIN doğrulama hatası (exception):', e);
        playSound('error');
        document.getElementById('main-card').classList.add('shake');
        setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
        currentPin = ""; document.getElementById('pin-display').innerText = "****";
        document.getElementById('error-msg-body').innerHTML = `<b>⚠️ BAĞLANTI HATASI:</b><br><br>Sunucu ile iletişim kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.<br><br>Hata: ${e.message || e}`;
        document.getElementById('error-modal').style.display = 'flex';
        return;
    }

    // Supabase'den gelen hata (ağ/RPC hatası)
    if (error) {
        console.error('Supabase RPC verify_pin hatası:', error);
        playSound('error');
        document.getElementById('main-card').classList.add('shake');
        setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
        currentPin = ""; document.getElementById('pin-display').innerText = "****";
        document.getElementById('error-msg-body').innerHTML = `<b>⚠️ SUNUCU HATASI:</b><br><br>${window.formatSupabaseErrorMessage(error)}`;
        document.getElementById('error-modal').style.display = 'flex';
        return;
    }

    if (data && data.success) {
        playSound('success');
        localStorage.setItem('temp_user_name', data.user_name);

        document.getElementById('pin-pad').style.display = 'none';
        document.getElementById('user-check-text').innerText = `MERHABA ${data.user_name.split(' ')[0].toLocaleUpperCase('tr-TR')}, GİRİŞ YAPAN SEN MİSİN?`;
        document.getElementById('confirm-box').style.display = 'block';

    } else if (data && data.error_type === 'device_mismatch') {
        playSound('error');
        document.getElementById('main-card').classList.add('shake');
        setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
        currentPin = ""; document.getElementById('pin-display').innerText = "****";

        document.getElementById('error-msg-body').innerHTML = `<b>⚠️ GÜVENLİK KİLİDİ (CİHAZ EŞLEŞME HATASI):</b><br><br>Bu PIN kodu daha önce başka bir telefon veya tarayıcı ile eşleştirilmiş!<br><br>💡 <b>Aynı telefonu kullanıyor olsanız bile</b>, tarayıcı geçmişini/önbelleğini temizlediğinizde veya uygulamayı silip yüklediğinizde cihaz kimliğiniz değişir.<br><br>🛠️ <b>ÇÖZÜM:</b> Lütfen yöneticinizden <b>Yönetici Paneli -> Personel Yönetimi</b> sekmesinden isminizin yanındaki <b>'📱 CİHAZ KİLİDİNİ AÇ'</b> butonuna basmasını talep ediniz. Ardından tekrar PIN girerek bu cihazı yeni cihazınız olarak tanımlayabilirsiniz.`;
        document.getElementById('error-modal').style.display = 'flex';
    } else {
        playSound('error');
        document.getElementById('main-card').classList.add('shake');
        setTimeout(() => document.getElementById('main-card').classList.remove('shake'), 300);
        currentPin = ""; document.getElementById('pin-display').innerText = "****";

        // Güvenlik: Hesap kilitlendi mi?
        if (data && (data.error_type === 'account_locked' || data.lockout)) {
            const minutes = data.locked_until_minutes || (data.remaining_seconds ? Math.ceil(data.remaining_seconds / 60) : 15);
            document.getElementById('error-msg-body').innerHTML = `<b>⛔ HESAP KİLİTLENDİ:</b><br><br>5 kez üst üste hatalı PIN girildiği için kilitlendi.<br><br>Lütfen <b>${minutes} dakika</b> sonra tekrar deneyin.`;
            document.getElementById('error-modal').style.display = 'flex';
        } else {
            const attemptsLeft = (data && data.attempts_left !== undefined) ? data.attempts_left : null;
            const attemptsInfo = attemptsLeft !== null ? `<br><br><span style="color:#f59e0b; font-weight:600; font-family:'Poppins';">⚠️ Kalan Hatalı Deneme Hakkı: ${attemptsLeft} / 5</span>` : '';
            document.getElementById('error-msg-body').innerHTML = `<b>❌ HATALI PIN KODU:</b><br><br>Girdiğiniz PIN kodu hatalı. Lütfen kontrol edip tekrar deneyiniz.${attemptsInfo}`;
            document.getElementById('error-modal').style.display = 'flex';
        }
    }
}

async function verifySuccess() {
    const fullName = localStorage.getItem('temp_user_name') || "PERSONEL";
    const clientUUID = getDeviceUUID();

    // Cihaz ID güncellemesine gerek yok, verify_pin SQL metodu cihazı otomatik kaydeder (Güvenli Backend-Side Binding)

    // 2. Push Bildirim Aboneliği (WhatsApp Tarzı Arka Plan Bildirimi İçin Kaydet)
    if (typeof window.initTerminalPushNotification === 'function') {
        window.initTerminalPushNotification(fullName);
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
    const okBtn = document.getElementById('final-ok-btn');
    if (okBtn) okBtn.disabled = true; // ÇİFT TIKLAMAYI ENGELLE

    if (isSyncingOffline) {
        console.log("🔄 Arka planda eşitleme sürüyor, ancak işleme devam ediliyor...");
    }
    window.isExecutingAction = true; // Realtime kanalı sinsi reload atmasın diye bayrak açıldı!
    const type = pendingType;
    const name = localStorage.getItem('shiftTurbo_user');

    let buluttakiSonDurum = window.ShiftTurboShared.getStatus(name);
    let cloudTime = 0;
    if (navigator.onLine) {
        try {
            const { data: myLogs, error: logError } = await _supabase
                .from('logs')
                .select('type, created_at')
                .eq('personel_name', name)
                .in('type', ['GİRİŞ', 'ÇIKIŞ'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (!logError && myLogs && myLogs.length > 0) {
                buluttakiSonDurum = myLogs[0].type;
                cloudTime = new Date(myLogs[0].created_at).getTime();
                window.ShiftTurboShared.setStatus(name, buluttakiSonDurum);
            }
        } catch (e) { console.warn("Supabase son durum çekilemedi:", e); }
    }

    // HİBRİT KONTROL: Çevrimdışı kuyrukta bu personele ait DAHA YENİ bir işlem var mı?
    const currentOfflineQueue = window.ShiftTurboShared.getObfuscated('shiftTurbo_offline_queue') || [];
    const personOfflineLogs = currentOfflineQueue.filter(item => item.personel_name === name);
    if (personOfflineLogs.length > 0) {
        const lastOfflineItem = personOfflineLogs[personOfflineLogs.length - 1];
        const offlineTime = new Date(lastOfflineItem.device_time || 0).getTime();
        if (offlineTime > cloudTime) {
            buluttakiSonDurum = lastOfflineItem.type;
            window.ShiftTurboShared.setStatus(name, buluttakiSonDurum);
            console.log(`⚡ Çevrimdışı kuyruktan daha yeni bir son durum algılandı: ${buluttakiSonDurum}`);
        }
    }

    if (type === 'ÇIKIŞ' && buluttakiSonDurum === 'ÇIKIŞ') {
        window.ShiftTurboShared.setStatus(name, 'ÇIKIŞ');
        playSound('error');
        document.getElementById('status').innerText = "❌ ZATEN ÇIKIŞ YAPILMIŞ!";

        // ANINDA GİZLE:
        window.resetToScanScreen();

        const errorMsgBody = document.getElementById('error-msg-body');
        const errorModal = document.getElementById('error-modal');
        if (errorMsgBody && errorModal) {
            errorMsgBody.innerHTML = `<b>⚠️ BİLGİLENDİRME (DAHA ÖNCEDEN ÇIKIŞ YAPILDI):</b><br><br>Sistem kayıtlarında zaten başarılı bir çıkış işleminiz bulunmaktadır.<br><br>Çıkış işleminiz daha önce merkeze iletilmiş ve güvence altına alınmıştır. Tekrar çıkış yapmanıza gerek yoktur.`;
            errorModal.style.display = 'flex';
        }
        try { speakAI("Sayın personel, sistemde daha önceden çıkış yaptınız. Çıkış kaydınız zaten mevcuttur.", "zaten_cikis_yapildi.mp3"); } catch (e) { }

        window.clearTerminalSession();

        setTimeout(() => {
            if (errorModal) errorModal.style.display = 'none';
            if (typeof window.resetToScanScreen === 'function') window.resetToScanScreen(); // QR okuma ekranına dön (otomatik kamera isteği iptal edildi)
        }, 5000);
        return;
    }

    if (type === 'GİRİŞ' && buluttakiSonDurum === 'GİRİŞ') {
        playSound('error');
        document.getElementById('status').innerText = "❌ ZATEN MESAİDESİNİZ!";

        // ANINDA GİZLE
        window.hideAllTerminalPanels();

        const errorMsgBody = document.getElementById('error-msg-body');
        const errorModal = document.getElementById('error-modal');
        if (errorMsgBody && errorModal) {
            errorMsgBody.innerHTML = `<b>⚠️ BİLGİLENDİRME (ZATEN MESAİDESİNİZ):</b><br><br>Sistem kayıtlarında zaten aktif bir mesai başlangıcınız bulunmaktadır.<br><br>Giriş işleminiz daha önce merkeze iletilmiştir. İyi çalışmalar dileriz.`;
            errorModal.style.display = 'flex';
        }
        try { speakAI("Sayın personel, sistemde zaten aktif bir mesai kaydınız bulunmaktadır.", "zaten_mesaidesiniz.mp3"); } catch (e) { }
        setTimeout(() => {
            if (errorModal) errorModal.style.display = 'none';
            location.reload();
        }, 5000);
        return;
    }

    document.getElementById('action-confirm').style.display = 'none';
    const statusEl = document.getElementById('status');
    statusEl.innerText = "🛰️ KONUM İŞLENİYOR...";

    const finalizeLocation = async (accuracy, lat, lon) => {
        console.log("Kullanılan Hassasiyet: " + accuracy + "m");

        if (!navigator.onLine) {
            console.log("⚠️ İnternet bağlantısı yok! Çevrimdışı mod devreye girdi.");

            // ÇEVRİMDIŞI ÇİFT KAYIT KORUMASI:
            // Çevrimdışıyken de yerel cache ve offline kuyruk üzerinden çifte kayıt engellenir.
            // Kişi başka bir terminalde işlem yapmış olabilir; bu terminal son bilinen durumu
            // yanlış tutuyorsa bu koruma son savunma hattıdır.
            if (type === 'ÇIKIŞ' && buluttakiSonDurum === 'ÇIKIŞ') {
                console.warn("🛑 ÇEVRİMDIŞI ÇIKIŞ ENGELLENDİ: Yerel cache zaten ÇIKIŞ gösteriyor.");
                playSound('error');

                window.resetToScanScreen();

                const errorMsgBodyOff = document.getElementById('error-msg-body');
                const errorModalOff = document.getElementById('error-modal');
                if (errorMsgBodyOff && errorModalOff) {
                    errorMsgBodyOff.innerHTML = `<b>⚠️ BİLGİLENDİRME (DAHA ÖNCEDEN ÇIKIŞ YAPILDI):</b><br><br>Cihazın yerel kayıtlarında zaten bir çıkış işlemi bulunmaktadır.<br><br>İnternet bağlantısı olmadığından bulut doğrulaması yapılamıyor. Bağlantı sağlandığında sistem otomatik eşitlenecektir.<br><br>Tekrar çıkış kaydı oluşturulmadı.`;
                    errorModalOff.style.display = 'flex';
                }
                try { speakAI("Sayın personel, cihaz kayıtlarında zaten bir çıkış işlemi bulunmaktadır.", "zaten_cikis_yapildi.mp3"); } catch (e) { }

                window.clearTerminalSession();

                setTimeout(() => {
                    if (errorModalOff) errorModalOff.style.display = 'none';
                    if (typeof window.resetToScanScreen === 'function') window.resetToScanScreen();
                }, 5000);
                return;
            }

            if (type === 'GİRİŞ' && buluttakiSonDurum === 'GİRİŞ') {
                console.warn("🛑 ÇEVRİMDIŞI GİRİŞ ENGELLENDİ: Yerel cache zaten GİRİŞ gösteriyor.");
                playSound('error');

                window.hideAllTerminalPanels();

                const errorMsgBodyOff2 = document.getElementById('error-msg-body');
                const errorModalOff2 = document.getElementById('error-modal');
                if (errorMsgBodyOff2 && errorModalOff2) {
                    errorMsgBodyOff2.innerHTML = `<b>⚠️ BİLGİLENDİRME (ZATEN MESAİDESİNİZ):</b><br><br>Cihazın yerel kayıtlarında zaten aktif bir mesai başlangıcınız bulunmaktadır.<br><br>İnternet bağlantısı olmadığından bulut doğrulaması yapılamıyor. Bağlantı sağlandığında sistem otomatik eşitlenecektir.`;
                    errorModalOff2.style.display = 'flex';
                }
                try { speakAI("Sayın personel, cihaz kayıtlarında zaten aktif bir mesai kaydınız bulunmaktadır.", "zaten_mesaidesiniz.mp3"); } catch (e) { }
                setTimeout(() => {
                    if (errorModalOff2) errorModalOff2.style.display = 'none';
                    location.reload();
                }, 5000);
                return;
            }

            console.log("✅ Çevrimdışı işlem onaylandı, kuyruğa alınıyor...");
            playSound('success');

            const currentBizId = localStorage.getItem('shiftTurbo_business_id') || window.currentBusinessId || null;
            const offlineRecord = {
                offline_id: 'off_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
                personel_name: name,
                type: type,
                lat: lat,
                lon: lon,
                mahalle: `DOĞRULUK: ${Math.round(accuracy)}m (⚡ Çevrimdışı)`,
                device_time: new Date().toISOString(),
                business_id: currentBizId,
                is_offline_sync: true
            };
            offlineQueue.push(offlineRecord);
            window.ShiftTurboShared.setObfuscated('shiftTurbo_offline_queue', offlineQueue);
            window.ShiftTurboShared.setStatus(name, type);

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
                    window.resetToScanScreen();
                    window.clearTerminalSession();
                    window.location.replace(window.location.pathname + '?reset=' + Date.now());
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
            } catch (e) { console.warn("TTS Error:", e); }

            // Sesin doğal olarak bitmesini bekle; 20 saniyelik güvenlik sınırı yalnız acil durumlarda devreye girer.
            setTimeout(performFinalRedirect, 20000);
            return;
        }

        await ensureSupabaseClient();

        if (!_supabase) {
            playSound('error');
            statusEl.innerText = "❌ BAGLANTI HATASI";
            document.getElementById('error-msg-body').innerHTML = "Veritabanı bağlantısı henüz başlatılamadı. Lütfen sayfayı yenileyiniz veya tekrar deneyiniz.";
            document.getElementById('error-modal').style.display = 'flex';
            return;
        }

        const currentBizId = localStorage.getItem('shiftTurbo_business_id') || window.currentBusinessId || null;
        let error = null;
        let rpcSuccess = false;

        try {
            const { data: rpcRes, error: rpcErr } = await _supabase.rpc('submit_shift_log', {
                p_personel_name: name,
                p_type: type,
                p_lat: lat,
                p_lon: lon,
                p_accuracy: accuracy,
                p_business_id: (currentBizId && currentBizId !== 'default') ? currentBizId : null
            });

            if (!rpcErr && rpcRes && rpcRes.success) {
                rpcSuccess = true;
                console.log("✅ Sunucu taraflı RPC (submit_shift_log) ile log başarıyla kaydedildi:", rpcRes);
            }
        } catch (e) {
            console.warn("RPC submit_shift_log istisnası, standart insert ile devam ediliyor:", e);
        }

        if (!rpcSuccess) {
            const insertPayload = {
                personel_name: name,
                type: type,
                lat: lat,
                lon: lon,
                mahalle: `DOĞRULUK: ${Math.round(accuracy)}m`
            };
            if (currentBizId && currentBizId !== 'default') {
                insertPayload.business_id = currentBizId;
            }
            const { error: directErr } = await _supabase.from('logs').insert([insertPayload]);
            error = directErr;
        }

        if (error) {
            playSound('error');
            statusEl.innerText = "❌ VERİTABANI HATASI";
            document.getElementById('error-msg-body').innerHTML = window.formatSupabaseErrorMessage(error);
            document.getElementById('error-modal').style.display = 'flex';
        } else {
            window.ShiftTurboShared.setStatus(name, type);
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
                    window.resetToScanScreen();
                    window.clearTerminalSession();
                    window.location.replace(window.location.pathname + '?reset=' + Date.now());
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
            } catch (e) { console.warn("TTS Error:", e); }

            // Sesin doğal olarak bitmesini bekle; 20 saniyelik güvenlik sınırı yalnız acil durumlarda devreye girer.
            setTimeout(performFinalRedirect, 20000);
        }
    };

    if (window.bgLocation && window.bgLocation.accuracy <= 100) {
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
            const offlineQueue = window.ShiftTurboShared.getObfuscated('shiftTurbo_offline_queue') || [];
            offlineQueue.push({
                offline_id: 'off_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
                personel_name: user,
                type: 'MESAJ',
                mahalle: msg + " (⚡ Çevrimdışı)",
                lat: lat, lon: lon,
                device_time: new Date().toISOString(),
                is_offline_sync: true
            });
            window.ShiftTurboShared.setObfuscated('shiftTurbo_offline_queue', offlineQueue);
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

    if (navigator.geolocation) {
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
                localStorage.removeItem('temp_user_pin');

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

        let lastAction = window.ShiftTurboShared.getStatus(user);
        let cloudTime = 0;
        let activeShiftStartTime = 0;
        if (navigator.onLine) {
            try {
                const { data: myLogs, error: logError } = await _supabase
                    .from('logs')
                    .select('type, created_at')
                    .eq('personel_name', user)
                    .in('type', ['GİRİŞ', 'ÇIKIŞ'])
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (!logError && myLogs && myLogs.length > 0) {
                    lastAction = myLogs[0].type;
                    cloudTime = new Date(myLogs[0].created_at).getTime();
                    if (lastAction === 'GİRİŞ') activeShiftStartTime = cloudTime;
                    window.ShiftTurboShared.setStatus(user, lastAction);
                }
            } catch (e) { console.warn("Supabase buton durumu çekilemedi:", e); }
        }

        // HİBRİT KONTROL: Çevrimdışı kuyrukta bu personele ait DAHA YENİ bir işlem var mı?
        const currentOfflineQueue = window.ShiftTurboShared.getObfuscated('shiftTurbo_offline_queue') || [];
        const personOfflineLogs = currentOfflineQueue.filter(item => item.personel_name === user);
        if (personOfflineLogs.length > 0) {
            const lastOfflineItem = personOfflineLogs[personOfflineLogs.length - 1];
            const offlineTime = new Date(lastOfflineItem.device_time || 0).getTime();
            if (offlineTime > cloudTime) {
                lastAction = lastOfflineItem.type;
                if (lastAction === 'GİRİŞ') activeShiftStartTime = offlineTime;
                window.ShiftTurboShared.setStatus(user, lastAction);
                console.log(`⚡ Çevrimdışı kuyruktan daha yeni bir buton durumu algılandı: ${lastAction}`);
            }
        }

        if (lastAction === 'GİRİŞ') {
            document.getElementById('status-bar').style.width = "100%";
            document.getElementById('greeting').innerText = "SYSTEM ACTIVE / " + user.toUpperCase();

            const startTimeStr = activeShiftStartTime > 0 ? new Date(activeShiftStartTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Bilinmiyor';

            mainActions.innerHTML = `
                <div id="live-shift-status" style="background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.3); border-radius: 12px; padding: 15px; margin-bottom: 20px; text-align: left; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                    <div style="font-weight: bold; color: #2ecc71; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(46, 204, 113, 0.2); padding-bottom: 8px;">
                        <span style="width: 10px; height: 10px; background: #2ecc71; border-radius: 50%; display: inline-block; animation: pulse 2s infinite;"></span>
                        MESAİ AKTİF — ${user.toUpperCase()}
                    </div>
                    <div id="live-shift-score-container" style="font-size: 13px; color: #cbd5e1; margin-bottom: 8px; display: flex; align-items: center;">
                        <svg style="width: 14px; height: 14px; fill: none; stroke: #cbd5e1; stroke-width: 2; display: inline-block; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Puan Hesaplanıyor...
                    </div>
                    <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 8px; display: flex; align-items: center;">
                        <svg style="width: 14px; height: 14px; fill: none; stroke: #94a3b8; stroke-width: 2; display: inline-block; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Giriş Saati: <span style="font-weight: bold; color: #fff; margin-left: 4px;">${startTimeStr}</span>
                    </div>
                    <div style="font-size: 13px; color: #cbd5e1; display: flex; align-items: center;">
                        <svg style="width: 14px; height: 14px; fill: none; stroke: #94a3b8; stroke-width: 2; display: inline-block; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83"/></svg> Geçen Süre: <span id="live-shift-duration" style="font-weight: bold; color: #fff; margin-left: 4px;">Hesaplanıyor...</span>
                    </div>
                </div>
                <button class="btn-out" onclick="requestConfirm('ÇIKIŞ')" style="display:flex;align-items:center;justify-content:center;gap:6px;">
                    <svg style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.5; display: inline-block; vertical-align: middle;" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg> MESAİ BİTİR
                </button>
                <button class="btn-out btn-mini" onclick="if(window.liveShiftTimer) clearInterval(window.liveShiftTimer); localStorage.removeItem('shiftTurbo_user'); localStorage.removeItem('auth_active'); localStorage.removeItem('isShiftActive'); localStorage.removeItem('temp_user_name'); localStorage.removeItem('temp_user_pin'); window.location.replace(window.location.pathname + '?reset=' + Date.now());" style="background: #334155; margin-top: 15px; font-family: 'Poppins', sans-serif; font-weight: bold; letter-spacing: 1px;">🔄 ANA EKRANA DÖN</button>
            `;

            if (window.liveShiftTimer) clearInterval(window.liveShiftTimer);
            if (activeShiftStartTime > 0) {
                const updateTicker = () => {
                    const durEl = document.getElementById('live-shift-duration');
                    if (!durEl) { clearInterval(window.liveShiftTimer); return; }
                    let diffMs = new Date().getTime() - activeShiftStartTime;
                    if (diffMs < 0) diffMs = 0;
                    const h = Math.floor(diffMs / 3600000).toString().padStart(2, '0');
                    const m = Math.floor((diffMs % 3600000) / 60000).toString().padStart(2, '0');
                    const s = Math.floor((diffMs % 60000) / 1000).toString().padStart(2, '0');
                    durEl.innerText = `${h} Saat ${m} Dakika ${s} Saniye`;
                };
                updateTicker();
                window.liveShiftTimer = setInterval(updateTicker, 1000);
            }
        } else {
            document.getElementById('status-bar').style.width = "50%";
            document.getElementById('greeting').innerText = "SYSTEM READY / " + user.toUpperCase();
            mainActions.innerHTML = `
                <button class="btn-in" onclick="requestConfirm('GİRİŞ')">MESAİ BAŞLAT</button>
                <button class="btn-out btn-mini" onclick="localStorage.removeItem('shiftTurbo_user'); localStorage.removeItem('auth_active'); localStorage.removeItem('isShiftActive'); localStorage.removeItem('temp_user_name'); localStorage.removeItem('temp_user_pin'); window.location.replace(window.location.pathname + '?reset=' + Date.now());" style="background: #334155; margin-top: 15px; font-family: 'Poppins', sans-serif; font-weight: bold; letter-spacing: 1px;">🔄 ANA EKRANA DÖN</button>
            `;
        }

        // 🎮 OYUNLAŞTIRMA (GAMIFICATION) VE ROZET HESAPLAMA MOTORU
        try {
            // İşletme ayarlarını çek (Supabase + localStorage fallback)
            try {
                const bizId = localStorage.getItem('shiftTurbo_business_id') || 'default';
                const cachedSettings = localStorage.getItem('shiftTurbo_business_settings_' + bizId);
                if (cachedSettings) {
                    window.currentBusinessSettings = JSON.parse(cachedSettings);
                }
                if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
                    let qB = _supabase.from('business_settings').select('*');
                    if (bizId && bizId !== 'default') qB = qB.eq('business_id', bizId);
                    const { data: bData } = await qB;
                    if (bData && bData.length > 0) {
                        window.currentBusinessSettings = bData[0];
                        localStorage.setItem('shiftTurbo_business_settings_' + bizId, JSON.stringify(bData[0]));
                    }
                }
            } catch (e) { console.warn("business_settings fetch error in terminal.js:", e); }

            const allStoreLogs = await window.ShiftTurboShared.syncLogs(_supabase);
            if (allStoreLogs && allStoreLogs.length > 0) {
                const staffNames = [...new Set(allStoreLogs.map(l => l.personel_name || l.personel))].filter(Boolean);
                let bestStaffName = "";
                let maxScore = -1;
                let currentUserScore = 100;
                let currentUserHasViolation = false;

                staffNames.forEach(pName => {
                    let pScore = window.calculateScore(pName, allStoreLogs);
                    let pViolation = false;
                    // Konum ihlali kontrolü (rozet hesabı için)
                    const pLogs = allStoreLogs
                        .filter(l => ((l.personel_name || l.personel || "").trim().toLocaleUpperCase('tr-TR') === (pName || "").trim().toLocaleUpperCase('tr-TR')));
                    pLogs.forEach(l => {
                        if (l.mahalle && l.mahalle.includes('DOĞRULUK:')) {
                            const match = l.mahalle.match(/DOĞRULUK:\s*(\d+)m/);
                            if (match && parseInt(match[1]) > 400) { pViolation = true; }
                        }
                    });

                    if (pScore > maxScore) { maxScore = pScore; bestStaffName = pName; }
                    if (pName.toLocaleUpperCase('tr-TR') === user.toLocaleUpperCase('tr-TR')) { currentUserScore = pScore; currentUserHasViolation = pViolation; }
                });

                const badgesBox = document.getElementById('badges-container');
                const msgBox = document.getElementById('gamification-msg');
                const gCard = document.getElementById('gamification-card');

                if (badgesBox && msgBox && gCard) {
                    let badgesHtml = "";
                    let gMsg = "";

                    const liveScoreBox = document.getElementById('live-shift-score-container');
                    if (liveScoreBox) {
                        const thresh = window.currentBusinessSettings?.performance_threshold || 98;
                        let scoreHtml = `<svg style="width: 14px; height: 14px; fill: none; stroke: #cbd5e1; stroke-width: 2; display: inline-block; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> DİSİPLİN PUANI: <span style="color:#fff; font-weight:bold; margin-left: 4px;">${currentUserScore} Puan</span>`;
                        if (currentUserScore >= thresh) {
                            scoreHtml += ` <span style="color:#fbbf24; font-weight:bold; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;"><svg style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; display: inline-block; vertical-align: middle;" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z"/></svg> Performans Primli</span>`;
                        }
                        liveScoreBox.innerHTML = scoreHtml;
                    }

                    if (currentUserScore >= 95) {
                        badgesHtml += `<span style="color: #cbd5e1; font-family: 'Poppins', sans-serif; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; margin-right: 18px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block; margin-right: 8px; box-shadow: 0 0 6px #10b981;"></span>Üstün Başarı</span>`;
                        gMsg = `<b>Yüksek Performans:</b> Operasyonel verimlilik puanınız ${currentUserScore}. Gösterdiğiniz üstün devamlılık ve disiplin için teşekkür ederiz.`;
                    } else if (currentUserScore >= 80) {
                        gMsg = `<b>İstikrarlı Performans:</b> Verimlilik puanınız ${currentUserScore}. Operasyonel standartlara uyumunuz için teşekkür ederiz.`;
                    } else {
                        gMsg = `<b>Gelişim Beklenen Performans:</b> Verimlilik puanınız ${currentUserScore}. Mesai başlangıçlarına ve konum hassasiyetine dikkat ederek puanınızı yükseltebilirsiniz.`;
                    }

                    if (!currentUserHasViolation) {
                        badgesHtml += `<span style="color: #cbd5e1; font-family: 'Poppins', sans-serif; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; margin-right: 18px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; display: inline-block; margin-right: 8px; box-shadow: 0 0 6px #3b82f6;"></span>Tam Uyum</span>`;
                    }

                    if (bestStaffName.toLocaleUpperCase('tr-TR') === user.toLocaleUpperCase('tr-TR') && currentUserScore >= 90) {
                        badgesHtml += `<span style="color: #f59e0b; font-family: 'Poppins', sans-serif; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; margin-right: 18px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; display: inline-block; margin-right: 8px; box-shadow: 0 0 6px #f59e0b;"></span>Ayın Personeli</span>`;
                        gMsg += `<br><br><b>Tebrikler:</b> Bu ay mağazadaki en yüksek operasyonel puana sahipsiniz. Başarılarınızın devamını dileriz.`;
                    }

                    if (!badgesHtml) badgesHtml = `<span style="color:#64748b; font-size:11px; font-family:'Poppins', sans-serif;">Henüz değerlendirme kriteri oluşmadı.</span>`;

                    badgesBox.innerHTML = badgesHtml;
                    msgBox.innerHTML = gMsg;
                    gCard.style.display = 'block';
                }
            }
        } catch (e) { console.warn("Gamification Error:", e); }
    } else {
        if (scanBtn) scanBtn.style.display = 'block';
    }

    if (typeof updateTime === "function") {
        updateTime(); setInterval(updateTime, 1000);
    }

    const currentUserForRealtime = localStorage.getItem('shiftTurbo_user');
    if (currentUserForRealtime && auth) {
        _supabase.channel('db-changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, payload => {
            if (payload && payload.new) {
                const pName1 = (payload.new.personel_name || "").trim().toLocaleUpperCase('tr-TR');
                const pName2 = (payload.new.personel || "").trim().toLocaleUpperCase('tr-TR');
                const me = (currentUserForRealtime || "").trim().toLocaleUpperCase('tr-TR');
                if (pName1 !== me && pName2 !== me) return;
            } else {
                return;
            }
            if (window.isExecutingAction) return; // Anons çalıyorsa sinsi reload atma!

            if (payload && payload.new && payload.new.type === 'ÇIKIŞ') {
                console.log("⚠️ Uzaktan YÖNETİCİ tarafından ÇIKIŞ işlemi algılandı! Oturum kapatılıyor...");
                if (currentUserForRealtime) window.ShiftTurboShared.setStatus(currentUserForRealtime, 'ÇIKIŞ');
                if (typeof playSound === 'function') playSound('error');

                window.resetToScanScreen();
                window.clearTerminalSession();

                const errorMsgBody = document.getElementById('error-msg-body');
                const errorModal = document.getElementById('error-modal');
                if (errorMsgBody && errorModal) {
                    errorMsgBody.innerHTML = `<b>⚠️ BİLGİLENDİRME (MESAİ SONLANDIRILDI):</b><br><br>Mesainiz <b>Yönetici</b> tarafından uzaktan başarıyla sonlandırılmıştır.<br><br>Çıkış kaydınız merkeze iletilmiş ve güvence altına alınmıştır. İyi istirahatler dileriz.`;
                    errorModal.style.display = 'flex';
                }
                try { speakAI("Sayın personel, mesainiz yönetici tarafından uzaktan sonlandırılmıştır. İyi istirahatler dileriz.", "yonetici_sonlandirdi.mp3"); } catch (e) { }

                setTimeout(() => {
                    if (errorModal) errorModal.style.display = 'none';
                    if (typeof window.resetToScanScreen === 'function') window.resetToScanScreen(); // QR okuma ekranına dön (otomatik kamera isteği iptal edildi)
                    else window.location.replace(window.location.pathname + '?reset=' + Date.now());
                }, 5000);
                return;
            }

            // Eğer yönetici Giriş yaparsa (nadiren olur)
            location.reload();
        }).subscribe();
        _supabase.channel('broadcast-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, payload => { fetchLatestBroadcast(); }).subscribe();

        fetchLatestBroadcast(); setInterval(fetchLatestBroadcast, 30000);

        // 📱 Android & iOS (iPhone) ekran uyanma ve sekmeye dönme dinleyicisi
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) fetchLatestBroadcast();
        });
        window.addEventListener('focus', () => fetchLatestBroadcast());
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

function showInAppBroadcastToast(msg) {
    let toast = document.getElementById('inapp-broadcast-toast');
    if (toast) toast.remove();

    toast = document.createElement('div');
    toast.id = 'inapp-broadcast-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 20px;
        left: 20px;
        max-width: 460px;
        margin: 0 auto;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
        border: 2px solid #f48120;
        box-shadow: 0 10px 30px rgba(244, 129, 32, 0.5), 0 0 25px rgba(0,0,0,0.9);
        border-radius: 16px;
        padding: 16px 20px;
        z-index: 999999;
        color: #fff;
        font-family: 'Poppins', sans-serif;
        display: flex;
        align-items: center;
        gap: 15px;
        backdrop-filter: blur(15px);
        transition: all 0.4s ease;
    `;
    toast.innerHTML = `
        <div style="font-size: 28px; line-height: 1; flex-shrink: 0;">📢</div>
        <div style="flex: 1; min-width: 0;">
            <div style="font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 900; color: #f48120; letter-spacing: 1.5px; margin-bottom: 4px;">YENİ DUYURU</div>
            <div style="font-size: 13px; font-weight: 600; color: #f8fafc; line-height: 1.4; word-break: break-word;">${msg}</div>
        </div>
        <button onclick="this.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.remove(), 400);" style="background: rgba(255,255,255,0.1); border: none; color: #94a3b8; font-size: 16px; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">✕</button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast && toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 400);
        }
    }, 10000);
}

async function fetchLatestBroadcast() {
    const user = localStorage.getItem('shiftTurbo_user');

    try {
        const businessId = localStorage.getItem('shiftTurbo_business_id');
        let query = _supabase.from('broadcasts').select('id, message').order('created_at', { ascending: false });
        if (businessId) {
            query = query.or(`business_id.eq.${businessId},business_id.is.null`);
        }
        const { data } = await query;
        if (data && data.length > 0) {
            let matchedMsg = null;
            let matchedId = null;

            // En yeni duyurudan eskiye doğru tara: Kullanıcıya uygun İLK duyuruyu al (Genel [ALL] veya Kişiye Özel)
            for (let b of data) {
                let m = b.message || "";
                if (m.match(/^\[(.*?)\]\s*(.*)/)) {
                    const match = m.match(/^\[(.*?)\]\s*(.*)/);
                    const target = match[1].trim().toLocaleUpperCase('tr-TR');
                    const content = match[2];

                    if (target === 'ALL') {
                        matchedMsg = content;
                        matchedId = b.id;
                        break;
                    } else if (user && target === user.trim().toLocaleUpperCase('tr-TR')) {
                        matchedMsg = "👤 ÖZEL BİLDİRİM: " + content;
                        matchedId = b.id;
                        break;
                    }
                } else {
                    matchedMsg = m;
                    matchedId = b.id;
                    break;
                }
            }

            if (matchedMsg) {
                const textEl = document.getElementById('broadcast-text');
                const bannerEl = document.getElementById('broadcast-banner');
                if (textEl) textEl.innerText = matchedMsg;
                if (bannerEl) bannerEl.style.display = 'block';
                document.body.style.paddingTop = "35px";

                // Yeni Duyuru Algılama (Ses + Ekran İçi Toast + Sistem Push)
                const lastSeen = localStorage.getItem('last_seen_broadcast_id');
                if (matchedId && String(matchedId) !== String(lastSeen)) {
                    localStorage.setItem('last_seen_broadcast_id', String(matchedId));

                    // Sesli Uyarı
                    if (typeof playSound === 'function') {
                        try { playSound('success'); } catch (e) { }
                    }

                    // Ekran İçi Görsel Pop-up (Toast)
                    showInAppBroadcastToast(matchedMsg);

                    // Android & iOS Service Worker Bildirimi
                    if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
                        navigator.serviceWorker.ready.then(reg => {
                            reg.showNotification('📢 ShiftTurbo Duyurusu', {
                                body: matchedMsg,
                                icon: './logom.png',
                                badge: './logom.png',
                                tag: 'shift-turbo-broadcast-' + matchedId,
                                data: { url: '/index.html' }
                            });
                        }).catch(() => { });
                    }
                }
            } else {
                const bannerEl = document.getElementById('broadcast-banner');
                if (bannerEl) bannerEl.style.display = 'none';
                document.body.style.paddingTop = "0";
            }
        } else {
            const textEl = document.getElementById('broadcast-text');
            const bannerEl = document.getElementById('broadcast-banner');
            if (textEl) textEl.innerText = "";
            if (bannerEl) bannerEl.style.display = 'none';
            document.body.style.paddingTop = "0";
        }
    } catch (e) { console.log("Duyuru çekilemedi:", e); }
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
