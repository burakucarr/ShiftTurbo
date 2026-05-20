# 🚀 ShiftTurbo | AI-Powered Workforce Management System

![Status](https://img.shields.io/badge/Status-Beta-orange)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-Private-red)

**ShiftTurbo**, KOBİ'lerin personel yönetim süreçlerini dijitalleştiren, çok katmanlı güvenlik doğrulaması (GPS, QR, PIN) ve Yapay Zeka tabanlı anomali tespit algoritmaları sunan bir **SaaS** platformudur.

---

## 🛠️ Temel Özellikler (Key Features)

* **🔒 Çok Katmanlı Doğrulama (Hybrid Verification):** Personel giriş-çıkışlarında Dinamik QR Kod, GPS konum doğrulaması ve kişiye özel PIN kullanımıyla suistimalleri %99.9 oranında engeller.
* **🤖 AI Pro-Strategist:** Personel hareket verilerini analiz ederek verimlilik skorları oluşturur ve rutin dışı (anomali) durumları (örn: 10+ saat mesai, dükkan dışı işlem) raporlar.
* **📊 Yönetici Dashboard:** Gerçek zamanlı personel takibi, geçmişe dönük raporlama ve operasyonel verimlilik analizleri.
* **📱 Mobil Uyumlu (PWA):** Herhangi bir ek donanım (parmak izi okuyucu vb.) gerektirmeden, her türlü akıllı cihaz üzerinden çalışabilen esnek yapı.

---

## 🏗️ Teknolojik Altyapı (Tech Stack)

* **Frontend:** JavaScript (ES6+), HTML5, CSS3 (Custom Cyber-Noir Theme)
* **Backend & DB:** [Supabase](https://supabase.com/) (PostgreSQL & Realtime Auth)
* **Authentication:** JWT & Supabase Auth
* **APIs:** Web Geolocation API, HTML5-QRCode Library
* **Deployment:** Vercel / Cloudflare Pages

---

## 📂 Proje Yapısı (Project Structure)

```text
📁 ShiftTurbo
├── 📁 paneller               # Uygulama Arayüzleri ve İstemci Kodları
│   ├── index.html            # Personel Giriş / Terminal Arayüzü
│   ├── yonetici.html         # Yönetici Kontrol Paneli (Dashboard)
│   ├── sw.js                 # PWA Service Worker (Çevrimdışı Desteği)
│   ├── ai_assistant.js       # Yapay Zeka Destek Modülü
│   ├── 📁 js                 # JavaScript Mantık Klasörü
│   │   ├── terminal.js       # Terminal Ekranı Mantığı ve Doğrulamalar
│   │   └── yonetici.js       # Yönetici Paneli Fonksiyonları
│   ├── 📁 css                # Stil Dosyaları (terminal, yonetici, shared)
│   ├── 📁 audio              # Sesli Geri Bildirim Dosyaları (.mp3)
│   └── config.example.js     # Supabase Ayarları Örnek Dosyası
└── README.md                 # Proje Tanıtım Belgesi
```

---

## 🚀 Başlangıç ve Kurulum (Getting Started)

1. **Supabase Kurulumu:** Supabase üzerinde projenizi oluşturun ve gerekli veritabanı tablolarını (`users`, `logs` vb.) tanımlayın.
2. **Yapılandırma:** `config.example.js` dosyasının adını `config.js` yapın ve Supabase URL ile API anahtarlarınızı girin:
   ```javascript
   const SUPABASE_URL = "PROJE_URL_ADRESINIZ";
   const SUPABASE_KEY = "PROJE_ANON_ANAHTARINIZ";
   ```
3. **Çalıştırma:** Tarayıcınızda doğrudan `index.html` veya `yonetici.html` dosyasını açabilir ya da yerel bir geliştirme sunucusu (örn: Live Server, Wrangler) üzerinden PWA özelliklerini test edebilirsiniz.

---

## 🗺️ Gelecek Yol Haritası (Roadmap)

- [ ] Yüz tanıma (Face Recognition) entegrasyonu.
- [ ] Otomatik maaş ve mesai hesaplama modülü.
- [ ] iOS ve Android için Native mobil uygulama sürümleri.

---

## 👨‍💻 Geliştirici (Developer)

**Burak UÇAR** - Founder of UCR Technology

* 🌐 **LinkedIn:** [linkedin.com/in/burakkucarr](https://linkedin.com/in/burakkucarr)
* 📧 **E-Posta:** [burakkucar55@gmail.com](mailto:burakkucar55@gmail.com)

---

© 2026 UCR Technology. Tüm Hakları Saklıdır.
