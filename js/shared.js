/* ============================================
   🔧 SHIFTURBO — SHARED UTILITIES (shared.js)
   Terminal ve Yönetici panellerinin ortak kullandığı
   tekrarlı fonksiyonları tek noktadan yönetir.
   ============================================ */

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

    const proxyClient = supabase.createClient(proxyUrl, 'proxy-authenticated');
    if (await _sharedTestSupabaseClient(proxyClient)) {
        return { client: proxyClient, type: 'proxy' };
    }

    if (localConfig) {
        const directClient = supabase.createClient(localConfig.supabaseUrl, localConfig.supabaseKey);
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
    const logs = logsArray || window.allLogs || [];
    let score = 100;
    if (!logs || logs.length === 0) return score;

    const pLogs = logs
        .filter(l => {
            const name = (l.personel_name || l.personel || "").trim().toLocaleUpperCase('tr-TR');
            return name === (personName || "").trim().toLocaleUpperCase('tr-TR');
        })
        .sort((a, b) => new Date(a.raw_time || a.created_at) - new Date(b.raw_time || b.created_at));

    if (pLogs.length === 0) return score;

    for (let i = 0; i < pLogs.length; i++) {
        if (pLogs[i].type === 'GİRİŞ') {
            const girisZamani = new Date(pLogs[i].raw_time || pLogs[i].created_at);
            let cikisLogu = null;
            for (let j = i + 1; j < pLogs.length; j++) {
                if (pLogs[j].type === 'ÇIKIŞ') { cikisLogu = pLogs[j]; break; }
            }
            let bitisZamani = cikisLogu ? new Date(cikisLogu.raw_time || cikisLogu.created_at) : new Date();
            let saatFarki = (bitisZamani - girisZamani) / 3600000;
            if (saatFarki > 10.5) score -= 15;
        }
    }

    pLogs.forEach(log => {
        if (log.mahalle && log.mahalle.includes('DOĞRULUK:')) {
            const match = log.mahalle.match(/DOĞRULUK:\s*(\d+)m/);
            if (match && parseInt(match[1]) > 300) score -= 5;
        }
    });

    score += Math.floor(pLogs.length / 5) * 2;
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
    let offlineBadge = isOffline ? `<br><span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 6px; font-size: 8px; font-family: 'Orbitron'; display: inline-block; margin-top: 5px;">⚡ ÇEVRİMDİŞI EŞİTLENDİ</span>` : '';

    const scoreBox = (!checkUnknown || !isUnknown) ? `<div class="score-box ${score < 70 ? 'low-score' : ''}">⭐ ${score} Puan</div>` : '';

    // Zaman gösterim formatı
    const timeDisplay = useTimeSplit ? (log.time.split(' ')[1] || log.time) : log.time;
    const dateDisplay = useTimeSplit ? (log.time.split(' ')[0] || log.time) : (log.date_str || log.time);

    const actionCol = isMessage
        ? `<a href="javascript:void(0)" ${clickAction} class="btn-msg-read" style="margin-bottom:8px; display:inline-block;">AÇ / OKU</a><br><span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${timeDisplay}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${dateDisplay}</span>`
        : `<span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${timeDisplay}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${dateDisplay}</span>`;

    return `<tr class="${isCrit ? 'critical-alarm' : ''} ${isNew ? 'new-action-row' : ''}">
<td style="font-family:'Poppins', sans-serif; font-size:15px; font-weight:700; letter-spacing:0.5px; color:var(--text-main);">
    ${log.personel}<br>
    ${scoreBox}
    ${isCrit ? '<br><span class="critical-badge">⚠️ 10 SAAT+ MESAİ</span>' : ''} 
</td>
<td>
    <span class="badge ${log.type}" ${clickAction} style="${badgeStyle}">${displayText}</span><br>
    <small style="color:var(--primary); font-weight:700;">⏱️ ${durationText}</small>
</td>
<td><div class="${isMessage ? 'msg-text-truncate' : ''}">${noteText}</div>${offlineBadge}<br><a href="https://www.google.com/maps?q=${log.lat},${log.lon}" target="_blank" style="color:#3b82f6; font-size:10px; font-weight:700; text-decoration:none; display:inline-block; margin-top:5px;">📍 KONUM</a></td>
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

    let query = supabaseClient.from('logs').select('*');
    if (maxTime) {
        query = query.gt('created_at', maxTime);
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

            // Performans için max 15000 log tut
            let finalLogs = mergedList;
            if (finalLogs.length > 15000) {
                finalLogs = finalLogs.slice(0, 15000);
            }

            try {
                window.ShiftTurboShared.setObfuscated('shiftTurbo_raw_logs_cache', finalLogs);
            } catch (e) {
                console.warn("Önbellek yazma hatası:", e);
            }

            return finalLogs;
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
    } catch (e) {
        console.warn("Eski verileri temizlerken hata oluştu:", e);
    }
})();


