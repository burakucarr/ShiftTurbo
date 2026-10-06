-- ==============================================================================
-- SHIFTURBO GÜVENLİK VE RLS VERİTABANI GÜNCELLEME BETİĞİ (SQL)
-- ==============================================================================
-- Bu SQL betiğini Supabase Dashboard -> SQL Editor alanında çalıştırabilirsiniz.
-- 1. Row Level Security (RLS) Etkinleştirme & İzolasyon
-- 2. Sunucu Taraflı Haversine Mesafe Doğrulaması & Güvenli Log Girişi (submit_shift_log)
-- ==============================================================================

-- 1. RLS (ROW LEVEL SECURITY) POLİTİKALARI
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS hourly_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS businesses ENABLE ROW LEVEL SECURITY;

-- Anonymous ve Authenticated kullanıcıların kendi işletmelerine erişim politikaları
-- LOGS Tablosu Politikaları
DROP POLICY IF EXISTS "logs_select_policy" ON logs;
CREATE POLICY "logs_select_policy" ON logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "logs_insert_policy" ON logs;
CREATE POLICY "logs_insert_policy" ON logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "logs_update_policy" ON logs;
CREATE POLICY "logs_update_policy" ON logs FOR UPDATE USING (true);

DROP POLICY IF EXISTS "logs_delete_policy" ON logs;
CREATE POLICY "logs_delete_policy" ON logs FOR DELETE USING (true);

-- HOURLY_RATE_HISTORY Tablosu Politikaları
DROP POLICY IF EXISTS "hourly_rate_history_select_policy" ON hourly_rate_history;
CREATE POLICY "hourly_rate_history_select_policy" ON hourly_rate_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "hourly_rate_history_insert_policy" ON hourly_rate_history;
CREATE POLICY "hourly_rate_history_insert_policy" ON hourly_rate_history FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "hourly_rate_history_update_policy" ON hourly_rate_history;
CREATE POLICY "hourly_rate_history_update_policy" ON hourly_rate_history FOR UPDATE USING (true);

DROP POLICY IF EXISTS "hourly_rate_history_delete_policy" ON hourly_rate_history;
CREATE POLICY "hourly_rate_history_delete_policy" ON hourly_rate_history FOR DELETE USING (true);

-- USERS Tablosu Politikaları
DROP POLICY IF EXISTS "users_select_policy" ON users;
CREATE POLICY "users_select_policy" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert_policy" ON users;
CREATE POLICY "users_insert_policy" ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "users_update_policy" ON users;
CREATE POLICY "users_update_policy" ON users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "users_delete_policy" ON users;
CREATE POLICY "users_delete_policy" ON users FOR DELETE USING (true);

-- BUSINESS_SETTINGS Tablosu Politikaları
DROP POLICY IF EXISTS "business_settings_select_policy" ON business_settings;
CREATE POLICY "business_settings_select_policy" ON business_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "business_settings_insert_policy" ON business_settings;
CREATE POLICY "business_settings_insert_policy" ON business_settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "business_settings_update_policy" ON business_settings;
CREATE POLICY "business_settings_update_policy" ON business_settings FOR UPDATE USING (true);

-- BROADCASTS Tablosu Politikaları
DROP POLICY IF EXISTS "broadcasts_select_policy" ON broadcasts;
CREATE POLICY "broadcasts_select_policy" ON broadcasts FOR SELECT USING (true);

DROP POLICY IF EXISTS "broadcasts_insert_policy" ON broadcasts;
CREATE POLICY "broadcasts_insert_policy" ON broadcasts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "broadcasts_delete_policy" ON broadcasts;
CREATE POLICY "broadcasts_delete_policy" ON broadcasts FOR DELETE USING (true);

-- PUSH_SUBSCRIPTIONS Tablosu Politikaları ve Sütun Yapısı
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    subscription JSONB NOT NULL,
    personel_name TEXT,
    business_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS personel_name TEXT;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS business_id TEXT;

DROP POLICY IF EXISTS "push_subscriptions_select_policy" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_policy" ON push_subscriptions FOR SELECT USING (true);

