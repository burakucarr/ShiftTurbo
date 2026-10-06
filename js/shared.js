/* ============================================
   🔧 SHIFTURBO — SHARED UTILITIES (shared.js)
   Terminal ve Yönetici panellerinin ortak kullandığı
   tekrarlı fonksiyonları tek noktadan yönetir.
   ============================================ */

// ──────────────────────────────────────────────
// 0. TÜRKÇE HATA DÖNÜŞTÜRÜCÜ (Supabase & Ağ Hataları)
// ──────────────────────────────────────────────

/**
 * Supabase ve veritabanı hatalarını anlaşılır Türkçe mesajlara dönüştürür.
 * @param {object|string} error - Hata nesnesi veya metni
 * @returns {string} Türkçe anlaşılır hata mesajı
 */
window.formatSupabaseErrorMessage = function(error) {
    if (!error) return "Bilinmeyen bir sunucu hatası oluştu.";
    
    const msg = typeof error === 'string' ? error : (error.message || error.details || error.hint || JSON.stringify(error));
    const code = (error && error.code) ? String(error.code) : '';

    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Fetch error')) {
        return "🌐 İNTERNET BAĞLANTISI KOPTU: Sunucuya ulaşılamıyor. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.";
    }
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        return "🔑 GİRİŞ BAŞARISIZ: E-posta adresi veya şifreniz hatalı. Lütfen bilgilerinizi kontrol ediniz.";
    }
    if (msg.includes('Email not confirmed')) {
        return "📧 E-POSTA ONAYLANMAMIŞ: Lütfen e-posta adresinize gelen doğrulama bağlantısına tıklayınız.";
    }
    if (msg.includes('Password should be at least')) {
        return "🔒 ŞİFRE ÇOK KISA: Şifreniz en az 6 karakter olmalıdır.";
    }
    if (msg.includes('User already registered') || msg.includes('already exists')) {
        return "⚠️ KAYITLI KULLANICI: Bu kayıt sistemde zaten mevcut.";
    }
    if (msg.includes('row-level security') || code === '42501') {
        return "🛡️ ERİŞİM YETKİ KISITLAMASI: Bu işlemi yapmak için gerekli veritabanı izinleriniz bulunmuyor.";
    }
    if (code === '23505' || msg.includes('unique constraint')) {
        return "⚠️ MÜKERRER KAYIT: Bu kayıt sistemde zaten mevcut.";
    }
    if (msg.includes('apikey') || msg.includes('JWT') || msg.includes('invalid claim')) {
        return "🔐 OTURUM ZAMAN AŞIMI: Oturum anahtarınızın süresi doldu. Lütfen sayfayı yenileyip tekrar giriş yapınız.";
    }
    if (msg.includes('timeout') || msg.includes('Timed out')) {
        return "⏱️ ZAMAN AŞIMI: Sunucu yanıt vermekte gecikti. Lütfen tekrar deneyiniz.";
    }

    return `⚠️ SUNUCU HATASI: ${msg.replace(/PGRST\d+/g, '').replace(/JWT/g, 'Oturum').trim()}`;
};

// ──────────────────────────────────────────────
// 1. SUPABASE BAĞLANTI FONKSİYONLARI
// ──────────────────────────────────────────────

/**
 * Supabase client bağlantısını test eder.
 * @param {object} client - Supabase client instance
 * @returns {Promise<boolean>} Bağlantı başarılıysa true
 */
async function _sharedTestSupabaseClient(client) {
    try {
        const { error } = await client.from('logs').select('id').limit(1);
        return !error;
    } catch (e) {
        console.warn('Supabase bağlantı testi başarısız:', e);
        return false;
    }
}

/**
 * Supabase client'ı başlatır. Önce proxy, sonra doğrudan bağlantı dener.
 * @param {string} proxyUrl - Proxy worker URL'i
 * @param {object|null} localConfig - { supabaseUrl, supabaseKey } veya null
 * @returns {Promise<{client: object|null, type: string}>}
 */
