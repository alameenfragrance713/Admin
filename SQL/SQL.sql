-- =====================================================================
-- AL AMEEN FRAGRANCE — Complete Supabase Schema (with Cost/Profit)
-- Run this entire script in the Supabase SQL Editor
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  image         TEXT,
  parent_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  sku               TEXT,
  category_id       UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sub_category      TEXT,
  short_description TEXT,
  description       TEXT,
  notes_top         TEXT,
  notes_middle      TEXT,
  notes_base        TEXT,
  variants          JSONB DEFAULT '[]'::jsonb,
  images            JSONB DEFAULT '[]'::jsonb,
  base_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price        NUMERIC(10,2) DEFAULT 0,        -- ⭐ NEW: purchase cost
  old_price         NUMERIC(10,2),
  stock             INT DEFAULT 0,
  gender            TEXT CHECK (gender IN ('Men','Women','Unisex')) DEFAULT 'Unisex',
  is_active         BOOLEAN DEFAULT TRUE,
  is_featured       BOOLEAN DEFAULT FALSE,
  is_trending       BOOLEAN DEFAULT FALSE,
  is_best_seller    BOOLEAN DEFAULT FALSE,
  is_signature      BOOLEAN DEFAULT FALSE,
  is_bundle         BOOLEAN DEFAULT FALSE,
  is_gift_set       BOOLEAN DEFAULT FALSE,
  sort_order        INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON public.products(is_active);

CREATE TABLE IF NOT EXISTS public.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT UNIQUE,
  customer_name    TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT,
  address          TEXT NOT NULL,
  city             TEXT NOT NULL,
  province         TEXT,
  landmark         TEXT,
  notes            TEXT,
  subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method   TEXT DEFAULT 'Cash on Delivery',
  status           TEXT CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')) DEFAULT 'pending',
  admin_note       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone  ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at);

CREATE TABLE IF NOT EXISTS public.order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  variant_size  TEXT,
  unit_price    NUMERIC(10,2) NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  line_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_price    NUMERIC(10,2) DEFAULT 0,             -- ⭐ NEW
  cost_total    NUMERIC(10,2) DEFAULT 0,             -- ⭐ NEW
  profit        NUMERIC(10,2) DEFAULT 0,             -- ⭐ NEW
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

CREATE TABLE IF NOT EXISTS public.banners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT,
  subtitle      TEXT,
  button_text   TEXT,
  image_desktop TEXT NOT NULL,
  image_mobile  TEXT,
  link          TEXT,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- MIGRATIONS (safe re-run)
-- =====================================================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS cost_total NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS profit NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.banners ADD COLUMN IF NOT EXISTS button_text TEXT;

