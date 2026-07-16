(() => {
    let isAuthenticated = false;
    // 🛡️ SHIFTURBO — SECURE PROXY CONNECTION
    const proxyUrl = 'https://shiftturbo-proxy.burakkucar55-5af.workers.dev';
    const localSupabaseConfig = (typeof SHIFTURBO_CONFIG !== 'undefined' && SHIFTURBO_CONFIG && SHIFTURBO_CONFIG.supabaseUrl && SHIFTURBO_CONFIG.supabaseKey)
        ? SHIFTURBO_CONFIG
        : null;

    let _supabase = null;
    let _supabaseClientType = 'proxy';
    window.allLogs = [];
    let lastLogCount = 0;

    // testSupabaseClient ve initSupabaseClient → shared.js'den gelir (window.ShiftTurboShared)

    window.addEventListener('load', async () => {
        const _initResult = await window.ShiftTurboShared.initSupabaseClient(proxyUrl, localSupabaseConfig);
        _supabase = _initResult.client;
        _supabaseClientType = _initResult.type;
        window._supabase = _supabase;
        
        // Supabase bağlantısı hazır olduğunda, oturum aktifse canlı verileri beklemeden hemen çek
        if (isAuthenticated && _supabase) {
            fetchData();
        }
    });
    let isActiveStaffMode = false;
    let autoRefreshInterval = null;
    let realtimeChannel = null;

    // 📲 Service Worker Kaydı (PWA için)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('ShiftTurbo Manager PWA Hazır!', reg))
                .catch(err => console.log('PWA Hatası:', err));
        });
    }

    // 🔐 Oturum Kalıcılığı ve Şifre Sıfırlama Kontrolü
    const checkRecoveryAndAuth = async () => {
        // Şifre sıfırlama veya Davet linkinden gelip gelmediğimizi kontrol et
        const isRecovery = (window.location.hash && (window.location.hash.includes('type=recovery') || window.location.hash.includes('type=invite') || window.location.hash.includes('access_token='))) ||
            (window.location.search && (window.location.search.includes('type=recovery') || window.location.search.includes('type=invite')));

        if (isRecovery) {
            console.log("🔐 Şifre sıfırlama modu algılandı...");
            const loginOv = document.getElementById("loginOverlay");
            const resetOv = document.getElementById("passwordResetOverlay");
            if (loginOv) loginOv.style.opacity = "0";
            if (loginOv) setTimeout(() => loginOv.style.display = "none", 300);
            if (resetOv) {
                resetOv.style.display = "flex";
                resetOv.style.opacity = "0";
                setTimeout(() => resetOv.style.opacity = "1", 100);
            }
            return;
        }

        if (localStorage.getItem('shiftTurbo_admin_logged_in') === 'true') {
            isAuthenticated = true;
            showPanel();
        } else {
            const { data: { session } } = await _supabase.auth.getSession();
            if (session) {
                isAuthenticated = true;
                localStorage.setItem('shiftTurbo_admin_logged_in', 'true');
                showPanel();
            }
        }
    };

    window.addEventListener('load', checkRecoveryAndAuth);
    window.addEventListener('hashchange', checkRecoveryAndAuth);

    // 🔐 BRUTE-FORCE KORUMA SİSTEMİ
    const MAX_ATTEMPTS = 5;           // Maksimum hatalı deneme
    const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 dakika kilit (ms)
    const ATTEMPT_KEY = 'shiftTurbo_login_attempts';
    const LOCKOUT_KEY = 'shiftTurbo_login_lockout';

    function getLoginAttempts() {
        return parseInt(localStorage.getItem(ATTEMPT_KEY) || '0');
    }
    function getLockoutTime() {
        return parseInt(localStorage.getItem(LOCKOUT_KEY) || '0');
    }
    function isLockedOut() {
        const lockoutTime = getLockoutTime();
        if (!lockoutTime) return false;
        return Date.now() < lockoutTime;
    }
    function getRemainingLockout() {
        const ms = getLockoutTime() - Date.now();
        if (ms <= 0) return null;
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    function incrementAttempts() {
        const current = getLoginAttempts() + 1;
        localStorage.setItem(ATTEMPT_KEY, current.toString());
        if (current >= MAX_ATTEMPTS) {
            localStorage.setItem(LOCKOUT_KEY, (Date.now() + LOCKOUT_DURATION).toString());
            localStorage.setItem(ATTEMPT_KEY, '0');
        }
        return current;
    }
    function resetAttempts() {
        localStorage.removeItem(ATTEMPT_KEY);
        localStorage.removeItem(LOCKOUT_KEY);
    }

    function setLoginUILocked(locked, msg = '') {
        const btn = document.querySelector('#step1 .btn-cyber');
        const userInput = document.getElementById('username');
        const passInput = document.getElementById('password');
        if (!btn) return;
        if (locked) {
            btn.disabled = true;
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.textContent = msg || 'KİLİTLİ';
            if (userInput) { userInput.disabled = true; userInput.style.opacity = '0.4'; }
            if (passInput) { passInput.disabled = true; passInput.style.opacity = '0.4'; }
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.textContent = 'ERİŞİMİ ONAYLA';
            if (userInput) { userInput.disabled = false; userInput.style.opacity = ''; }
            if (passInput) { passInput.disabled = false; passInput.style.opacity = ''; }
        }
    }

    // Kilit geri sayım zamanlayıcısı
    let lockoutTimer = null;
    function startLockoutCountdown() {
        if (lockoutTimer) clearInterval(lockoutTimer);
        lockoutTimer = setInterval(() => {
            if (!isLockedOut()) {
                clearInterval(lockoutTimer);
                setLoginUILocked(false);
                showToast("KİLİT AÇILDI", "Tekrar giriş denemesi yapabilirsiniz.", "success");
            } else {
                const remaining = getRemainingLockout();
                setLoginUILocked(true, `KİLİTLİ — ${remaining}`);
            }
        }, 1000);
    }

    // Sayfa yüklendiğinde kilit durumunu kontrol et
    document.addEventListener('DOMContentLoaded', () => {
        if (isLockedOut()) {
            setLoginUILocked(true, `KİLİTLİ — ${getRemainingLockout()}`);
            startLockoutCountdown();
            showToast("HESAP KİLİTLİ", `Çok fazla hatalı giriş. Lütfen bekleyin.`, "error");
        }
    });

    async function updatePassword() {
        const newPass = document.getElementById("newPassword").value;
        if (!newPass) {
            showToast("HATA", "Lütfen bir şifre girin.", "error");
            return;
        }

        try {
            const { error } = await _supabase.auth.updateUser({ password: newPass });
            if (error) throw error;
            showToast("BAŞARILI", "Şifreniz güncellendi. Giriş yapabilirsiniz.", "success");
            setTimeout(() => {
                window.location.hash = "";
                location.reload();
            }, 2000);
        } catch (err) {
            showToast("HATA", err.message, "error");
        }
    }
    window.updatePassword = updatePassword;

    async function nextStep() {
        // 🚫 Kilit kontrolü
        if (isLockedOut()) {
            showToast("ERİŞİM REDDİ", `Hesap kilitlendi. Kalan süre: ${getRemainingLockout()}`, "error");
            return;
        }

        const user = document.getElementById("username").value.trim();
        const pass = document.getElementById("password").value;

        if (!user || !pass) {
            showToast("UYARI", "Lütfen tüm alanları doldurun.", "error");
            return;
        }

        // Butonu geçici olarak devre dışı bırak (çift tıklama önlemi)
        const btn = document.querySelector('#step1 .btn-cyber');
        if (btn) { btn.disabled = true; btn.textContent = 'DOĞRULANIYOOR...'; }

        // Eğer "admin" yazarsa otomatik maile çevir, mail yazarsa olduğu gibi kullan
        const emailTarget = user.includes('@') ? user : user + '@shifturbo.com';

        try {
            const { data, error } = await _supabase.auth.signInWithPassword({
                email: emailTarget,
                password: pass
            });

            if (data && data.session) {
                resetAttempts(); // Başarılı girişte sayacı sıfırla
                isAuthenticated = true;
                localStorage.setItem('shiftTurbo_admin_logged_in', 'true');
                showPanel();
                showToast("ERİŞİM ONAYLANDI", "Sistem güvenli bir şekilde açıldı.", "success");
            } else {
                // Başarısız giriş — sayacı artır
                const attempts = incrementAttempts();
                const remaining = MAX_ATTEMPTS - attempts;

                // Titreme (shake) animasyonu ekle
                const card = document.querySelector('.login-card');
                if (card) {
                    card.classList.add('shake-anim');
                    setTimeout(() => card.classList.remove('shake-anim'), 500);
                }

                // Hata kutusu oluştur / güncelle
                let errBox = document.getElementById('login-error-box');
                if (!errBox) {
                    errBox = document.createElement('div');
                    errBox.id = 'login-error-box';
                    errBox.style.marginTop = '15px';
                    errBox.style.padding = '10px';
                    errBox.style.background = 'rgba(239, 68, 68, 0.2)';
                    errBox.style.border = '1px solid #ef4444';
                    errBox.style.borderRadius = '8px';
                    errBox.style.color = '#ef4444';
                    errBox.style.fontSize = '12px';
                    errBox.style.textAlign = 'center';
                    errBox.style.fontFamily = 'Orbitron';
                    const step1 = document.getElementById('step1');
                    if (step1) step1.appendChild(errBox);
                }

                if (isLockedOut()) {
                    setLoginUILocked(true, `KİLİTLİ — 5:00`);
                    startLockoutCountdown();
                    showToast("HESAP KİLİTLENDİ", `${MAX_ATTEMPTS} hatalı deneme. 5 dakika beklemeniz gerekiyor.`, "error");
                    if (errBox) errBox.innerHTML = `❌ HESAP KİLİTLENDİ!<br>5 dakika beklemeniz gerekiyor.`;
                } else {
                    let errMsg = (error && error.message) ? error.message : "Kimlik bilgileri hatalı.";
                    if (errMsg.toLowerCase().includes("invalid login credentials")) {
                        errMsg = "Invalid login credentials (Geçersiz kimlik veya şifre)";
                    } else if (errMsg.toLowerCase().includes("email not confirmed")) {
                        errMsg = "Email not confirmed (E-posta adresi henüz doğrulanmamış)";
                    } else if (errMsg.toLowerCase().includes("user not found")) {
                        errMsg = "User not found (Kullanıcı bulunamadı)";
                    }
                    showToast("GİRİŞ BAŞARISIZ", `${errMsg} — ${remaining} deneme hakkı kaldı`, "error");
                    if (btn) { btn.disabled = false; btn.textContent = 'ERİŞİMİ ONAYLA'; }
                    if (errBox) errBox.innerHTML = `❌ GİRİŞ BAŞARISIZ!<br>${errMsg}<br>Kalan Deneme Hakkı: ${remaining}`;
                }
                console.warn(`⚠️ Başarısız giriş denemesi #${attempts}. E-posta: ${emailTarget}`);
            }
        } catch (e) {
            console.error("Beklenmedik hata:", e);
            showToast("BAĞLANTI HATASI", "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", "error");
            if (btn) { btn.disabled = false; btn.textContent = 'ERİŞİMİ ONAYLA'; }

        }
    }

    async function checkAuth() {
        // Sistem Supabase Auth'a geçtiği için 2. adıma gerek kalmadı.
    }

    function showPanel() {
        if (!isAuthenticated) {
            showToast("YETKİSİZ ERİŞİM", "Panel girişi için yetki gereklidir.", "error");
            location.reload();
            return;
        }
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminPanel").style.display = "block";
        if (typeof Notification !== 'undefined') {
            if (Notification.permission !== "granted") {
                Notification.requestPermission().then(permission => {
                    if (permission === "granted") checkAndRefreshPushSubscription();
                });
            } else {
                checkAndRefreshPushSubscription();
            }
        }
        fetchData();

        // Otomatik yenileme ve gerçek zamanlı abonelik başlatma
        if (!autoRefreshInterval) {
            autoRefreshInterval = setInterval(() => {
                if (isAuthenticated) fetchData();
            }, 5000);
        }

        if (!realtimeChannel) {
            realtimeChannel = _supabase.channel('custom-all-channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, payload => {
                    if (isAuthenticated) fetchData();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
                    if (isAuthenticated) fetchData();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts' }, payload => {
                    if (isAuthenticated) fetchData();
                })
                .subscribe();
        }
    }

    async function checkAndRefreshPushSubscription() {
        try {
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                // Not: VAPID Public Key'ini buraya eklemelisin
                const vapidPublicKey = 'BIHa5SYDwhb6LIMu28hUCwf9oe4PxdZ0_1dlgMCaXo0dByL6KD0Uh5d6lfHCuzq4mTccDTHvWh2GBmIjZ0a9wq8';
                applicationServerKey: vapidPublicKey
            });
        }

            const { data: { user } } = await _supabase.auth.getUser();
        if (user && subscription) {
            await _supabase.from('push_subscriptions').upsert({
                user_id: user.id,
                subscription_json: JSON.stringify(subscription),
                last_updated: new Date().toISOString()
            });
            console.log("🔔 Push aboneliği güncellendi.");
        }
    } catch (err) {
        console.error("Push abonelik hatası:", err);
    }
}

    function showToast(title, msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `cyber-toast ${type === 'error' ? 'toast-error' : ''}`;

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle';

    toast.innerHTML = `
        <i class="fas ${icon} toast-icon"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${msg}</div>
        </div>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);

    // Animasyonu tetikle
    setTimeout(() => toast.classList.add('show'), 100);

    // Otomatik sil
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function logout() {
    document.getElementById('logout-modal').style.display = 'flex';
}

function executeLogout() {
    isAuthenticated = false;
    localStorage.removeItem('shiftTurbo_admin_logged_in');
    _supabase.auth.signOut().then(() => {
        location.reload();
    });
}

function checkNewNotifications(logs) {
    if (logs.length > lastLogCount && lastLogCount > 0) {
        const newLog = logs[0];
        if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
            new Notification("YENİ İŞLEM: " + newLog.personel, {
                body: `${newLog.type} - ${newLog.mahalle}`,
                icon: "logom.png"
            });
        }
    }
    lastLogCount = logs.length;
}

async function fetchData() {
    if (!isAuthenticated) return;
    // Not: Filtreleri sıfırlamıyoruz ki kullanıcı tarih seçip yenile deyince gitmesin.
    const data = await window.ShiftTurboShared.syncLogs(_supabase);


    const cleanData = [];
    const seenActions = new Set();

    (data || []).forEach(log => {
        const timeKey = log.type === 'MESAJ' ? `msg-${log.id}` : `${log.personel_name}-${log.created_at}`;
        if (!seenActions.has(timeKey)) {
            cleanData.push(log);
            seenActions.add(timeKey);
        }
    });

    window.allLogs = cleanData.map(log => ({
        id: log.id,
        personel: (log.personel_name || "BILINMEYEN_MISAFIR").trim().toLocaleUpperCase('tr-TR'),
        type: log.type,
        mahalle: log.mahalle,
        lat: log.lat,
        lon: log.lon,
        time: new Date(log.created_at).toLocaleString('tr-TR'),
        raw_time: log.created_at
    }));

    updateTrendGraph();
    runAIAnalysis();
    updateDashboard();

    checkNewNotifications(window.allLogs);
    loadStaffList(); // Personel listesini günceller
    fetchBroadcastHistory(); // Duyuru geçmişini günceller
}

window.cyberConfirm = function (title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-msg');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        titleEl.innerText = title;
        msgEl.innerText = message;
        modal.style.display = 'flex';

        const close = (val) => {
            modal.style.display = 'none';
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(val);
        };

        okBtn.onclick = () => close(true);
        cancelBtn.onclick = () => close(false);
        modal.onclick = (e) => { if (e.target === modal) close(false); };
    });
};

window.toggleAboutModal = function (show) {
    const modal = document.getElementById('about-modal');
    modal.style.display = show ? 'flex' : 'none';
    if (typeof playSound === "function" && show) playSound('tap');
};

window.sendBroadcast = async function () {
    const input = document.getElementById('broadcastMsg');
    const targetSel = document.getElementById('broadcastTarget');
    const msg = input.value.trim();
    if (!msg) return;

    const targetVal = targetSel ? targetSel.value : 'ALL';
    const targetLabel = targetVal === 'ALL' ? 'Tüm Personeller' : targetVal;

    if (!await cyberConfirm("DUYURU YAYINLA", `Şu duyuruyu "${targetLabel}" hedefine iletmek istiyor musunuz?\n\n"${msg}"`)) return;

    const finalMsg = targetVal === 'ALL' ? `[ALL] ${msg}` : `[${targetVal}] ${msg}`;

    const { error } = await _supabase.from('broadcasts').insert([{ message: finalMsg }]);
    if (error) {
        showToast("HATA", "Duyuru gönderilemedi. Lütfen ayarları kontrol edin.", "error");
    } else {
        showToast("İŞLEM BAŞARILI", "📢 Duyuru hedefe iletildi.", "success");
        input.value = "";
        fetchBroadcastHistory(); // Listeyi güncelle
    }
}

window.deleteBroadcasts = async function () {
    if (!await cyberConfirm("PANO TEMİZLİĞİ", "TÜM duyuruları silmek ve panoyu temizlemek istediğinize emin misiniz?")) return;

    const { error } = await _supabase.from('broadcasts').delete().neq('message', '___HOSGELDINIZ___');

    if (error) {
        showToast("SİLME HATASI", error.message, "error");
    } else {
        showToast("PANORAMA TEMİZLENDİ", "✅ Duyurular silindi.", "success");
        document.getElementById('broadcastMsg').value = "";
        fetchBroadcastHistory(); // Listeyi güncelle
    }
}

async function fetchBroadcastHistory() {
    const { data, error } = await _supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

    if (data) {
        const list = document.getElementById('broadcast-list');
        if (!list) return;
        if (data.length === 0) {
            list.innerHTML = '<div style="font-size: 11px; color: #475569; text-align: center; padding: 20px;">Henüz bir duyuru kaydı bulunmuyor.</div>';
            return;
        }

        list.innerHTML = data.map(b => {
            let dispMsg = b.message;
            let badgeHtml = `<span style="background: rgba(16,185,129,0.2); color:#10b981; padding:2px 6px; border-radius:4px; font-size:9px; margin-right:8px; font-family:'Poppins', sans-serif; font-weight:bold;">GENEL</span>`;
            if (dispMsg.startsWith('[ALL] ')) { dispMsg = dispMsg.replace('[ALL] ', ''); }
            else if (dispMsg.match(/^\[(.*?)\]\s*(.*)/)) {
                const m = dispMsg.match(/^\[(.*?)\]\s*(.*)/);
                badgeHtml = `<span style="background: rgba(59,130,246,0.2); color:#60a5fa; padding:2px 6px; border-radius:4px; font-size:9px; margin-right:8px; font-family:'Poppins', sans-serif; font-weight:bold;">👤 ${m[1]}</span>`;
                dispMsg = m[2];
            }
            return `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); padding: 12px 15px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px; font-weight: 300; font-family:'Poppins', sans-serif; display:flex; align-items:center;">${badgeHtml} ${dispMsg}</div>
                        <div style="font-family: 'Poppins', sans-serif; font-size: 9px; color: #64748b; letter-spacing: 1px;">
                            <i class="far clock" style="margin-right: 5px;"></i>${new Date(b.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <button onclick="deleteSingleBroadcast(${b.id})" style="background: none; border: none; color: #475569; cursor: pointer; padding: 5px; transition: all 0.2s ease; border-radius: 8px;" onmouseover="this.style.color='#ef4444'; this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.color='#475569'; this.style.background='none'">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        }).join('');
    }
}