async function _sharedInitSupabaseClient(proxyUrl, localConfig) {
    if (typeof supabase === 'undefined') {
        console.warn("⚠️ Supabase CDN yüklenemedi! Çevrimdışı mod devrede.");
        return { client: null, type: 'none' };
    }

    // Supabase Auth Token'ını maskelemek için özel depolama adaptörü
    const obfuscatedStorage = {
        getItem: (key) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            try {
                // Eşleşen maskeli veriyi çöz
                return decodeURIComponent(atob(raw).split('').map(c => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
            } catch (e) {
                // Maskelenmemiş eski düz metin veri ise doğrudan döndür (geriye dönük uyumluluk)
                return raw;
            }
        },
        setItem: (key, value) => {
            try {
                const obfuscated = btoa(encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (match, p1) => {
                    return String.fromCharCode(parseInt(p1, 16));
                }));
                localStorage.setItem(key, obfuscated);
            } catch (e) {
                localStorage.setItem(key, value);
            }
        },
        removeItem: (key) => {
            localStorage.removeItem(key);
        }
    };

    const proxyClient = supabase.createClient(proxyUrl, 'proxy-authenticated', {
        auth: {
            storage: obfuscatedStorage,
            persistSession: true,
            autoRefreshToken: true
        }
    });
    if (await _sharedTestSupabaseClient(proxyClient)) {
        return { client: proxyClient, type: 'proxy' };
    }

    if (localConfig) {
        const directClient = supabase.createClient(localConfig.supabaseUrl, localConfig.supabaseKey, {
            auth: {
                storage: obfuscatedStorage,
                persistSession: true,
                autoRefreshToken: true
            }
        });
        if (await _sharedTestSupabaseClient(directClient)) {
            console.warn('Proxy bağlantısı başarısız oldu, doğrudan Supabase anahtarı kullanılıyor.');
            return { client: directClient, type: 'direct' };
        }
    }

    console.error('Supabase bağlantısı kurulamadı. Lütfen proxy / config.js yapılandırmasını kontrol edin.');
    return { client: proxyClient, type: 'proxy' };
}

// ──────────────────────────────────────────────
// 2. PUANLAMA MOTORU (calculateScore)
// ──────────────────────────────────────────────

/**
 * Personel performans puanını hesaplar.
 * @param {string} personName - Personel adı
 * @param {Array} [logsArray] - Log dizisi (verilmezse window.allLogs kullanılır)
 * @returns {number} 10-100 arası puan
 */
window.calculateScore = function (personName, logsArray) {
    let logs = logsArray || window.allLogs || [];
    let score = 100;
    if (!logs || logs.length === 0) return score;

    // Her zaman içinde bulunulan ayın loglarına göre puan hesapla (Terminalde ve Yöneticide aynı sonucu üret!)
    if (logs.length > 0) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        logs = logs.filter(l => {
            const logDate = new Date(l.raw_time || l.created_at);
            return logDate >= startOfMonth;
        });
    }

    const bSettings = window.currentBusinessSettings || {
        overtime_penalty_points: 6,
        location_penalty_points: 4,
        loyalty_bonus_points: 2,
        loyalty_bonus_interval: 5,
        max_shift_hours: 10.5,
        max_distance_meters: 400
    };

    // Mükerrer/çifte kayıtları tekilleştirerek her iki ekranda da aynı ham veri setini kullanmasını sağla
    const cleanLogs = [];
    const seen = new Set();
    logs.forEach(l => {
        const pName = (l.personel_name || l.personel || "").trim().toLocaleUpperCase('tr-TR');
        const timeVal = l.raw_time || l.created_at;
        const timeKey = l.type === 'MESAJ' ? `msg-${l.id}` : `${pName}-${timeVal}`;
        if (!seen.has(timeKey)) {
            cleanLogs.push(l);
            seen.add(timeKey);
        }
    });

    const pLogs = cleanLogs
        .filter(l => {
            const name = (l.personel_name || l.personel || "").trim().toLocaleUpperCase('tr-TR');
            return name === (personName || "").trim().toLocaleUpperCase('tr-TR');
        })
        .sort((a, b) => new Date(a.raw_time || a.created_at) - new Date(b.raw_time || b.created_at));

    if (pLogs.length === 0) return score;

    const maxHours = bSettings.max_shift_hours || window.maxShiftHours || 10.5;
    const otPenalty = bSettings.overtime_penalty_points !== undefined ? bSettings.overtime_penalty_points : 6;
    const locPenalty = bSettings.location_penalty_points !== undefined ? bSettings.location_penalty_points : 4;
    const bonusPts = bSettings.loyalty_bonus_points !== undefined ? bSettings.loyalty_bonus_points : 2;
    const bonusInterval = bSettings.loyalty_bonus_interval || 5;
    const maxDist = bSettings.max_distance_meters || 400;

    for (let i = 0; i < pLogs.length; i++) {
        if (pLogs[i].type === 'GİRİŞ') {
            const girisZamani = new Date(pLogs[i].raw_time || pLogs[i].created_at);
            let cikisLogu = null;
            for (let j = i + 1; j < pLogs.length; j++) {
                if (pLogs[j].type === 'ÇIKIŞ') { cikisLogu = pLogs[j]; break; }
            }
            let bitisZamani = cikisLogu ? new Date(cikisLogu.raw_time || cikisLogu.created_at) : new Date();
            let saatFarki = (bitisZamani - girisZamani) / 3600000;
            if (saatFarki > maxHours) {
                if (!pLogs[i].is_overtime_approved) {
                    score -= otPenalty;
                }
            }
        }
    }

    pLogs.forEach(log => {
        if (log.mahalle && (log.mahalle.includes('SINIR DIŞI') || (log.mahalle.includes('DOĞRULUK:') && log.mahalle.match(/DOĞRULUK:\s*(\d+)m/) && parseInt(log.mahalle.match(/DOĞRULUK:\s*(\d+)m/)[1]) > maxDist))) {
            score -= locPenalty;
        }
    });

    if (bonusInterval > 0) {
        score += Math.floor(pLogs.length / bonusInterval) * bonusPts;
    }

    return Math.min(Math.max(score, 10), 100);
};