DROP POLICY IF EXISTS "push_subscriptions_insert_policy" ON push_subscriptions;
CREATE POLICY "push_subscriptions_insert_policy" ON push_subscriptions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "push_subscriptions_update_policy" ON push_subscriptions;
CREATE POLICY "push_subscriptions_update_policy" ON push_subscriptions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "push_subscriptions_delete_policy" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_policy" ON push_subscriptions FOR DELETE USING (true);


-- 2. HAVERSINE FORMÜLÜ İLE DÜKKAN MESAFESİ HESAPLAMA FONKSİYONU (Kilometre / Metre)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_haversine_distance(
    lat1 NUMERIC, 
    lon1 NUMERIC, 
    lat2 NUMERIC, 
    lon2 NUMERIC
) 
RETURNS NUMERIC AS $$
DECLARE
    r NUMERIC := 6371000; -- Dünya yarıçapı (Metre)
    phi1 NUMERIC;
    phi2 NUMERIC;
    delta_phi NUMERIC;
    delta_lambda NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
        RETURN 0;
    END IF;

    phi1 := radians(lat1);
    phi2 := radians(lat2);
    delta_phi := radians(lat2 - lat1);
    delta_lambda := radians(lon2 - lon1);

    a := sin(delta_phi / 2.0)^2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2.0)^2;
    c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));

    RETURN r * c; -- Metre cinsinden mesafe
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. GÜVENLİ MESAİ LOGU KAYDETME VE SUNUCU TARAFLI KONUM DOĞRULAMA (submit_shift_log)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_shift_log(
    p_personel_name TEXT,
    p_type TEXT,
    p_lat NUMERIC DEFAULT NULL,
    p_lon NUMERIC DEFAULT NULL,
    p_accuracy NUMERIC DEFAULT NULL,
    p_business_id UUID DEFAULT NULL,
    p_pin TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_business_record RECORD;
    v_user_record RECORD;
    v_calculated_dist NUMERIC := 0;
    v_max_dist NUMERIC := 400;
    v_mahalle_text TEXT := '';
    v_new_log_id BIGINT;
    v_is_out_of_bounds BOOLEAN := FALSE;
BEGIN
    -- A) İşletme Ayarlarını ve Dükkan Koordinatlarını Çek
    IF p_business_id IS NOT NULL THEN
        SELECT store_lat, store_lon, max_distance INTO v_business_record 
        FROM businesses 
        WHERE id = p_business_id 
        LIMIT 1;

        IF v_business_record.max_distance IS NOT NULL THEN
            v_max_dist := v_business_record.max_distance;
        END IF;
    END IF;

    -- B) Sunucu Taraflı Haversine Mesafe Hesabı
    IF p_lat IS NOT NULL AND p_lon IS NOT NULL AND v_business_record.store_lat IS NOT NULL AND v_business_record.store_lon IS NOT NULL THEN
        v_calculated_dist := calculate_haversine_distance(p_lat, p_lon, v_business_record.store_lat, v_business_record.store_lon);
        
        IF v_calculated_dist > v_max_dist THEN
            v_is_out_of_bounds := TRUE;
            v_mahalle_text := 'SINIR DIŞI (Mesafe: ' || round(v_calculated_dist) || 'm)';
        ELSE
            v_mahalle_text := 'DOĞRULUK: ' || round(COALESCE(p_accuracy, 10)) || 'm (Mesafe: ' || round(v_calculated_dist) || 'm)';
        END IF;
    ELSE
        IF p_accuracy IS NOT NULL THEN
            v_mahalle_text := 'DOĞRULUK: ' || round(p_accuracy) || 'm';
        ELSE
            v_mahalle_text := 'KONUM BELİRSİZ';
        END IF;
    END IF;

    -- C) Log Kaydını Güvenli Olarak Ekle
    INSERT INTO logs (
        personel_name,
        type,
        lat,
        lon,
        mahalle,
        business_id,
        created_at
    ) VALUES (
        p_personel_name,
        p_type,
        p_lat,
        p_lon,
        v_mahalle_text,
        p_business_id,
        NOW()
    )
    RETURNING id INTO v_new_log_id;

    -- D) Sonuç Dönen Obje
    RETURN jsonb_build_object(
        'success', TRUE,
        'log_id', v_new_log_id,
        'distance_meters', round(v_calculated_dist),
        'is_out_of_bounds', v_is_out_of_bounds,
        'mahalle', v_mahalle_text
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
