/**
 * ShiftTurbo AI Assistant Module
 * Handles Interactive Chat, Predictive Analytics, and Smart Suggestions
 */

(function(window) {
    const AI = {
        history: [],
        apiKey: (window.SHIFTURBO_CONFIG && window.SHIFTURBO_CONFIG.geminiApiKey) || localStorage.getItem('shiftTurbo_gemini_key') || '',
        
        init() {
            console.log("🤖 Shift-AI Assistant Başlatıldı.");
            // Eğer config.js içerisinde API anahtarı tanımlıysa, Local Storage'daki eski/güvensiz anahtarı temizleyelim
            if (window.SHIFTURBO_CONFIG && window.SHIFTURBO_CONFIG.geminiApiKey) {
                if (localStorage.getItem('shiftTurbo_gemini_key')) {
                    localStorage.removeItem('shiftTurbo_gemini_key');
                    console.log("🔒 Eski Gemini API Key tarayıcı hafızasından güvenli bir şekilde silindi.");
                }
            }
            this.updateSuggestions();
        },

        async sendChat() {
            const input = document.getElementById('ai-user-input');
            const query = input.value.trim();
            if (!query) return;

            // Kullanıcı mesajını ekle
            this.addMessage(query, 'user');
            input.value = '';

            if (!this.apiKey) {
                this.addMessage("⚠️ Devam etmek için lütfen ayarlar (⚙️) simgesinden Gemini API anahtarınızı girin.", 'bot');
                return;
            }

            const aiBox = document.getElementById('ai-box');
            aiBox.classList.add('analyzing');

            try {
                const context = this.prepareContext();
                const response = await this.callGemini(query, context);
                this.addMessage(response, 'bot');
            } catch (err) {
                console.error("AI Hatası:", err);
                this.addMessage("❌ Üzgünüm, bir hata oluştu: " + err.message, 'bot');
            } finally {
                aiBox.classList.remove('analyzing');
            }
        },

        addMessage(text, side) {
            const history = document.getElementById('ai-chat-history');
            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-msg ai-msg-${side} fade-in`;
            msgDiv.innerText = text;
            history.appendChild(msgDiv);
            history.scrollTop = history.scrollHeight;
        },

        prepareContext() {
            if (!window.allLogs || window.allLogs.length === 0) return "Sistemde henüz veri yok.";
            
            const now = new Date();
            const todayStr = now.toDateString();
            const todayLogs = window.allLogs.filter(l => new Date(l.raw_time).toDateString() === todayStr);
            
            // Logları tek geçişte kişilere göre grupla (O(M))
            const logsByPerson = {};
            window.allLogs.forEach(l => {
                const p = l.personel;
                if (!logsByPerson[p]) logsByPerson[p] = [];
                logsByPerson[p].push(l);
            });

            const staffNames = Object.keys(logsByPerson);
            let staffSummary = "";
            
            staffNames.forEach(person => {
                // allLogs azalan sırada olduğu için personel loglarını artan sıraya (kronolojik) çeviriyoruz
                const personLogs = logsByPerson[person].slice().reverse();
                
                // Eğer paneldeki daha detaylı ve doğru puanlama fonksiyonu tanımlıysa onu kullan, yoksa yedek hızlı hesaba geç
                let score = 100;
                if (typeof window.calculateScore === 'function') {
                    score = window.calculateScore(person);
                } else {
                    personLogs.forEach(log => { 
                        if (log.type === 'GİRİŞ') { 
                            const isLast = personLogs[personLogs.length - 1] === log; 
                            if (isLast && (now - new Date(log.raw_time)) / 3600000 > 10) score -= 15; 
                        } 
                    });
                    score += Math.floor(personLogs.length / 5) * 2; 
                    score = Math.min(Math.max(score, 0), 100);
                }
                
                // Son durumu ve mesai süresini bul
                const lastLog = personLogs[personLogs.length - 1];
                let statusStr = lastLog ? `${lastLog.type} (${lastLog.time})` : 'Bilinmiyor';
                let overtimeWarning = "";
                
                if (lastLog && lastLog.type === 'GİRİŞ') {
                    const hours = ((now - new Date(lastLog.raw_time)) / 3600000).toFixed(1);
                    statusStr = `MESAİDE (${hours} saattir içeride)`;
                    if (hours > 10.5) overtimeWarning = " [⚠️ KURAL İHLALİ: 10 SAATTEN FAZLA MESAİ!]";
                }
                
                staffSummary += `- ${person}: ${score} Puan | Durum: ${statusStr}${overtimeWarning}\n`;
            });
            
            let context = `Güncel Tarih ve Saat: ${now.toLocaleString('tr-TR')}\n`;
            context += `Bugünkü toplam işlem sayısı: ${todayLogs.length}\n\n`;
            context += `=== PERSONEL PUAN VE DURUM ÖZETİ ===\n${staffSummary}\n`;
            context += `=== SON 20 İŞLEM HAREKETİ ===\n`;
            
            window.allLogs.slice(0, 20).forEach(l => {
                context += `- [${l.date_str || ''} ${l.time}] ${l.personel}: ${l.type} (${l.mahalle})\n`;
            });
 
            return context;
        },

        async callGemini(query, context) {
            let availableModels = [];

            // 1. Önce API'den Kullanıcının Key'ine Tanımlı Modelleri Çekmeyi Dene (En Garanti Yol!)
            try {
                const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
                const listResp = await fetch(listUrl);
                const listData = await listResp.json();

                if (listData.models && listData.models.length > 0) {
                    // Sadece generateContent destekleyen ve flash/pro içeren modelleri filtrele
                    availableModels = listData.models
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                        .map(m => ({ ver: 'v1beta', path: m.name })); // m.name zaten "models/gemini-1.5-flash" formatındadır
                    console.log("🎯 API'den Çekilen Aktif Modeller:", availableModels);
                }
            } catch (err) {
                console.warn("Model listesi çekilemedi, statik listeye geçiliyor.", err);
            }

            // 2. Eğer API'den çekemediysek veya liste boşsa, en geniş statik listeyi kullan
            if (availableModels.length === 0) {
                availableModels = [
                    { ver: 'v1beta', path: 'models/gemini-1.5-flash-latest' },
                    { ver: 'v1', path: 'models/gemini-1.5-flash' },
                    { ver: 'v1beta', path: 'models/gemini-1.5-flash' },
                    { ver: 'v1beta', path: 'models/gemini-1.5-flash-002' },
                    { ver: 'v1beta', path: 'models/gemini-1.5-flash-8b' },
                    { ver: 'v1beta', path: 'models/gemini-1.5-pro-latest' },
                    { ver: 'v1', path: 'models/gemini-1.5-pro' },
                    { ver: 'v1beta', path: 'models/gemini-2.0-flash-exp' }
                ];
            }

            let lastError = "Bilinmeyen Hata";

            for (const model of availableModels) {
                try {
                    // model.path zaten "models/..." ile başlıyor
                    const url = `https://generativelanguage.googleapis.com/${model.ver}/${model.path}:generateContent?key=${this.apiKey}`;

                    const prompt = `
Sen ShiftTurbo Personel Takip Sistemi'nin yapay zeka asistanısın. 
Aşağıdaki sistem verilerini baz alarak kullanıcının sorusuna kısa, öz ve profesyonel bir cevap ver. 
Cevabın 2-3 cümleyi geçmesin.

Sistem Verileri:
${context}

Kullanıcı Sorusu:
${query}
`;

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    });

                    const data = await response.json();

                    if (data.error) {
                        if (data.error.message.includes('API key not valid') || data.error.message.includes('API_KEY_INVALID')) {
                            throw new Error("Geçersiz API Anahtarı! Lütfen kopyaladığın anahtarı kontrol et.");
                        }
                        lastError = `${model.path} (${model.ver}): ${data.error.message}`;
                        continue; // Diğer modele geç
                    }

                    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                        return data.candidates[0].content.parts[0].text;
                    } else if (data.promptFeedback) {
                        lastError = `${model.path}: Yapay zeka güvenlik filtresi cevabı engelledi.`;
                        continue;
                    }
                } catch (err) {
                    if (err.message.includes("Geçersiz API Anahtarı")) throw err;
                    lastError = err.message;
                }
            }

            throw new Error(`Yapay zeka sunucusuna bağlanılamadı. Son Hata: ${lastError}`);
        },

        updateSuggestions(anomalies = []) {
            const box = document.getElementById('ai-suggestion-box');
            if (!box) return;

            // Her zaman gösterilen genel öneriler
            const baseSuggestions = [
                { text: "📊 Bugünkü Özeti Çıkar", query: "Bugünün özetini çıkarır mısın?" },
                { text: "🏆 Haftanın En Disiplinlisi?", query: "Bu haftanın en disiplinli personeli kim?" },
                { text: "⚠️ Mesai İhlali Yapanlar", query: "Şu an 10 saatten fazla mesai yapan veya kural ihlali yapan personelleri listeler misin?" },
                { text: "👥 Şu An Mesaidekiler", query: "Şu an aktif olarak içeride mesaide olan personellerin isimlerini ve durumlarını özetler misin?" },
                { text: "📈 Performans Şampiyonları", query: "Bu hafta en çok mesai yapan ve en yüksek performansı gösteren 3 personeli sıralar mısın?" },
                { text: "😴 Düşük Puanlı Personeller", query: "Puanı 70'in altında olan ve uyarılması gereken personelleri listeler misin?" }
            ];

            // Anomalilere dayalı dinamik öneriler (Tekilleştirilmiş - Deduplicated)
            const seenOutside = new Set();
            const seenOvertime = new Set();

            if (!this.dismissedAnomalies) this.dismissedAnomalies = new Set();

            anomalies.forEach(a => {
                const anomalyKey = a.name + '_' + a.type;
                if (this.dismissedAnomalies.has(anomalyKey)) return;

                if (a.type === 'OUTSIDE' && !seenOutside.has(a.name)) {
                    seenOutside.add(a.name);
                    baseSuggestions.push({ 
                        text: `📢 ${a.name}'ye Uyarı Gönder`, 
                        isAnomaly: true,
                        anomalyKey: anomalyKey,
                        action: async (btnDOM) => {
                            this.dismissedAnomalies.add(anomalyKey);
                            const success = await this.sendQuickBroadcast(`${a.name}, lütfen dükkan sınırları içerisinden giriş yapınız.`, a.name, btnDOM);
                            if (!success) this.dismissedAnomalies.delete(anomalyKey);
                        }
                    });
                }
                if (a.type === 'OVERTIME' && !seenOvertime.has(a.name)) {
                    seenOvertime.add(a.name);
                    baseSuggestions.push({ 
                        text: `🏮 ${a.name} İçin Mola Hatırlatması`, 
                        isAnomaly: true,
                        anomalyKey: anomalyKey,
                        action: async (btnDOM) => {
                            this.dismissedAnomalies.add(anomalyKey);
                            const success = await this.sendQuickBroadcast(`Dikkat ${a.name}: 10 saati aşan mesai tespit edildi. Lütfen mola veriniz.`, a.name, btnDOM);
                            if (!success) this.dismissedAnomalies.delete(anomalyKey);
                        }
                    });
                }
            });

            // Hash/String Karşılaştırması ile Gereksiz DOM Güncellemesini Engelle (Render-Guard)
            const currentKeys = baseSuggestions.map(s => s.text + '_' + (s.anomalyKey || '')).join('|');
            if (this.lastSuggestionsStr === currentKeys) return;
            this.lastSuggestionsStr = currentKeys;

            box.innerHTML = '';
            baseSuggestions.forEach(s => {
                if (s.isAnomaly) {
                    // Anomali uyarıları için özel silinebilir kapsayıcı (Container)
                    const wrapper = document.createElement('div');
                    wrapper.className = 'anomaly-suggestion-wrapper fade-in';
                    wrapper.style.display = 'inline-flex';
                    wrapper.style.alignItems = 'center';
                    wrapper.style.background = 'rgba(239, 68, 68, 0.15)';
                    wrapper.style.border = '1px solid #ef4444';
                    wrapper.style.borderRadius = '8px';
                    wrapper.style.margin = '4px';
                    wrapper.style.overflow = 'hidden';

                    const actionBtn = document.createElement('button');
                    actionBtn.className = 'anomaly-action-btn';
                    actionBtn.innerText = s.text;
                    actionBtn.style.background = 'transparent';
                    actionBtn.style.border = 'none';
                    actionBtn.style.color = '#fca5a5';
                    actionBtn.style.padding = '8px 14px';
                    actionBtn.style.fontFamily = "'Poppins', sans-serif";
                    actionBtn.style.fontSize = '12px';
                    actionBtn.style.fontWeight = 'bold';
                    actionBtn.style.cursor = 'pointer';
                    actionBtn.onclick = () => s.action(wrapper);

                    const dismissBtn = document.createElement('button');
                    dismissBtn.className = 'anomaly-dismiss-btn';
                    dismissBtn.innerHTML = '<i class="fas fa-times"></i>';
                    dismissBtn.title = 'Bu uyarıyı gizle / sil';
                    dismissBtn.style.background = 'rgba(239, 68, 68, 0.3)';
                    dismissBtn.style.border = 'none';
                    dismissBtn.style.borderLeft = '1px solid rgba(239, 68, 68, 0.4)';
                    dismissBtn.style.color = '#fff';
                    dismissBtn.style.padding = '8px 12px';
                    dismissBtn.style.cursor = 'pointer';
                    dismissBtn.style.display = 'flex';
                    dismissBtn.style.alignItems = 'center';
                    dismissBtn.style.justifyContent = 'center';
                    dismissBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.dismissedAnomalies.add(s.anomalyKey);
                        wrapper.style.transition = 'all 0.3s ease';
                        wrapper.style.opacity = '0';
                        wrapper.style.transform = 'scale(0.8)';
                        setTimeout(() => wrapper.remove(), 300);
                        if (typeof showToast === 'function') showToast("UYARI GİZLENDİ", "Yapay zeka uyarısı ekrandan kaldırıldı.", "info");
                    };

                    wrapper.appendChild(actionBtn);
                    wrapper.appendChild(dismissBtn);
                    box.appendChild(wrapper);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'suggestion-btn fade-in';
                    btn.innerText = s.text;
                    btn.onclick = () => {
                        document.getElementById('ai-user-input').value = s.query;
                        this.sendChat();
                    };
                    box.appendChild(btn);
                }
            });
        },

        async sendQuickBroadcast(msg, targetPersonName = "ALL", buttonElement = null) {
            // 1. KULLANICI BUTONA BASTIĞI AN, BUTONU 0. SANİYEDE ANINDA YOK ET!!!
            if (buttonElement && buttonElement.parentNode) {
                buttonElement.style.transition = "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
                buttonElement.style.opacity = "0";
                buttonElement.style.transform = "scale(0.5)";
                setTimeout(() => buttonElement.remove(), 300);
            }

            const targetLabel = targetPersonName === "ALL" ? "Tüm Personeller" : targetPersonName;
            const confirmed = await window.cyberConfirm("HIZLI DUYURU ONAYI", `Şu duyuruyu "${targetLabel}" hedefine özel olarak yayınlamak istiyor musunuz?\n\n"${msg}"`);
            if (!confirmed) return false;

            // 2. Doğrudan veritabanına yaz (İkinci bir gereksiz onay penceresi açan sendBroadcast'i atla!!!)
            const finalMsg = targetPersonName === "ALL" ? `[ALL] ${msg}` : `[${targetPersonName}] ${msg}`;
            if (window._supabase) {
                const { error } = await window._supabase.from('broadcasts').insert([{ message: finalMsg }]);
                if (error) {
                    if (typeof showToast === 'function') showToast("HATA", "Duyuru yayınlanamadı: " + error.message, "error");
                    return false;
                } else {
                    if (typeof showToast === 'function') showToast("DUYURU YAYINLANDI", `${targetLabel} terminaline iletildi.`, "success");
                    if (typeof fetchBroadcastHistory === 'function') fetchBroadcastHistory();
                    return true;
                }
            } else {
                const input = document.getElementById('broadcastMsg');
                const targetSel = document.getElementById('broadcastTarget');
                if (input) {
                    input.value = msg;
                    if (targetSel) targetSel.value = targetPersonName;
                    if (typeof window.sendBroadcast === 'function') window.sendBroadcast();
                }
                return true;
            }
        }
    };

    // Global erişim için window'a bağla
    window.ShiftAI = AI;
    window.sendAIChat = () => AI.sendChat();

    // Başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AI.init());
    } else {
        AI.init();
    }

})(window);