// ──────────────────────────────────────────────
// 3. TERMİNAL OTURUM TEMİZLEME YARDIMCILARI
// ──────────────────────────────────────────────

/**
 * Terminal panellerini gizler (tüm UI elementlerini kapatır).
 */
window.hideAllTerminalPanels = function () {
    ['main-actions', 'confirm-box', 'pin-pad', 'gamification-card', 'action-confirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

/**
 * Terminal ekranını QR tarama durumuna döndürür.
 * Panelleri gizler, greeting'i sıfırlar, scanBtn'i gösterir.
 */
window.resetToScanScreen = function () {
    window.hideAllTerminalPanels();
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) greetingEl.innerText = "SİSTEM BAĞLANTISI";
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) scanBtn.style.display = 'block';
};

/**
 * Terminal oturum verilerini localStorage'dan temizler.
 */
window.clearTerminalSession = function () {
    ['shiftTurbo_user', 'auth_active', 'isShiftActive', 'temp_user_name', 'temp_user_pin'].forEach(key => {
        localStorage.removeItem(key);
    });
};

// ──────────────────────────────────────────────
// 4. YÖNETİCİ LOG VERİ CACHE OLUŞTURUCU
// ──────────────────────────────────────────────

/**
 * Logları personele göre gruplar ve skor cache'i oluşturur.
 * @param {Array} allLogs - Tüm log dizisi
 * @returns {{ personLogsMap: Object, sortedPersonLogsMap: Object, getCachedScore: Function }}
 */
window.buildLogDataCache = function (allLogs) {
    const personLogsMap = {};
    const sortedPersonLogsMap = {};
    allLogs.forEach(l => {
        const p = l.personel;
        if (!personLogsMap[p]) personLogsMap[p] = [];
        personLogsMap[p].push(l);
    });

    const scoreCache = {};
    const getCachedScore = (person) => {
        if (scoreCache[person] === undefined) {
            scoreCache[person] = window.calculateScore(person);
        }
        return scoreCache[person];
    };

    return { personLogsMap, sortedPersonLogsMap, getCachedScore };
};

// ──────────────────────────────────────────────
// 5. YÖNETİCİ LOG SATIRI RENDER FONKSİYONU
// ──────────────────────────────────────────────