window.deleteSingleBroadcast = async function (id) {
    if (!await cyberConfirm("ARŞİV SİLME", "Bu duyuruyu arşivden kaldırmak istediğinize emin misiniz?")) return;
    const { error } = await _supabase.from('broadcasts').delete().eq('id', id);
    if (error) {
        showToast("HATA", "Duyuru silinemedi.", "error");
    } else {
        showToast("SİLİNDİ", "Duyuru arşivden kaldırıldı.", "success");
        fetchBroadcastHistory();
    }
}

async function endPersonnelShift(personelName) {
    if (!await cyberConfirm("MESAYİ SONLANDIRMA", `⚠️ Sayın Yönetici, "${personelName}" isimli personelin mesaisini uzaktan sonlandırmak istediğinize emin misiniz?`)) return;

    const { error } = await _supabase.from('logs').insert([{
        personel_name: personelName,
        type: 'ÇIKIŞ',
        lat: 41.0082,
        lon: 28.9784,
        mahalle: 'Uzaktan Sonlandırma (Yönetici)'
    }]);

    if (error) {
        showToast("HATA", "Mesai sonlandırılamadı: " + error.message, "error");
    } else {
        showToast("İŞLEM BAŞARILI", `📢 "${personelName}" mesaisi uzaktan sonlandırıldı.`, "success");
        if (typeof fetchData === 'function') await fetchData();
    }
}
window.endPersonnelShift = endPersonnelShift;

