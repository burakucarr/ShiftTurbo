/**
 * ShiftTurbo AI Assistant Module
 * Handles Interactive Chat, Predictive Analytics, and Smart Suggestions
 */

(function(window) {
    const AI = {
        history: [],
        apiKey: localStorage.getItem('shiftTurbo_gemini_key') || '',
        
        init() {
            console.log("🤖 Shift-AI Assistant Başlatıldı.");
            this.updateSuggestions();
            // Eğer key varsa inputa doldur
            const keyInput = document.getElementById('ai-api-key');
            if (keyInput) keyInput.value = this.apiKey;
        },

        toggleConfig() {
            const config = document.getElementById('ai-api-config');
            config.style.display = config.style.display === 'none' ? 'block' : 'none';
        },

        saveConfig() {
            const key = document.getElementById('ai-api-key').value.trim();
            if (key) {
                this.apiKey = key;
                localStorage.setItem('shiftTurbo_gemini_key', key);
                alert("✅ API Anahtarı Kaydedildi.");
                this.toggleConfig();
            } else {
                alert("⚠️ Lütfen geçerli bir anahtar girin.");
            }
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
            // Mevcut verileri (allLogs) AI'ya gönderilecek formata getir
            if (!window.allLogs || window.allLogs.length === 0) return "Sistemde henüz veri yok.";
            
            const today = new Date().toDateString();
            const todayLogs = window.allLogs.filter(l => new Date(l.raw_time).toDateString() === today);
            
            let context = `Güncel Tarih: ${new Date().toLocaleString('tr-TR')}\n`;
            context += `Bugünkü toplam işlem sayısı: ${todayLogs.length}\n`;
            context += `Kayıtlı personeller: ${[...new Set(window.allLogs.map(l => l.personel))].join(', ')}\n`;
            context += `Son 10 İşlem Detayı:\n`;
            
            window.allLogs.slice(0, 10).forEach(l => {
                context += `- [${l.time}] ${l.personel}: ${l.type} (${l.mahalle})\n`;
            });

            return context;
        },

        async callGemini(query, context) {
            // Eğer daha önce çalışan bir model bulamadıysak, API'den modelleri listele
            if (!this.discoveredModel) {
                try {
                    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
                    const listResp = await fetch(listUrl);
                    const listData = await listResp.json();
                    
                    if (listData.models && listData.models.length > 0) {
                        // "flash" içeren modelleri tercih et, yoksa ilkini al
                        const bestModel = listData.models.find(m => m.name.includes('flash')) || listData.models[0];
                        this.discoveredModel = bestModel.name; // Zaten "models/..." formatında gelir
                        console.log("🎯 Keşfedilen Model:", this.discoveredModel);
                    }
                } catch (err) {
                    console.warn("Model keşfi başarısız, statik listeye geçiliyor.", err);
                }
            }

            const models = this.discoveredModel 
                ? [ { ver: 'v1beta', path: this.discoveredModel } ]
                : [
                    { ver: 'v1beta', path: 'models/gemini-1.5-flash' },
                    { ver: 'v1', path: 'models/gemini-1.5-flash' },
                    { ver: 'v1beta', path: 'models/gemini-pro' }
                ];

            let attempts = [];
            for (const model of models) {
                try {
                    const url = `https://generativelanguage.googleapis.com/${model.ver}/${model.path}:generateContent?key=${this.apiKey}`;
                    
                    const prompt = `
                    Sen ShiftTurbo Personel Takip Sistemi'nin yapay zeka asistanısın. 
                    Aşağıdaki sistem verilerini baz alarak kullanıcının sorusuna kısa, öz ve profesyonel bir cevap ver. 
                    Cevabın 2-3 cümleyi geçmesini istemiyorum.

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
                    if (!data.error) {
                        this.discoveredModel = model.path; // Başarılı olanı kaydet
                        return data.candidates[0].content.parts[0].text;
                    }

                    if (data.error.message.includes('API key not valid') || data.error.message.includes('API_KEY_INVALID')) {
                        throw new Error("Geçersiz API Anahtarı! Lütfen kopyaladığın anahtarı kontrol et.");
                    }
                    attempts.push(`${model.path}: ${data.error.message}`);
                } catch (err) {
                    if (err.message.includes("Geçersiz API Anahtarı")) throw err;
                    attempts.push(`${model.path}: ${err.message}`);
                }
            }
            throw new Error("Bağlantı kurulamadı. Lütfen API anahtarınızı veya internet bağlantınızı kontrol edin.");
        },

        updateSuggestions(anomalies = []) {
            const box = document.getElementById('ai-suggestion-box');
            if (!box) return;
            box.innerHTML = '';

            // Her zaman gösterilen genel öneriler
            const baseSuggestions = [
                { text: "📊 Bugünkü Özeti Çıkar", query: "Bugünün özetini çıkarır mısın?" },
                { text: "🏆 Haftanın En Disiplinlisi?", query: "Bu haftanın en disiplinli personeli kim?" }
            ];

            // Anomalilere dayalı dinamik öneriler
            anomalies.forEach(a => {
                if (a.type === 'OUTSIDE') {
                    baseSuggestions.push({ 
                        text: `📢 ${a.name}'ye Uyarı Gönder`, 
                        action: () => this.sendQuickBroadcast(`${a.name}, lütfen dükkan sınırları içerisinden giriş yapınız.`)
                    });
                }
                if (a.type === 'OVERTIME') {
                    baseSuggestions.push({ 
                        text: `🏮 Mola Hatırlatması Yap`, 
                        action: () => this.sendQuickBroadcast("Dikkat: 10 saati aşan mesai tespit edildi. Lütfen mola veriniz.")
                    });
                }
            });

            baseSuggestions.forEach(s => {
                const btn = document.createElement('button');
                btn.className = 'suggestion-btn fade-in';
                btn.innerText = s.text;
                btn.onclick = s.action ? s.action : () => {
                    document.getElementById('ai-user-input').value = s.query;
                    this.sendChat();
                };
                box.appendChild(btn);
            });
        },

        sendQuickBroadcast(msg) {
            if (confirm(`Şu duyuruyu yayınlamak istiyor musunuz?\n\n"${msg}"`)) {
                // yonetici.html'deki sendBroadcast fonksiyonunu taklit et veya doğrudan çağır
                const input = document.getElementById('broadcastMsg');
                if (input) {
                    input.value = msg;
                    window.sendBroadcast();
                }
            }
        }
    };

    // Global erişim için window'a bağla
    window.ShiftAI = AI;
    window.toggleAIConfig = () => AI.toggleConfig();
    window.saveAIConfig = () => AI.saveConfig();
    window.sendAIChat = () => AI.sendChat();

    // Başlat
    document.addEventListener('DOMContentLoaded', () => AI.init());

})(window);