/**
 * Tek bir log satırının HTML'ini üretir (applyFilter ve renderCustomTable için ortak).
 * @param {object} log - Log nesnesi
 * @param {object} opts - Seçenekler
 * @param {Array} opts.pLogs - Personelin tüm logları
 * @param {Array} opts.pLogsSorted - Ters sıralı loglar
 * @param {Function} opts.getCachedScore - Skor cache fonksiyonu
 * @param {Array} opts.allLogs - Tüm loglar
 * @param {boolean} [opts.checkNew=false] - Yeni kayıt kontrolü
 * @param {boolean} [opts.checkUnknown=false] - Bilinmeyen personel kontrolü
 * @param {boolean} [opts.useTimeSplit=false] - Zaman split formatı kullan
 * @returns {string} HTML string
 */
window.renderLogRow = function (log, opts) {
    const { pLogs, pLogsSorted, getCachedScore, allLogs } = opts;
    const checkNew = opts.checkNew || false;
    const checkUnknown = opts.checkUnknown || false;
    const useTimeSplit = opts.useTimeSplit || false;

    const isCrit = window.checkCriticalAlert(log, allLogs, pLogs);
    let hoursDiff = 0;
    if (isCrit && log.type === 'GİRİŞ') {
        const girisZamani = new Date(log.raw_time);
        hoursDiff = (new Date() - girisZamani) / 3600000;
    }

    const score = getCachedScore(log.personel);
    const isNew = checkNew ? (new Date() - new Date(log.raw_time)) < 30000 : false;
    const isMessage = log.type === 'MESAJ';
    const isUnknown = checkUnknown ? (log.personel.includes("BILINMEYEN") || log.personel.includes("BİLİNMEYEN")) : false;
    const durationText = window.calculateRowDuration(log, allLogs, pLogsSorted);

    const clickAction = isMessage ? `onclick="showMsg('${log.personel}', '${log.mahalle.replace(/'/g, "\\'")}', '${log.time}')"` : "";
    const badgeStyle = isMessage ? 'background: #9333ea; cursor: pointer; border-color: #a78bfa;' : '';
    const displayText = isMessage ? '📩 MESAJI OKU' : log.type;

    let isOffline = log.mahalle && log.mahalle.includes('⚡ Çevrimdışı');
    let noteText = isMessage ? '📝 Personel Bildirimi Gönderdi' : log.mahalle.replace(' (⚡ Çevrimdışı)', '');
    let offlineBadge = isOffline ? `<br><span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 6px; font-size: 8px; font-family: 'Rajdhani', 'Exo 2', 'Poppins', sans-serif; display: inline-block; margin-top: 5px;">⚡ ÇEVRİMDİŞI EŞİTLENDİ</span>` : '';

    const scoreBox = (!checkUnknown || !isUnknown) ? `<div class="score-box ${score < 70 ? 'low-score' : ''}">⭐ ${score} Puan</div>` : '';

    // Zaman gösterim formatı
    const timeDisplay = useTimeSplit ? (log.time.split(' ')[1] || log.time) : log.time;
    const dateDisplay = useTimeSplit ? (log.time.split(' ')[0] || log.time) : (log.date_str || log.time);

    const actionCol = isMessage
        ? `<a href="javascript:void(0)" ${clickAction} class="btn-msg-read" style="margin-bottom:8px; display:inline-block;">AÇ / OKU</a><br><span class="log-time-highlight" style="font-size:15px; font-family:'Rajdhani', 'Exo 2', 'Poppins', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${timeDisplay}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${dateDisplay}</span>`
        : `<span class="log-time-highlight" style="font-size:15px; font-family:'Rajdhani', 'Exo 2', 'Poppins', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${timeDisplay}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${dateDisplay}</span>`;

    const forceEndBtn = (hoursDiff >= (window.maxShiftHours || 10.5))
        ? `<button onclick="window.endPersonnelShift('${log.personel}')" class="btn-cyber" style="background:#ef4444; color:#fff; font-size:9px; font-family:'Poppins', sans-serif; font-weight:600; padding:4px 8px; border-radius:4px; margin-left:6px; cursor:pointer; border:none; display:inline-block; vertical-align:middle; box-shadow:0 0 8px rgba(239,68,68,0.4);">🔴 BİTİR</button>`
        : '';

    // Fazla mesai onay durumu kontrolü
    let overtimeApprovalBadge = '';
    if (isCrit && log.type === 'GİRİŞ') {
        if (log.is_overtime_approved) {
            overtimeApprovalBadge = `<br><span style="background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid #10b981; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-family: 'Poppins', sans-serif; font-weight: 600; display: inline-block; margin-top: 4px; box-shadow: 0 0 8px rgba(16,185,129,0.2);">🛡️ ONAYLANMIŞ FAZLA MESAİ</span>`;
        }
    }

    const mahalleUpper = (log.mahalle || "").toLocaleUpperCase('tr-TR');
    const noteUpper = (noteText || "").toLocaleUpperCase('tr-TR');
    const isManagerAction = mahalleUpper.includes('YÖNETİCİ') || mahalleUpper.includes('SONLANDIRILDI') || noteUpper.includes('YÖNETİCİ') || noteUpper.includes('SONLANDIRILDI') || !log.lat || log.lat === 0;
    const locationBtnHtml = isManagerAction
        ? `<span style="color:#a78bfa; font-size:10px; font-weight:600; display:inline-block; margin-top:5px;">🛠️ UZAKTAN KAPATILDI</span>`
        : `<a href="https://www.google.com/maps?q=${log.lat},${log.lon}" target="_blank" style="color:#3b82f6; font-size:10px; font-weight:700; text-decoration:none; display:inline-block; margin-top:5px;">📍 KONUM</a>`;

    return `<tr class="${isCrit ? 'critical-alarm' : ''} ${isNew ? 'new-action-row' : ''}">
<td style="font-family:'Poppins', sans-serif; font-size:15px; font-weight:700; letter-spacing:0.5px; color:var(--text-main);">
    ${log.personel}<br>
    ${scoreBox}
    ${isCrit ? `<br><span class="critical-badge" style="display:inline-block; vertical-align:middle;">⚠️ AŞIRI MESAİ</span>${forceEndBtn}${overtimeApprovalBadge}` : ''} 
</td>
<td>
    <span class="badge ${log.type}" ${clickAction} style="${badgeStyle}">${displayText}</span><br>
    <small style="color:var(--primary); font-weight:700;">⏱️ ${durationText}</small>
</td>
<td><div class="${isMessage ? 'msg-text-truncate' : ''}">${noteText}</div>${offlineBadge}<br>${locationBtnHtml}</td>
<td>${actionCol}</td>
</tr>`;
};

