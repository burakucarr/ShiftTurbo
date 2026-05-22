/**
 * ShiftTurbo — Yapılandırma Şablonu
 * 
 * ⚠️  KULLANIM TALİMATLARI:
 * 1. Bu dosyayı kopyalayıp "config.js" olarak kaydedin.
 * 2. Aşağıdaki değerleri kendi Supabase proje bilgilerinizle doldurun.
 * 3. config.js dosyası .gitignore'a eklidir — GitHub'a GÖNDERİLMEZ.
 * 4. config.example.js dosyasına ASLA gerçek key yazmayın.
 */

const SHIFTURBO_CONFIG = {
    supabaseUrl: 'https://PROJE-ID.supabase.co',
    supabaseKey: 'eyJ... (Supabase > Settings > API > anon public key)',
    geminiApiKey: 'AIzaSy... (Gemini API Key)'
};
window.SHIFTURBO_CONFIG = SHIFTURBO_CONFIG;