-- =====================================================================
-- ORDER NUMBER SEQUENCE + TRIGGER
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'AAF-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                        LPAD(NEXTVAL('order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated ON public.orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- RPC: place_order (WITH COST + PROFIT)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name TEXT,
  p_phone         TEXT,
  p_email         TEXT,
  p_address       TEXT,
  p_city          TEXT,
  p_province      TEXT,
  p_landmark      TEXT,
  p_notes         TEXT,
  p_items         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id      UUID;
  v_order_number  TEXT;
  v_subtotal      NUMERIC(10,2) := 0;
  v_shipping      NUMERIC(10,2) := 0;
  v_total         NUMERIC(10,2) := 0;
  v_free_thresh   NUMERIC(10,2) := 2999;
  v_ship_charge   NUMERIC(10,2) := 250;
  v_item          JSONB;
  v_product       RECORD;
  v_variant       JSONB;
  v_unit_price    NUMERIC(10,2);
  v_qty           INT;
  v_line_total    NUMERIC(10,2);
  v_size          TEXT;
  v_item_cost     NUMERIC(10,2);
  v_cost_total    NUMERIC(10,2);
  v_item_profit   NUMERIC(10,2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  SELECT value::NUMERIC INTO v_ship_charge FROM settings WHERE key = 'shipping_charge';
  SELECT value::NUMERIC INTO v_free_thresh FROM settings WHERE key = 'free_shipping_threshold';
  IF v_ship_charge IS NULL THEN v_ship_charge := 250; END IF;
  IF v_free_thresh IS NULL THEN v_free_thresh := 2999; END IF;

  INSERT INTO orders (
    customer_name, phone, email, address, city, province,
    landmark, notes, subtotal, shipping, total, payment_method, status
  ) VALUES (
    p_customer_name, p_phone, p_email, p_address, p_city, p_province,
    p_landmark, p_notes, 0, 0, 0, 'Cash on Delivery', 'pending'
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INT, 1);
    IF v_qty < 1 THEN v_qty := 1; END IF;

    SELECT * INTO v_product FROM products
      WHERE id = (v_item->>'product_id')::UUID AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found or inactive: %', v_item->>'product_id';
    END IF;

    v_size := v_item->>'variant_size';
    v_unit_price := NULL;

    IF v_product.variants IS NOT NULL AND jsonb_array_length(v_product.variants) > 0 THEN
      SELECT elem INTO v_variant
        FROM jsonb_array_elements(v_product.variants) elem
        WHERE elem->>'size' = v_size
        LIMIT 1;

      IF v_variant IS NOT NULL THEN
        v_unit_price := (v_variant->>'price')::NUMERIC;
        IF COALESCE((v_variant->>'stock')::INT, 0) < v_qty THEN
          RAISE EXCEPTION 'Insufficient stock for % (%)', v_product.name, v_size;
        END IF;
      ELSE
        v_unit_price := v_product.base_price;
      END IF;
    ELSE
      v_unit_price := v_product.base_price;
      IF COALESCE(v_product.stock, 0) < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
      END IF;
    END IF;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'Invalid price for product %', v_product.name;
    END IF;

    -- ⭐ COST + PROFIT calculation
    v_item_cost  := COALESCE(v_product.cost_price, 0);
    v_cost_total := v_item_cost * v_qty;
    v_line_total := v_unit_price * v_qty;
    v_item_profit := v_line_total - v_cost_total;

    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO order_items (
      order_id, product_id, product_name, variant_size,
      unit_price, quantity, line_total,
      cost_price, cost_total, profit
    ) VALUES (
      v_order_id, v_product.id, v_product.name, v_size,
      v_unit_price, v_qty, v_line_total,
      v_item_cost, v_cost_total, v_item_profit
    );

    IF v_product.variants IS NOT NULL AND jsonb_array_length(v_product.variants) > 0 AND v_variant IS NOT NULL THEN
      UPDATE products
        SET variants = (
          SELECT jsonb_agg(
            CASE WHEN elem->>'size' = v_size
              THEN jsonb_set(elem, '{stock}',
                    to_jsonb(GREATEST(0, COALESCE((elem->>'stock')::INT,0) - v_qty)))
              ELSE elem
            END
          )
          FROM jsonb_array_elements(variants) elem
        )
        WHERE id = v_product.id;
    ELSE
      UPDATE products
        SET stock = GREATEST(0, COALESCE(stock,0) - v_qty)
        WHERE id = v_product.id;
    END IF;
  END LOOP;

  IF v_subtotal >= v_free_thresh THEN v_shipping := 0; ELSE v_shipping := v_ship_charge; END IF;
  v_total := v_subtotal + v_shipping;

  UPDATE orders SET subtotal = v_subtotal, shipping = v_shipping, total = v_total
    WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order TO anon, authenticated;

-- =====================================================================
-- RPC: get_order_summary
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_order_summary(
  p_order_number TEXT,
  p_phone        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  RECORD;
  v_items  JSONB;
BEGIN
  SELECT * INTO v_order FROM orders
    WHERE order_number = p_order_number AND phone = p_phone
    LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', product_name,
    'variant_size', variant_size,
    'unit_price', unit_price,
    'quantity', quantity,
    'line_total', line_total
  )), '[]'::jsonb) INTO v_items
  FROM order_items WHERE order_id = v_order.id;

  RETURN jsonb_build_object(
    'order_number', v_order.order_number,
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'address', v_order.address,
    'city', v_order.city,
    'province', v_order.province,
    'subtotal', v_order.subtotal,
    'shipping', v_order.shipping,
    'total', v_order.total,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_summary TO anon, authenticated;

-- =====================================================================
-- HELPER: is_admin()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read"  ON public.categories;
DROP POLICY IF EXISTS "categories_admin_all"    ON public.categories;
DROP POLICY IF EXISTS "products_public_read"    ON public.products;
DROP POLICY IF EXISTS "products_admin_all"      ON public.products;
DROP POLICY IF EXISTS "banners_public_read"     ON public.banners;
DROP POLICY IF EXISTS "banners_admin_all"       ON public.banners;
DROP POLICY IF EXISTS "settings_public_read"    ON public.settings;
DROP POLICY IF EXISTS "settings_admin_all"      ON public.settings;
DROP POLICY IF EXISTS "messages_public_insert"  ON public.messages;
DROP POLICY IF EXISTS "messages_admin_all"      ON public.messages;
DROP POLICY IF EXISTS "subscribers_public_insert" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_admin_all"   ON public.subscribers;
DROP POLICY IF EXISTS "orders_admin_all"        ON public.orders;
DROP POLICY IF EXISTS "order_items_admin_all"   ON public.order_items;
DROP POLICY IF EXISTS "admins_self_read"        ON public.admins;
DROP POLICY IF EXISTS "admins_admin_all"        ON public.admins;

CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (is_active = TRUE);
CREATE POLICY "categories_admin_all" ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (is_active = TRUE);
CREATE POLICY "products_admin_all" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "banners_public_read" ON public.banners FOR SELECT USING (is_active = TRUE);
CREATE POLICY "banners_admin_all" ON public.banners FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "settings_public_read" ON public.settings FOR SELECT USING (TRUE);
CREATE POLICY "settings_admin_all" ON public.settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "messages_public_insert" ON public.messages FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "messages_admin_all" ON public.messages FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "subscribers_public_insert" ON public.subscribers FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "subscribers_admin_all" ON public.subscribers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "orders_admin_all" ON public.orders FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "order_items_admin_all" ON public.order_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "admins_self_read" ON public.admins FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admins_admin_all" ON public.admins FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- STORAGE
-- =====================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', TRUE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('banner-images', 'banner-images', TRUE)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "banner_images_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "banner_images_admin_write"  ON storage.objects;

CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "product_images_admin_write" ON storage.objects FOR ALL
  USING (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

CREATE POLICY "banner_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'banner-images');
CREATE POLICY "banner_images_admin_write" ON storage.objects FOR ALL
  USING (bucket_id = 'banner-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'banner-images' AND public.is_admin());

-- =====================================================================
-- REALTIME
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- =====================================================================
-- SEED SETTINGS
-- =====================================================================
INSERT INTO public.settings (key, value) VALUES
  ('store_name',            'Al Ameen Fragrance'),
  ('announcement',          'Free shipping on orders above Rs. 2,999 | Cash on Delivery All Over Pakistan'),
  ('shipping_charge',       '250'),
  ('free_shipping_threshold','2999'),
  ('whatsapp_number',       '923172077664'),
  ('phone',                 '+92 317 2077664'),
  ('email',                 'alameenfragnance713@gmail.com'),
  ('address',               'Pakistan'),
  ('facebook',              'https://facebook.com'),
  ('instagram',             'https://instagram.com'),
  ('tiktok',                'https://tiktok.com'),
  ('youtube',               'https://youtube.com')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =====================================================================
-- BACKFILL old orders (optional — fills cost for existing orders)
-- =====================================================================
UPDATE public.order_items oi
SET
  cost_price = COALESCE(p.cost_price, 0),
  cost_total = COALESCE(p.cost_price, 0) * oi.quantity,
  profit     = oi.line_total - (COALESCE(p.cost_price, 0) * oi.quantity)
FROM public.products p
WHERE oi.product_id = p.id
  AND (oi.cost_price IS NULL OR oi.cost_price = 0)
  AND COALESCE(p.cost_price, 0) > 0;

-- =====================================================================
-- ADMIN USER SETUP
-- =====================================================================
-- 1. Supabase → Authentication → Users → Add User
-- 2. Copy UUID
-- 3. INSERT INTO public.admins (user_id, email)
--    VALUES ('PASTE-UUID-HERE', 'your-email@example.com');
-- =====================================================================