// ──────────────────────────────────────────────
// 6. LOG VERİ ARTIMLI SENKRONİZASYON MOTORU
// ──────────────────────────────────────────────

/**
 * Supabase'den sadece yeni logları çekerek yerel önbellek ile birleştirir.
 * @param {object} supabaseClient - Supabase client instance
 * @returns {Promise<Array>} Senkronize edilmiş log listesi
 */
async function _sharedSyncLogs(supabaseClient) {
    let cachedLogs = [];
    try {
        const cached = window.ShiftTurboShared.getObfuscated('shiftTurbo_raw_logs_cache');
        if (cached) {
            cachedLogs = Array.isArray(cached) ? cached : JSON.parse(cached);
        }
    } catch (e) {
        console.warn("Önbellek okuma hatası:", e);
    }

    if (!supabaseClient) {
        return cachedLogs;
    }

    // En son log'un created_at zaman damgasını bul
    let maxTime = null;
    if (cachedLogs.length > 0) {
        cachedLogs.forEach(log => {
            if (log.created_at) {
                if (!maxTime || log.created_at > maxTime) {
                    maxTime = log.created_at;
                }
            }
        });
    }

    const businessId = (typeof window !== 'undefined' && window.currentBusinessId) || localStorage.getItem('shiftTurbo_business_id');
    let query = supabaseClient.from('logs').select('*');
    if (businessId) {
        query = query.eq('business_id', businessId);
    }
    if (maxTime) {
        // En son log zamanından 7 gün öncesine kadar olan tüm yeni/güncellenen logları çekerek
        // cihazlar arası eşleşmeyen veya geriye dönük sonlandırma (BİTİR) işlemlerini senkronize et
        const limitDate = new Date(new Date(maxTime).getTime() - (7 * 24 * 60 * 60 * 1000));
        query = query.gt('created_at', limitDate.toISOString());
    }

    try {
        const { data, error } = await query;
        if (error) {
            console.error("Artımlı log çekme hatası:", error);
            return cachedLogs;
        }

        if (data && data.length > 0) {
            const mergedMap = new Map();
            // Önce eskileri ekle
            cachedLogs.forEach(log => {
                if (log.id) mergedMap.set(log.id, log);
            });
            // Yeni gelenleri ekle
            data.forEach(log => {
                if (log.id) mergedMap.set(log.id, log);
            });

            // Tarihe göre sırala (en yeni en üstte)
            const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            // Performans ve mobil depolama kotaları (5MB) için max 2000 log tut
            let finalLogs = mergedList;
            if (finalLogs.length > 2000) {
                finalLogs = finalLogs.slice(0, 2000);
            }

            try {
                window.ShiftTurboShared.setObfuscated('shiftTurbo_raw_logs_cache', finalLogs);
            } catch (e) {
                console.warn("Önbellek yazma hatası:", e);
            }

            return finalLogs;
        } else if (cachedLogs.length > 0) {
            // Eğer yerel hafızada veri var fakat Supabase boş dönüyorsa, veritabanı silinmiş mi kontrol et
            let countQuery = supabaseClient.from('logs').select('id', { count: 'exact', head: true });
            if (businessId) countQuery = countQuery.eq('business_id', businessId);
            const { count, error: countErr } = await countQuery;
            if (!countErr && count === 0) {
                console.log("🧹 Veritabanında (Supabase) 0 kayıt bulundu. Yerel önbellek otomatik sıfırlanıyor...");
                cachedLogs = [];
                localStorage.removeItem('shiftTurbo_raw_logs_cache');
                return [];
            }
        }
    } catch (e) {
        console.error("Log senkronizasyon hatası:", e);
    }

    return cachedLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Verilen değeri (nesne veya metin) UTF-8 uyumlu Base64 ile maskeler ve localStorage'a yazar.
 * @param {string} key
 * @param {*} value
 */
function _sharedSetObfuscated(key, value) {
    try {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        const obfuscated = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
        }));
        localStorage.setItem(key, obfuscated);
    } catch (e) {
        console.error("Yerel depolama yazma hatası (maskeli):", e);
        try {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch (innerErr) {
            console.error("Yerel depolama yedek yazma hatası:", innerErr);
        }
    }
}

