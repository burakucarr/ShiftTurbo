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

* **Frontend:** JavaScript (ES6+), HTML5, CSS3
* **Backend & DB:** [Supabase](https://supabase.com/) (PostgreSQL & Realtime Auth)
* **Authentication:** JWT & Supabase Auth
* **APIs:** Web Geolocation API, HTML5-QRCode Library
* **Deployment:** Vercel (Coming Soon)

---

## 📂 Dosya Yapısı (File Structure)

```text
📁 Shiftturbo
├── 📁 panel          # Yönetici ve Personel Arayüzleri
│   ├── index.html    # Ana Giriş Ekranı
│   ├── yonetici.html # Admin Dashboard
│   └── script.js     # Temel Mantık ve API Bağlantıları
├── 📁 css            # Stil Dosyaları
├── 📁 assets         # Görseller ve İkonlar
└── README.md         # Proje Tanıtım Belgesi




Gelecek Yol Haritası (Roadmap)
[ ] Yüz tanıma (Face Recognition) entegrasyonu.

[ ] Otomatik maaş ve mesai hesaplama modülü.

[ ] iOS ve Android için Native mobil uygulama sürümleri.

👨‍💻 Geliştirici
Burak UÇAR - Founder of UCR Technology

LinkedIn: linkedin.com/in/burakkucarr

E-Posta: burakkucar55@gmail.com

© 2026 UCR Technology. Tüm Hakları Saklıdır.