window.toggleHistory = function () {
    const list = document.getElementById('broadcast-list');
    const icon = document.getElementById('history-icon');
    const text = document.getElementById('history-toggle-text');
    if (!list) return;
    const isHidden = list.style.display === 'none';

    list.style.display = isHidden ? 'flex' : 'none';
    if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    if (text) text.innerText = isHidden ? '(GİZLEMEK İÇİN TIKLAYIN)' : '(GÖRÜNTÜLEMEK İÇİN TIKLAYIN)';

    if (isHidden) fetchBroadcastHistory(); // Açıldığında veriyi tazele
}

async function loadStaffList() {
    const { data, error } = await _supabase.from('users').select('*').order('ad_soyad', { ascending: true });
    if (data) {
        const table = document.getElementById('staffListTable');
        if (!table) return;
        table.innerHTML = data.map(u => {
            const deviceBadge = u.device_id ? `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; padding: 2px 6px; border-radius: 6px; font-size: 8px; margin-left: 8px;">🔒 EŞLEŞTİ</span>` : `<span style="background: rgba(244, 129, 32, 0.15); color: #f48120; border: 1px solid #f48120; padding: 2px 6px; border-radius: 6px; font-size: 8px; margin-left: 8px;">🔓 KİLİTSİZ</span>`;
            const cleanName = u.ad_soyad ? u.ad_soyad.replace(/["']/g, '').replace(/[\r\n]/g, '').trim() : 'Personel';
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 15px; color: #fff; font-weight: 600;">${u.ad_soyad} ${deviceBadge}</td>
                    <td style="padding: 15px; font-family: 'Orbitron'; color: var(--primary);">••••</td>
                    <td style="padding: 15px; text-align: right;">
                        <button onclick="resetDevice('${cleanName}')" style="background: rgba(244, 129, 32, 0.1); border: 1px solid #f48120; color: #f48120; padding: 5px 12px; border-radius: 8px; cursor: pointer; font-size: 10px; margin-right: 5px;">📱 CİHAZ KİLİDİNİ AÇ</button>
                        <button onclick="deleteStaff('${cleanName}')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; padding: 5px 12px; border-radius: 8px; cursor: pointer; font-size: 10px;">SİL</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

async function resetDevice(name) {
    if (!await cyberConfirm("CİHAZ KİLİDİ SIFIRLAMA", `${name} adlı personelin cihaz eşleşmesini sıfırlamak istediğinize emin misiniz? Personel yeni telefonundan giriş yaptığında cihazı otomatik eşleşecektir.`)) return;

    const { error } = await _supabase.from('users').update({ device_id: null }).eq('ad_soyad', name);
    if (error) {
        showToast("SİSTEM UYARISI", "Güncelleme yapılamadı: " + error.message, "error");
    } else {
        showToast("CİHAZ SIFIRLANDI", `✅ ${name} adlı personelin cihaz kilidi başarıyla açıldı.`, "success");
        if (typeof loadStaffList === 'function') loadStaffList();
        if (typeof fetchStaffList === 'function') fetchStaffList();
    }
}

async function addStaff() {
    const nameEl = document.getElementById('newStaffName');
    const pinEl = document.getElementById('newStaffPin');
    if (!nameEl || !pinEl) return;
    const name = nameEl.value.trim();
    const pin = pinEl.value.trim();
    if (!name || pin.length !== 4) {
        showToast("UYARI", "Lütfen geçerli isim ve 4 haneli PIN girin!", "error");
        return;
    }

    // 🔍 AYNI ŞİFRE (PIN) DENETİMİ - RPC ile Güvenli Veritabanı Kontrolü
    const { data: pinExists, error: checkError } = await _supabase.rpc('check_pin_exists', { input_pin: pin });
    if (checkError) {
        console.warn("PIN çakışma kontrolü hatası:", checkError);
    } else if (pinExists) {
        showToast("PIN ÇAKIŞMASI", `⚠️ DİKKAT: Bu PIN kodu zaten başka bir personele tanımlı! Lütfen farklı bir PIN belirleyin.`, "error");
        return;
    }

    const { error } = await _supabase.from('users').insert([{ ad_soyad: name, pin: pin }]);
    if (error) {
        showToast("HATA", "Veritabanı bağlantısı kurulamadı: " + error.message, "error");
    } else {
        showToast("PERSONEL EKLENDİ", `✅ ${name} başarıyla sisteme kaydedildi.`, "success");
        nameEl.value = "";
        pinEl.value = "";
        if (typeof loadStaffList === 'function') loadStaffList();
        if (typeof fetchStaffList === 'function') fetchStaffList();
    }
}

async function deleteStaff(name) {
    if (!await cyberConfirm("PERSONEL SİLME", `${name} isimli personeli sistemden kalıcı olarak silmek istediğinize emin misiniz?`)) return;

    const { error } = await _supabase.from('users').delete().eq('ad_soyad', name);
    if (error) {
        showToast("HATA", "Personel silinemedi: " + error.message, "error");
    } else {
        showToast("SİLİNDİ", `✅ ${name} kaydı sistemden kaldırıldı.`, "success");
        if (typeof loadStaffList === 'function') loadStaffList();
        if (typeof fetchStaffList === 'function') fetchStaffList();
    }
}

// 🚨 TÜM FONKSİYONLARI DIŞARI AÇ (Window Scope)
window.nextStep = nextStep;
window.fetchData = fetchData;
window.applyFilter = applyFilter;
window.sendBroadcast = sendBroadcast;
window.deleteBroadcasts = deleteBroadcasts;
window.addStaff = addStaff;
window.deleteStaff = deleteStaff;
window.resetDevice = resetDevice;

window.logout = logout;
window.executeLogout = executeLogout;
window.exportPDF = exportPDF;
window.showMsg = showMsg;
window.closeMsg = closeMsg;
window.filterActiveStaff = filterActiveStaff;
window.scrollToManagement = scrollToManagement;

function scrollToManagement() {
    setTimeout(() => {
        const target = document.getElementById('staff-management');
        if (target) {
            const yOffset = -20;
            const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }, 100);
}

function updateTrendGraph() {
    const points = []; const hours = 7; const now = new Date();
    for (let i = 0; i <= hours; i++) {
        const targetTime = new Date(now.getTime() - (i * 3600000));
        const count = window.allLogs.filter(l => new Date(l.raw_time).getHours() === targetTime.getHours()).length;
        points.push(30 - (Math.min(count, 5) * 5));
    }
    const pathData = points.reverse().map((p, i) => `${i === 0 ? 'M' : 'L'}${i * 15},${p}`).join(' ');
    if (document.getElementById('trendPath')) document.getElementById('trendPath').setAttribute('d', pathData);
}

// calculateScore → shared.js'den gelir (window.calculateScore)

function runAIAnalysis() {
    const names = [...new Set(window.allLogs.map(l => l.personel))]
        .filter(n => !n.includes("BILINMEYEN") && !n.includes("BİLİNMEYEN"));

    if (names.length === 0) {
        const aiText = document.getElementById('ai-text');
        if (aiText) aiText.innerHTML = "🧠 Veri akışı bekleniyor...";
        return;
    }

    let activeStaff = 0;
    let criticalCount = 0;
    let bestPerson = { name: "", score: -1, hours: 0 };
    let worstPerson = { name: "", score: 101 };
    let remoteStaffNames = [];
    let overtimeStaffNames = [];
    let totalActionsToday = window.allLogs.filter(l => new Date(l.raw_time).toDateString() === new Date().toDateString()).length;

    const shopLat = 41.0000;
    const shopLon = 28.0000;

    names.forEach(name => {
        const logs = window.allLogs.filter(l => l.personel === name);
        const lastAction = logs.find(l => l.type === 'GİRİŞ' || l.type === 'ÇIKIŞ');
        const score = calculateScore(name);

        let totalHours = 0;
        let lastIn = null;
        logs.slice().reverse().forEach(log => {
            if (log.type === 'GİRİŞ') lastIn = new Date(log.raw_time);
            else if (log.type === 'ÇIKIŞ' && lastIn) {
                totalHours += (new Date(log.raw_time) - lastIn) / 3600000;
                lastIn = null;
            }
        });
        if (lastIn) totalHours += (new Date() - lastIn) / 3600000;

        if (score > bestPerson.score || (score === bestPerson.score && totalHours > bestPerson.hours)) {
            bestPerson = { name, score, hours: Math.round(totalHours || logs.length * 4.5) };
        }
        if (score < worstPerson.score) {
            worstPerson = { name, score };
        }

        if (lastAction && lastAction.type === 'GİRİŞ') {
            activeStaff++;
            const hoursInShift = (new Date() - new Date(lastAction.raw_time)) / 3600000;
            if (hoursInShift > 10.5) {
                criticalCount++;
                overtimeStaffNames.push(name);
            }

            const distLat = Math.abs(lastAction.lat - shopLat);
            const distLon = Math.abs(lastAction.lon - shopLon);
            if (distLat > 0.005 || distLon > 0.005) {
                remoteStaffNames.push(name);
            }
        }
    });

    const aiText = document.getElementById('ai-text');
    let aiMsg = `<div style="display:flex; flex-direction:column; gap:12px;">`;

    if (remoteStaffNames.length > 0) {
        aiMsg += `<div>📍 <b style="color:#f48120">DIŞ MEKAN GİRİŞİ:</b> <span style="color:#fff; background:#ef4444; padding:2px 6px; border-radius:4px;">${remoteStaffNames.join(", ")}</span> dükkan dışından işlem yaptı!</div>`;
    } else if (criticalCount > 0) {
        aiMsg += `<div>⚠️ <b style="color:#ef4444">KRİTİK DURUM:</b> Mesaisi 10.5 saati aşıp çıkış yapmayanlar var.</div>`;
    } else {
        aiMsg += `<div>✅ <b style="color:#10b981">GÜVENLİ:</b> Tüm personel dükkan sınırları içerisinde ve operasyon normal akışında.</div>`;
    }

    if (bestPerson.name) {
        const hoursDisplay = bestPerson.hours > 0 ? bestPerson.hours : 42;
        aiMsg += `<div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 12px; border-radius: 0 8px 8px 0; font-size: 11px; line-height: 1.5;">
                💡 <b style="color:#10b981">TAVSİYE (ShiftAI Koç):</b> <b>${bestPerson.name}</b> bu hafta yoğun mesai (${hoursDisplay} saat) yaptı ve verimlilik puanı ${bestPerson.score}. Kendisine Cuma günü ek izin veya prim verilmesi operasyonel motivasyonu artıracaktır.
            </div>`;
    }

    if (worstPerson.name && worstPerson.score < 100) {
        aiMsg += `<div style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px; border-radius: 0 8px 8px 0; font-size: 11px; line-height: 1.5;">
                ⚠️ <b style="color:#ef4444">DİKKAT (ShiftAI Analiz):</b> <b>${worstPerson.name}</b> son günlerde operasyonel esneklik ihlalleri veya gecikmeler gösteriyor (Puan: ${worstPerson.score}). Birebir iletişime geçilmesi ve durum değerlendirmesi yapılması önerilir.
            </div>`;
    } else if (names.length > 1) {
        const secondPerson = names.filter(n => n !== bestPerson.name)[0];
        aiMsg += `<div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; padding: 12px; border-radius: 0 8px 8px 0; font-size: 11px; line-height: 1.5;">
                🔄 <b style="color:#3b82f6">ROTASYON ÖNERİSİ:</b> <b>${secondPerson}</b> aktif operasyonda istikrarlı devam ediyor. Gün içi mola rotasyonlarında öncelik tanınması enerji dengesini koruyacaktır.
            </div>`;
    }

    aiMsg += `<div style="font-size: 10px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">📊 <b>ÖZET:</b> Bugün ${totalActionsToday} işlem işlendi. Mağaza genel disiplin ortalaması: %${Math.round(names.reduce((acc, n) => acc + calculateScore(n), 0) / names.length)}.</div>`;
    aiMsg += `</div>`;

    const anomalies = [];
    if (remoteStaffNames.length > 0) {
        remoteStaffNames.forEach(name => anomalies.push({ type: 'OUTSIDE', name: name }));
    }
    if (overtimeStaffNames.length > 0) {
        overtimeStaffNames.forEach(name => anomalies.push({ type: 'OVERTIME', name: name }));
    }
    if (window.ShiftAI) window.ShiftAI.updateSuggestions(anomalies);

    if (aiText) aiText.innerHTML = aiMsg;
}

function calculateRowDuration(currentLog, logs, preSortedPersonLogs = null) {
    const personLogs = preSortedPersonLogs || logs.filter(l => l.personel === currentLog.personel).sort((a, b) => new Date(a.raw_time) - new Date(b.raw_time));
    const lastGiris = personLogs.filter(l => new Date(l.raw_time) <= new Date(currentLog.raw_time) && l.type === 'GİRİŞ').pop();
    if (!lastGiris) return "BAŞLANGIÇ YOK";
    const followingCikis = personLogs.filter(l => new Date(l.raw_time) > new Date(lastGiris.raw_time) && l.type === 'ÇIKIŞ')[0];
    let endTime = followingCikis ? new Date(followingCikis.raw_time) : new Date();
    let diff = Math.max(0, endTime - new Date(lastGiris.raw_time));
    return `${Math.floor(diff / 3600000)}s ${Math.floor((diff % 3600000) / 60000)}dk`;
}

function checkCriticalAlert(log, all, preFilteredPersonLogs = null) {
    if (log.type !== 'GİRİŞ') return false;
    const personLogs = preFilteredPersonLogs || all.filter(l => l.personel === log.personel);
    const lastMainAction = personLogs.find(l => l.type === 'GİRİŞ' || l.type === 'ÇIKIŞ');
    if (lastMainAction && lastMainAction.type === 'ÇIKIŞ') return false;
    const lastGiris = personLogs.find(l => l.type === 'GİRİŞ');
    if (lastGiris && lastGiris.id !== log.id) return false;
    const girisZamani = new Date(log.raw_time);
    const simdi = new Date();
    const farkSaat = (simdi - girisZamani) / 3600000;
    return farkSaat > 10;
}

function updateDashboard() {
    const staffSelect = document.getElementById('staffFilter');
    const currentStaff = staffSelect ? staffSelect.value : 'all';

    // OPTİMİZASYON: Logları tek geçişte personele göre grupla (O(M))
    const logsByPerson = {};
    const todayStr = new Date().toDateString();
    let todayCount = 0;
    window.allLogs.forEach(l => {
        const p = l.personel;
        if (!logsByPerson[p]) logsByPerson[p] = [];
        logsByPerson[p].push(l);
        if (new Date(l.raw_time).toDateString() === todayStr) todayCount++;
    });

    const names = Object.keys(logsByPerson).sort();
    if (staffSelect) {
        staffSelect.innerHTML = '<option value="all">TÜMÜ</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
        if (currentStaff && [...names, 'all'].includes(currentStaff)) {
            staffSelect.value = currentStaff;
        }
    }
    const statTotal = document.getElementById('stat-total');
    if (statTotal) statTotal.innerText = window.allLogs.length;
    let realActiveCount = 0;
    names.forEach(name => {
        const personLogs = logsByPerson[name];
        const lastMainAction = personLogs.find(l => l.type === 'GİRİŞ' || l.type === 'ÇIKIŞ');
        if (lastMainAction && lastMainAction.type === 'GİRİŞ') realActiveCount++;
    });
    const statStaff = document.getElementById('stat-staff');
    if (statStaff) statStaff.innerText = realActiveCount;
    const statToday = document.getElementById('stat-today');
    if (statToday) statToday.innerText = todayCount;

    if (isActiveStaffMode) {
        filterActiveStaff(false);
    } else {
        applyFilter(false);
    }
}

function applyFilter(fromUser = true) {
    if (fromUser !== false) {
        isActiveStaffMode = false;
    }
    const staffEl = document.getElementById('staffFilter');
    const sDEl = document.getElementById('startDate');
    const eDEl = document.getElementById('endDate');
    const staff = staffEl ? staffEl.value : 'all';
    const sD = sDEl ? sDEl.value : '';
    const eD = eDEl ? eDEl.value : '';
    let filtered = window.allLogs;
    if (staff !== "all") filtered = filtered.filter(l => l.personel === staff);
    if (sD) filtered = filtered.filter(l => new Date(l.raw_time) >= new Date(sD));
    if (eD) filtered = filtered.filter(l => new Date(l.raw_time) <= new Date(eD + "T23:59:59"));

    const logTableEl = document.getElementById('logTable');
    if (logTableEl) {
        // OPTİMİZASYON: Logları tek geçişte grupla ve skor önbelleği oluştur
        const { personLogsMap, sortedPersonLogsMap, getCachedScore } = window.buildLogDataCache(window.allLogs);

        logTableEl.innerHTML = filtered.map(log => {
            const pLogs = personLogsMap[log.personel] || [];
            if (!sortedPersonLogsMap[log.personel]) {
                sortedPersonLogsMap[log.personel] = pLogs.slice().reverse();
            }
            const pLogsSorted = sortedPersonLogsMap[log.personel];

            const isCrit = checkCriticalAlert(log, window.allLogs, pLogs);
            let hoursDiff = 0;
            if (isCrit && log.type === 'GİRİŞ') {
                const girisZamani = new Date(log.raw_time);
                hoursDiff = (new Date() - girisZamani) / 3600000;
            }

            const score = getCachedScore(log.personel);
            const isNew = (new Date() - new Date(log.raw_time)) < 30000;
            const isMessage = log.type === 'MESAJ';
            const isUnknown = log.personel.includes("BILINMEYEN") || log.personel.includes("BİLİNMEYEN");
            const durationText = calculateRowDuration(log, window.allLogs, pLogsSorted);

            const clickAction = isMessage ? `onclick="showMsg('${log.personel}', '${log.mahalle.replace(/'/g, "\\'")}', '${log.time}')"` : "";
            const badgeStyle = isMessage ? 'background: #9333ea; cursor: pointer; border-color: #a78bfa;' : '';
            const displayText = isMessage ? '📩 MESAJI OKU' : log.type;

            let isOffline = log.mahalle && log.mahalle.includes('⚡ Çevrimdışı');
            let noteText = isMessage ? '📝 Personel Bildirimi Gönderdi' : log.mahalle.replace(' (⚡ Çevrimdışı)', '');
            let offlineBadge = isOffline ? `<br><span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 6px; font-size: 8px; font-family: 'Orbitron'; display: inline-block; margin-top: 5px;">⚡ ÇEVRİMDİŞI EŞİTLENDİ</span>` : '';

            const scoreBox = !isUnknown ? `<div class="score-box ${score < 70 ? 'low-score' : ''}">⭐ ${score} Puan</div>` : '';

            const actionCol = isMessage
                ? `<a href="javascript:void(0)" ${clickAction} class="btn-msg-read" style="margin-bottom:8px; display:inline-block;">AÇ / OKU</a><br><span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${log.time}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${log.date_str || log.time}</span>`
                : `<span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${log.time}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${log.date_str || log.time}</span>`;

            const forceEndBtn = (hoursDiff >= 10.5)
                ? `<button onclick="window.endPersonnelShift('${log.personel}')" class="btn-cyber" style="background:#ef4444; color:#fff; font-size:9px; font-family:'Poppins', sans-serif; font-weight:600; padding:4px 8px; border-radius:4px; margin-left:6px; cursor:pointer; border:none; display:inline-block; vertical-align:middle; box-shadow:0 0 8px rgba(239,68,68,0.4);">🔴 BİTİR</button>`
                : '';

            return `<tr class="${isCrit ? 'critical-alarm' : ''} ${isNew ? 'new-action-row' : ''}">
<td style="font-family:'Poppins', sans-serif; font-size:15px; font-weight:700; letter-spacing:0.5px; color:var(--text-main);">
    ${log.personel}<br>
    ${scoreBox}
    ${isCrit ? `<br><span class="critical-badge" style="display:inline-block; vertical-align:middle;">⚠️ 10 SAAT+ MESAİ</span>${forceEndBtn}` : ''} 
</td>
<td>
    <span class="badge ${log.type}" ${clickAction} style="${badgeStyle}">${displayText}</span><br>
    <small style="color:var(--primary); font-weight:700;">⏱️ ${durationText}</small>
</td>
<td><div class="${isMessage ? 'msg-text-truncate' : ''}">${noteText}</div>${offlineBadge}<br><a href="https://www.google.com/maps?q=${log.lat},${log.lon}" target="_blank" style="color:#3b82f6; font-size:10px; font-weight:700; text-decoration:none; display:inline-block; margin-top:5px;">📍 KONUM</a></td>
<td>${actionCol}</td>
</tr>`;
        }).join('');
    }
}

function filterActiveStaff(fromUser = true) {
    if (fromUser !== false) {
        isActiveStaffMode = true;
    }
    const names = [...new Set(allLogs.map(l => l.personel))];
    const activeLogsOnly = [];

    names.forEach(name => {
        const personLogs = allLogs.filter(l => l.personel === name);
        const lastWorkAction = personLogs.find(l => l.type === 'GİRİŞ' || l.type === 'ÇIKIŞ');
        if (lastWorkAction && lastWorkAction.type === 'GİRİŞ') {
            activeLogsOnly.push(lastWorkAction);
        }
    });

    const logTable = document.getElementById('logTable');
    if (logTable) {
        if (activeLogsOnly.length === 0) {
            logTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:50px; opacity:0.5; font-family:'Orbitron';">Şu an dükkanda aktif personel bulunmuyor.</td></tr>`;
        } else {
            renderCustomTable(activeLogsOnly);
        }
    }

    const staffFilterEl = document.getElementById('staffFilter');
    if (staffFilterEl) staffFilterEl.value = 'all';
    const aiTextEl = document.getElementById('ai-text');
    if (aiTextEl) aiTextEl.innerHTML = `⚡ <b>GÜNCEL TAKİP:</b> Personel mesaj gönderse dahi mesai takibi devam eder. Şu an ${activeLogsOnly.length} personel içeride.`;

    if (fromUser !== false) {
        scrollToManagement();
    }
}

function filterDailyTraffic() {
    const sDEl = document.getElementById('startDate');
    const eDEl = document.getElementById('endDate');
    const staffEl = document.getElementById('staffFilter');

    if (sDEl && eDEl) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        sDEl.value = yesterday.toISOString().slice(0, 10);
        eDEl.value = now.toISOString().slice(0, 10);
    }
    if (staffEl) staffEl.value = 'all';

    isActiveStaffMode = false;
    applyFilter();
    showToast("GÜNLÜK TRAFİK", "Son 24 saatlik operasyon hareketleri listelendi.", "info");
    scrollToManagement();
}

function filterTotalRecords() {
    const sDEl = document.getElementById('startDate');
    const eDEl = document.getElementById('endDate');
    const staffEl = document.getElementById('staffFilter');

    if (sDEl) sDEl.value = '';
    if (eDEl) eDEl.value = '';
    if (staffEl) staffEl.value = 'all';

    isActiveStaffMode = false;
    applyFilter();
    showToast("TOPLAM KAYIT", "Tüm geçmiş operasyon hareketleri listelendi.", "info");
    scrollToManagement();
}

function renderCustomTable(data) {
    const table = document.getElementById('logTable');
    if (!table) return;

    // OPTİMİZASYON: Logları tek geçişte grupla ve skor önbelleği oluştur
    const { personLogsMap, sortedPersonLogsMap, getCachedScore } = window.buildLogDataCache(allLogs);

    table.innerHTML = data.map(log => {
        const pLogs = personLogsMap[log.personel] || [];
        if (!sortedPersonLogsMap[log.personel]) {
            sortedPersonLogsMap[log.personel] = pLogs.slice().reverse();
        }
        const pLogsSorted = sortedPersonLogsMap[log.personel];

        const isCrit = checkCriticalAlert(log, allLogs, pLogs);
        const score = getCachedScore(log.personel);
        const isMessage = log.type === 'MESAJ';
        const durationText = calculateRowDuration(log, allLogs, pLogsSorted);

        const clickAction = isMessage ? `onclick="showMsg('${log.personel}', '${log.mahalle.replace(/'/g, "\\'")}', '${log.time}')"` : "";
        const badgeStyle = isMessage ? 'background: #9333ea; cursor: pointer; border-color: #a78bfa;' : '';
        const displayText = isMessage ? '📩 MESAJI OKU' : log.type;

        let isOffline = log.mahalle && log.mahalle.includes('⚡ Çevrimdışı');
        let noteText = log.mahalle.replace(' (⚡ Çevrimdışı)', '');
        let offlineBadge = isOffline ? `<br><span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 6px; font-size: 8px; font-family: 'Orbitron'; display: inline-block; margin-top: 5px;">⚡ ÇEVRİMDİŞI EŞİTLENDİ</span>` : '';

        const actionCol = isMessage
            ? `<a href="javascript:void(0)" ${clickAction} class="btn-msg-read" style="margin-bottom:8px; display:inline-block;">AÇ / OKU</a><br><span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${log.time.split(' ')[1] || log.time}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${log.time.split(' ')[0] || log.time}</span>`
            : `<span class="log-time-highlight" style="font-size:15px; font-family:'Orbitron', sans-serif; color:var(--text-main); font-weight:700;"><i class="fas fa-clock time-icon" style="color:var(--primary); margin-right:5px;"></i> ${log.time.split(' ')[1] || log.time}</span><br><span style="font-size:12px; font-family:'Poppins', sans-serif; font-weight:600; color:var(--text-muted); display:inline-block; margin-top:4px;">📅 ${log.time.split(' ')[0] || log.time}</span>`;

        return `<tr class="${isCrit ? 'critical-alarm' : ''}">
<td style="font-family:'Poppins', sans-serif; font-size:15px; font-weight:700; letter-spacing:0.5px; color:var(--text-main);">
    ${log.personel}<br>
    <div class="score-box ${score < 70 ? 'low-score' : ''}">⭐ ${score} Puan</div>
    ${isCrit ? '<br><span class="critical-badge">⚠️ 10 SAAT+ MESAİ</span>' : ''} 
</td>
<td>
    <span class="badge ${log.type}" ${clickAction} style="${badgeStyle}">${displayText}</span><br>
    <small style="color:var(--primary); font-weight:700;">⏱️ ${durationText}</small>
</td>
<td>${noteText}${offlineBadge}<br><a href="https://www.google.com/maps?q=${log.lat},${log.lon}" target="_blank" style="color:#3b82f6; font-size:10px; font-weight:700; text-decoration:none; display:inline-block; margin-top:5px;">📍 KONUM</a></td>
<td>${actionCol}</td>
</tr>`;
    }).join('');
}

function showMsg(person, text, time) {
    document.getElementById('msg-body').innerHTML = `<b style="color:var(--text-main);">${person}:</b><br><br>"${text}"`;
    document.getElementById('msg-time-footer').innerText = `GÖNDERİM ZAMANI: ${time}`;
    document.getElementById('msg-modal').style.display = 'flex';
}

function closeMsg() { document.getElementById('msg-modal').style.display = 'none'; }

function cleanPdfText(text) {
    if (!text) return "";
    let str = text.toString();
    str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
    str = str.replace(/[\u2600-\u27BF]/g, '');
    str = str.replace(/[\u2300-\u23FF]/g, '');
    str = str.replace(/[\u2B50]/g, '');
    str = str.replace(/⏱️|📩|📍|⭐|⚠️|📝|⚡|💸|📊|📜|📄/g, '');
    str = str.replace(/AÇ \/ OKU/g, '');

    return str.trim();
}

async function exportPDF() {
    const staffEl = document.getElementById('staffFilter');
    const sDEl = document.getElementById('startDate');
    const eDEl = document.getElementById('endDate');
    if (!staffEl) return;
    const staff = staffEl.value;
    const sD = sDEl ? sDEl.value : '';
    const eD = eDEl ? eDEl.value : '';

    let filteredLogs = allLogs;
    if (staff !== "all") filteredLogs = filteredLogs.filter(l => l.personel === staff);
    if (sD) filteredLogs = filteredLogs.filter(l => new Date(l.raw_time) >= new Date(sD));
    if (eD) filteredLogs = filteredLogs.filter(l => new Date(l.raw_time) <= new Date(eD + "T23:59:59"));

    if (filteredLogs.length === 0) {
        showToast("UYARI", "Seçili kriterlerde kayıt bulunamadığı için rapor oluşturulamadı.", "warning");
        return;
    }

    showToast("RAPOR HAZIRLANIYOR", "Fontlar ayarlanıyor, lütfen bekleyin...", "info");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const originalAddPage = doc.addPage;
    doc.addPage = function () {
        originalAddPage.apply(this, arguments);
        doc.setFillColor(10, 15, 30);
        doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');
    };
    const now = new Date();

    try {
        const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
        const resp = await fetch(fontUrl);
        const blob = await resp.blob();
        const base64Font = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });

        doc.addFileToVFS("Roboto-Regular.ttf", base64Font);
        doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
        
        const fontUrlBold = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf';
        const respBold = await fetch(fontUrlBold);
        const blobBold = await respBold.blob();
        const base64FontBold = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blobBold);
        });
        doc.addFileToVFS("Roboto-Medium.ttf", base64FontBold);
        doc.addFont("Roboto-Medium.ttf", "Roboto", "bold");

        doc.setFont("Roboto", "normal");
    } catch (e) {
        console.warn("Font yüklenemedi, varsayılan fonta geçiliyor.", e);
    }

    doc.setFillColor(10, 15, 30);
    doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');

    doc.setTextColor(244, 129, 32);
    doc.setFont('Roboto', 'bold'); doc.setFontSize(24);
    const busNameExt = window.currentBusinessName ? " - " + window.currentBusinessName.toLocaleUpperCase('tr-TR') : "";
    doc.text(cleanPdfText("SHİFT TURBO" + busNameExt), 40, 50);

    doc.setFontSize(11); doc.setTextColor(148, 163, 184); doc.setFont('Roboto', 'normal');
    doc.text(cleanPdfText("OPERASYON RAPORU | YÖNETİCİ TERMİNALİ"), 40, 72);

    doc.setDrawColor(244, 129, 32); doc.setLineWidth(1.5);
    doc.line(40, 85, doc.internal.pageSize.width - 40, 85);

    doc.setFontSize(10); doc.setTextColor(203, 213, 225);
    doc.text(cleanPdfText(`Filtre: ${staff === 'all' ? 'Tüm Personel' : staff} | Tarih: ${sD || 'Başlangıç Belirtilmedi'} - ${eD || 'Bugün'}`), 40, 110);

    const summaryData = {}; const groupedLogs = {};
    filteredLogs.forEach(log => { if (!groupedLogs[log.personel]) groupedLogs[log.personel] = []; groupedLogs[log.personel].push(log); });

    Object.keys(groupedLogs).forEach(name => {
        const logs = groupedLogs[name].sort((a, b) => new Date(a.raw_time) - new Date(b.raw_time));
        let totalMs = 0; let shiftCount = 0; let lastGirisTime = null;
        logs.forEach(log => {
            if (log.type === 'GİRİŞ') { shiftCount++; lastGirisTime = new Date(log.raw_time); }
            else if (log.type === 'ÇIKIŞ' && lastGirisTime) { totalMs += (new Date(log.raw_time) - lastGirisTime); lastGirisTime = null; }
        });
        if (lastGirisTime) totalMs += (now - lastGirisTime);
        summaryData[name] = { count: shiftCount, duration: `${Math.floor(totalMs / 3600000)}s ${Math.floor((totalMs % 3600000) / 60000)}dk` };
    });

    // 1. MESAİ ÖZET TABLOSU
    const summaryRows = Object.keys(summaryData).map(name => [cleanPdfText(name), summaryData[name].count + " Kez", summaryData[name].duration]);

    doc.setFontSize(14); doc.setTextColor(59, 130, 246); doc.setFont('Roboto', 'bold');
    doc.text(cleanPdfText("📝 MESAİ ÖZETİ"), 40, 130);

    doc.autoTable({
        startY: 145,
        head: [['PERSONEL', 'MESAİ SAYISI', 'TOPLAM SÜRE']],
        body: summaryRows,
        theme: 'grid',
        styles: { fillColor: [15, 23, 42], textColor: [220, 226, 235], font: 'Roboto', fontSize: 9, lineColor: [51, 65, 85], lineWidth: 0.5, cellPadding: 8 },
        headStyles: { fillColor: [59, 130, 246], textColor: [10, 15, 30], fontStyle: 'bold', fontSize: 10 },
        alternateRowStyles: { fillColor: [8, 12, 25] },
        margin: { left: 40, right: 40 },
        willDrawPage: function (data) {
            doc.setFillColor(10, 15, 30);
            doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');
        }
    });

    // 2. 💸 OTONOM HAKEDİŞ VE MAAŞ TABLOSU VERİLERİNİ TOPLA
    const financeTableData = [];
    const rates = window.ShiftTurboShared.getObfuscated('shiftTurbo_hourly_rates') || {};
    const users = window.allUsers || [];
    let grandTotalPay = 0;

    users.forEach(u => {
        const name = u.ad_soyad.trim().toLocaleUpperCase('tr-TR');
        const rate = Number((rates[u.pin] || 200).toFixed(2));
        const hours = typeof calculateStaffHours === 'function' ? calculateStaffHours(name, filteredLogs) : 0;
        const basePay = hours * rate;
        const score = typeof window.calculateScore === 'function' ? window.calculateScore(name) : 100;
        const penaltyPercent = (100 - score) * 0.5;
        const penaltyAmount = basePay * (penaltyPercent / 100);
        const netPay = Math.max(0, basePay - penaltyAmount);

        grandTotalPay += netPay;
        financeTableData.push([
            cleanPdfText(name),
            cleanPdfText(`${rate} TL`),
            cleanPdfText(`${hours.toFixed(1)} Saat`),
            cleanPdfText(`${basePay.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`),
            cleanPdfText(`${score} Puan (-${penaltyAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL)`),
            cleanPdfText(`${netPay.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`)
        ]);
    });

    const nextY1 = doc.lastAutoTable.finalY + 35;

    doc.setFontSize(14); doc.setTextColor(16, 185, 129); doc.setFont('Roboto', 'bold');
    doc.text(cleanPdfText("💸 OTONOM HAKEDİŞ VE MAAŞ TABLOSU"), 40, nextY1);

    doc.setFontSize(10); doc.setTextColor(148, 163, 184); doc.setFont('Roboto', 'normal');
    doc.text(cleanPdfText(`(Tarih: ${sD || 'Başlangıç'} / ${eD || 'Bugün'}) | Net Ödeme: ${grandTotalPay.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`), doc.internal.pageSize.width - 350, nextY1 + 15);

    doc.autoTable({
        startY: nextY1 + 25,
        head: [['PERSONEL', 'SAATLİK ÜCRET', 'NET MESAİ', 'HAM HAKEDİŞ', 'DİSİPLİN DURUMU', 'NET ÖDENECEK']],
        body: financeTableData,
        theme: 'grid',
        styles: { fillColor: [15, 23, 42], textColor: [220, 226, 235], font: 'Roboto', fontSize: 9, lineColor: [51, 65, 85], lineWidth: 0.5, cellPadding: 8 },
        headStyles: { fillColor: [16, 185, 129], textColor: [10, 15, 30], fontStyle: 'bold', fontSize: 10 },
        columnStyles: { 5: { fontStyle: 'bold', textColor: [16, 185, 129], halign: 'right' } },
        alternateRowStyles: { fillColor: [8, 12, 25] },
        margin: { left: 40, right: 40 },
        willDrawPage: function (data) {
            doc.setFillColor(10, 15, 30);
            doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');
        }
    });

    const nextY2 = doc.lastAutoTable.finalY + 35;

    // 3. DETAYLI OPERASYON LOGLARI
    const detailRows = filteredLogs.map(l => [cleanPdfText(l.personel), cleanPdfText(l.type), cleanPdfText(l.mahalle), cleanPdfText(l.time)]);

    doc.setFontSize(14); doc.setTextColor(244, 129, 32); doc.setFont('Roboto', 'bold');
    doc.text(cleanPdfText("📜 DETAYLI OPERASYON LOGLARI"), 40, nextY2);

    doc.autoTable({
        startY: nextY2 + 15,
        head: [['PERSONEL', 'İŞLEM', 'BÖLGE/NOT', 'ZAMAN']],
        body: detailRows,
        theme: 'grid',
        styles: { fillColor: [15, 23, 42], textColor: [220, 226, 235], font: 'Roboto', fontSize: 9, lineColor: [51, 65, 85], lineWidth: 0.5, cellPadding: 8 },
        headStyles: { fillColor: [244, 129, 32], textColor: [10, 15, 30], fontStyle: 'bold', fontSize: 10 },
        alternateRowStyles: { fillColor: [8, 12, 25] },
        margin: { left: 40, right: 40 },
        willDrawPage: function (data) {
            doc.setFillColor(10, 15, 30);
            doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F');
        }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
        doc.text(cleanPdfText(`Sayfa ${i} / ${pageCount} - ShiftTurbo Yönetim Sistemi`), 40, doc.internal.pageSize.height - 30);
    }

    doc.save("ShiftTurbo_Rapor.pdf");
    showToast("PDF İNDİRİLDİ", "Rapor başarıyla oluşturuldu.", "success");
}

function updateClocks() {
    const now = new Date();
    if (document.getElementById('liveClock')) document.getElementById('liveClock').innerText = now.toLocaleTimeString('tr-TR');
    if (document.getElementById('clock_login')) document.getElementById('clock_login').innerText = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (document.getElementById('date_login')) document.getElementById('date_login').innerText = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

updateClocks();
setInterval(updateClocks, 1000);

function ensureSignature() {
    const badge = document.querySelector('.ucr-badge');
    if (badge && document.body.lastElementChild !== badge) {
        document.body.appendChild(badge);
        badge.style.display = 'flex';
    }
}
setInterval(ensureSignature, 1000);

window.nextStep = nextStep;
window.checkAuth = checkAuth;
window.logout = logout;
window.executeLogout = executeLogout;
window.fetchData = fetchData;
window.applyFilter = applyFilter;
window.filterActiveStaff = filterActiveStaff;
window.filterDailyTraffic = filterDailyTraffic;
window.filterTotalRecords = filterTotalRecords;
window.showMsg = showMsg;
window.closeMsg = closeMsg;
window.exportPDF = exportPDF;
window.toggleHistory = toggleHistory;
window.deleteSingleBroadcast = deleteSingleBroadcast;
}) ();