/**
 * Maskelenmiş yerel depolama verisini okur ve deşifre eder.
 * Geriye dönük uyumluluk için maskelenmemiş eski düz metinleri de destekler.
 * @param {string} key
 * @returns {*} Çözümlenmiş nesne/dizi veya düz metin, yoksa null
 */
function _sharedGetObfuscated(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const decoded = decodeURIComponent(atob(raw).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        try {
            return JSON.parse(decoded);
        } catch (e) {
            return decoded;
        }
    } catch (e) {
        // Geriye dönük uyumluluk (düz metin fallback)
        try {
            return JSON.parse(raw);
        } catch (jsonErr) {
            return raw;
        }
    }
}

// Global erişim için shared namespace
window.ShiftTurboShared = {
    testSupabaseClient: _sharedTestSupabaseClient,
    initSupabaseClient: _sharedInitSupabaseClient,
    syncLogs: _sharedSyncLogs,
    setObfuscated: _sharedSetObfuscated,
    getObfuscated: _sharedGetObfuscated,
    getStatusKey: function(name) {
        try {
            const obfuscatedName = btoa(encodeURIComponent(name || "").replace(/%([0-9A-F]{2})/g, (match, p1) => {
                return String.fromCharCode(parseInt(p1, 16));
            }));
            return 'shiftTurbo_status_' + obfuscatedName;
        } catch (e) {
            return 'shiftTurbo_last_status_' + name;
        }
    },
    setStatus: function(name, status) {
        const key = this.getStatusKey(name);
        this.setObfuscated(key, status);
        const oldKey = 'shiftTurbo_last_status_' + name;
        localStorage.removeItem(oldKey);
    },
    getStatus: function(name) {
        const key = this.getStatusKey(name);
        let val = this.getObfuscated(key);
        if (val === null) {
            const oldKey = 'shiftTurbo_last_status_' + name;
            val = localStorage.getItem(oldKey);
            if (val !== null) {
                this.setStatus(name, val);
            }
        }
        return val || 'ÇIKIŞ';
    }
};

// ──────────────────────────────────────────────
// 6.5. WEB PUSH BİLDİRİM YARDIMCILARI
// ──────────────────────────────────────────────

/**
 * Personel veya Yönetici cihazını Web Push bildirimleri için Supabase'e kaydeder.
 * @param {string} [personName] - Personel adı
 */
window.initTerminalPushNotification = async function(personName) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        if (!reg || !reg.pushManager) return;

        let perm = Notification.permission;
        if (perm === 'default') {
            try {
                perm = await Notification.requestPermission();
            } catch (e) {
                perm = await new Promise(resolve => Notification.requestPermission(resolve));
            }
        }
        if (perm !== 'granted') return;

        const publicVapidKey = 'BJ6yn3SpofZvSHYVRnT62OBvszxpYdOw75ibzPSi7u2do6MIVh8cu88HftRoSkyszIXKWrlZIpZ3o1uvwbG-s24';
        const urlBase64ToUint8Array = (base64String) => {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
            return outputArray;
        };

        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
            try {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                });
            } catch (subErr) {
                console.warn("PushManager.subscribe denemesi hatası:", subErr);
            }
        }

        // Eğer abonelik alınamadıysa eski çakışan aboneliği temizleyip tekrar dene
        if (!sub) {
            try {
                const oldSub = await reg.pushManager.getSubscription();
                if (oldSub) await oldSub.unsubscribe();
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                });
            } catch (e) {
                console.warn("PushManager abonelik yenileme hatası:", e);
            }
        }

        const supabaseClient = window._supabase || (window.ShiftTurboShared && window.ShiftTurboShared.client);
        if (sub && supabaseClient) {
            const subJson = JSON.parse(JSON.stringify(sub));
            const businessId = (typeof window !== 'undefined' && window.currentBusinessId) || localStorage.getItem('shiftTurbo_business_id') || null;
            const targetPerson = personName || localStorage.getItem('shiftTurbo_user') || 'personel';
            
            // 1. Şans: Tüm alanlar ile kaydet
            let { error: subErr } = await supabaseClient.from('push_subscriptions').upsert([{
                endpoint: sub.endpoint,
                subscription: subJson,
                personel_name: targetPerson,
                business_id: businessId
            }], { onConflict: 'endpoint' });

            // 2. Şans: Eğer veritabanında personel_name/business_id sütunları yoksa sade haliyle kaydet (Guaranteed fallback)
            if (subErr) {
                console.warn("Tam abonelik kaydı yapılamadı, sade kayıt deneniyor:", subErr.message);
                const { error: fallbackErr } = await supabaseClient.from('push_subscriptions').upsert([{
                    endpoint: sub.endpoint,
                    subscription: subJson
                }], { onConflict: 'endpoint' });
                if (fallbackErr) {
                    console.error("Sade abonelik kaydı da başarısız:", fallbackErr);
                } else {
                    console.log("✅ Personel Push Aboneliği (Sade) Supabase'e Başarıyla Kaydedildi!");
                }
            } else {
                console.log("🔔 Personel Push Bildirim Aboneliği Kaydedildi:", targetPerson);
            }
        }
    } catch (err) {
        console.warn("Terminal Push abonelik hatası:", err);
    }
};

/**
 * Yönetici duyuru attığında tüm kayıtlı cihazlara SUNUCU TARAFLI Push bildirimi gönderir.
 * Cloudflare Worker /send-broadcast endpoint'i: VAPID imzalı gerçek Web Push protokolü.
 * @param {string} message - Bildirim metni
 * @param {string} [title] - Bildirim başlığı
 */
window.triggerWebPushNotification = async function(message, title = '📢 YÖNETİCİ DUYURUSU') {
    try {
        const proxyUrl = (typeof SHIFTURBO_CONFIG !== 'undefined' && SHIFTURBO_CONFIG.proxyUrl) || 'https://shiftturbo-proxy.burakkucar55-5af.workers.dev';
        const businessId = (typeof window !== 'undefined' && window.currentBusinessId) || localStorage.getItem('shiftTurbo_business_id');

        // Mesajdaki [ALL] veya [İSİM] tag'ini temizle
        let cleanMessage = message;
        if (cleanMessage.match(/^\[(.*?)\]\s*(.*)/)) {
            cleanMessage = cleanMessage.match(/^\[(.*?)\]\s*(.*)/)[2];
        }

        const resp = await fetch(`${proxyUrl}/send-broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                message: cleanMessage,
                business_id: businessId
            })
        });

        const result = await resp.json();
        console.log("🚀 Sunucu Tarafı Web Push Sonucu:", result);
    } catch (e) {
        console.warn("triggerWebPushNotification istisnası:", e);
    }
};

/**
 * OneSignal ve Mobil WebPush üzerinden hibrit anlık bildirim tetikler.
 * @param {string} message - Bildirim metni
 * @param {string} [title] - Bildirim başlığı
 */
window.triggerOneSignalPush = async function(message, title = '📢 YÖNETİCİ DUYURUSU') {
    if (typeof window.triggerWebPushNotification === 'function') {
        window.triggerWebPushNotification(message, title);
    }

    const oneSignalAppId = (typeof SHIFTURBO_CONFIG !== 'undefined' && SHIFTURBO_CONFIG.oneSignalAppId) || localStorage.getItem('shiftTurbo_onesignal_appid');
    const oneSignalApiKey = (typeof SHIFTURBO_CONFIG !== 'undefined' && SHIFTURBO_CONFIG.oneSignalRestApiKey) || localStorage.getItem('shiftTurbo_onesignal_apikey');

    if (oneSignalAppId && oneSignalApiKey) {
        try {
            await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': 'Basic ' + oneSignalApiKey
                },
                body: JSON.stringify({
                    app_id: oneSignalAppId,
                    included_segments: ['Subscribed Users'],
                    headings: { tr: title, en: title },
                    contents: { tr: message, en: message },
                    url: 'https://shiftturbo.tech/index.html'
                })
            });
            console.log("🚀 OneSignal Anlık Mobil Push Bildirimi Gönderildi!");
        } catch (e) {
            console.warn("OneSignal gönderim uyarısı:", e);
        }
    }
};

// ──────────────────────────────────────────────
// 7. ESKİ/GÜVENSİZ VERİLERİN TEMİZLENMESİ
// ──────────────────────────────────────────────
(function() {
    try {
        const config = window.SHIFTURBO_CONFIG || (typeof SHIFTURBO_CONFIG !== 'undefined' ? SHIFTURBO_CONFIG : null);
        if (config && config.geminiApiKey) {
            if (localStorage.getItem('shiftTurbo_gemini_key')) {
                localStorage.removeItem('shiftTurbo_gemini_key');
                console.log("🔒 Eski Gemini API Key tarayıcı hafızasından güvenli bir şekilde silindi.");
            }
        }

        // Eski düz metin personel durum anahtarlarını otomatik olarak maskeleyip temizleme
        const keysToMigrate = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('shiftTurbo_last_status_')) {
                keysToMigrate.push(key);
            }
        }
        keysToMigrate.forEach(key => {
            const name = key.replace('shiftTurbo_last_status_', '');
            if (name) {
                const status = localStorage.getItem(key);
                if (status !== null) {
                    window.ShiftTurboShared.setStatus(name, status);
                    console.log(`🔒 Eski durum anahtarı (${name}) otomatik olarak maskelendi ve temizlendi.`);
                }
            }
        });

        // Supabase Auth Token'ları düz JSON olarak koru (SDK oturum kopmalarını engellemek için)
        // Eğer daha önceden Base64 ile maskelenmiş bir auth token varsa otomatik düzelt / JSON'a çevir
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const rawVal = localStorage.getItem(key);
                if (rawVal && !rawVal.trim().startsWith('{')) {
                    try {
                        const decoded = decodeURIComponent(atob(rawVal).split('').map(c => {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        if (decoded && decoded.trim().startsWith('{')) {
                            localStorage.setItem(key, decoded);
                            console.log(`✅ Supabase Auth Token (${key}) düzgün JSON formatına geri döndürüldü.`);
                        }
                    } catch (err) {
                        console.warn("Bozuk auth token temizlendi:", err);
                        localStorage.removeItem(key);
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Eski verileri temizlerken hata oluştu:", e);
    }
})();


