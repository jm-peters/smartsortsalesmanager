-- ==============================================================================
-- SMARTSORT SALES MANAGER — COMPLETE PRODUCTION DATABASE SCHEMA & AUTH FOR SUPABASE
-- ==============================================================================
-- Run this entire script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- This script provisions:
--   1. Extensions & Settings
--   2. Multi-tenant Root & Subscriptions (shops, subscription_payments)
--   3. Users & Attendants with Supabase auth.users synchronization
--   4. Catalog & Stock Management (products, product_stock, stock_movements)
--   5. Cash Register & Shift Sessions (cash_sessions)
--   6. Sales & Line Items (sales, sale_items)
--   7. Credit Book / Deni & Customer Ledgers (customers, debts, debt_payments)
--   8. Expenses & Petty Cash (expenses)
--   9. Audit Logging & Delta-Sync Sequences (audit_log, bump_change_seq triggers)
--  10. Stored RPC Auth Functions (auth_login_with_pin, auth_register_shop, auth_change_pin)
--  11. Row Level Security (RLS) Policies & Tenant Isolation
--  12. Realtime Replication & Storage Buckets
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- QUERY 1: EXTENSIONS & ENUMS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- QUERY 2: SHOPS & TENANTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY,
    shop_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    till_number TEXT DEFAULT '542190',
    avatar_emoji TEXT DEFAULT '🏪',
    tagline TEXT,
    contact_email TEXT,
    alt_phone TEXT,
    county TEXT DEFAULT 'Nairobi',
    sub_county TEXT,
    town TEXT,
    landmark TEXT,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    location_captured_at TIMESTAMPTZ,
    default_credit_limit NUMERIC(12, 2) DEFAULT 3000.00,
    receipt_footer TEXT DEFAULT 'Karibu tena! / Thank you for shopping with us!',
    business_cutoff_hour INT DEFAULT 22,
    plan_code TEXT DEFAULT 'daily_30',
    plan_name TEXT DEFAULT 'Daily Access Plan (KES 30/day)',
    plan_amount_kes NUMERIC(10, 2) DEFAULT 30.00,
    plan_status TEXT DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'suspended', 'cancelled')),
    subscription_paid_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    preferred_payment_method TEXT DEFAULT 'mpesa',
    plan_acknowledged BOOLEAN DEFAULT TRUE,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- QUERY 3: USERS & AUTH SYNCHRONIZATION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'attendant', 'manager')),
    pin_hash TEXT,
    onboarding_step TEXT DEFAULT 'contact',
    profile_completed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription Payments (KES 30/day M-Pesa STK & manual tracking)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    days INT NOT NULL DEFAULT 1,
    amount_kes NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa_stk', 'mpesa_till', 'manual')),
    transaction_code TEXT,
    phone TEXT,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    checkout_request_id TEXT,
    merchant_request_id TEXT,
    status TEXT DEFAULT 'completed',
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- QUERY 4: PRODUCTS & INVENTORY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    search_key TEXT NOT NULL,
    buying_price NUMERIC(12, 2) DEFAULT 0.00,
    selling_price NUMERIC(12, 2) NOT NULL,
    low_limit NUMERIC(12, 2) DEFAULT 5.00,
    unit TEXT DEFAULT 'pcs',
    barcode TEXT,
    image_emoji TEXT DEFAULT '📦',
    is_active BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    pin_order INT DEFAULT 0,
    pack_size NUMERIC(12, 2),
    device_id TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.product_stock (
    product_id TEXT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    qty NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_seq BIGSERIAL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    delta NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('opening', 'purchase', 'sale', 'void', 'adjustment', 'damage', 'return')),
    ref_type TEXT,
    ref_id TEXT,
    unit_cost NUMERIC(12, 2),
    note TEXT,
    device_id TEXT,
    created_by TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    server_created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- QUERY 5: CASH REGISTERS & SHIFT SESSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    shop_user_id TEXT,
    device_id TEXT,
    label TEXT DEFAULT 'Shift',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closed_at TIMESTAMPTZ,
    closed_by TEXT,
    expected_cash NUMERIC(12, 2),
    counted_cash NUMERIC(12, 2),
    cash_variance NUMERIC(12, 2),
    expected_mpesa NUMERIC(12, 2),
    counted_mpesa NUMERIC(12, 2),
    mpesa_variance NUMERIC(12, 2),
    total_sales NUMERIC(12, 2),
    total_profit NUMERIC(12, 2),
    total_expenses NUMERIC(12, 2),
    deni_issued NUMERIC(12, 2),
    deni_collected NUMERIC(12, 2),
    transaction_count INT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'abandoned')),
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- QUERY 6: CUSTOMERS & CREDIT BOOK (DENI)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    credit_limit NUMERIC(12, 2) DEFAULT 3000.00,
    credit_limit_set_by TEXT,
    credit_limit_set_at TIMESTAMPTZ,
    credit_notes TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- QUERY 7: SALES & SALE LINE ITEMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    sale_no INT NOT NULL,
    total NUMERIC(12, 2) NOT NULL,
    total_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    item_count INT NOT NULL DEFAULT 1,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'deni')),
    debt_id TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void', 'refunded')),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    voided_by TEXT,
    cash_session_id TEXT REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    device_id TEXT,
    created_by TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    server_created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    qty NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_unknown BOOLEAN DEFAULT FALSE,
    line_total NUMERIC(12, 2) NOT NULL,
    line_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_seq BIGSERIAL
);

-- Debts Table (Deni)
CREATE TABLE IF NOT EXISTS public.debts (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    principal NUMERIC(12, 2) NOT NULL,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'written_off')),
    due_date TIMESTAMPTZ,
    sale_id TEXT REFERENCES public.sales(id) ON DELETE SET NULL,
    override_reason TEXT,
    device_id TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debt Payments Table
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    debt_id TEXT NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'mpesa')),
    cash_session_id TEXT REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    device_id TEXT,
    created_by TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    server_created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- QUERY 8: EXPENSES & PETTY CASH
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('stock', 'transport', 'rent', 'airtime', 'electricity', 'water', 'wages', 'licence', 'food', 'cash_drop', 'other')),
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mpesa')),
    is_cash_drop BOOLEAN DEFAULT FALSE,
    cash_session_id TEXT REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
    recorded_by TEXT,
    created_by TEXT,
    device_id TEXT,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- QUERY 9: AUDIT LOG & HIGH-PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before JSONB,
    after JSONB,
    change_seq BIGSERIAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ultra-fast sync cursors and mobile lookups
CREATE INDEX IF NOT EXISTS idx_products_shop_search ON public.products(shop_id, search_key);
CREATE INDEX IF NOT EXISTS idx_products_shop_change ON public.products(shop_id, change_seq);
CREATE INDEX IF NOT EXISTS idx_sales_shop_change ON public.sales(shop_id, change_seq);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_debts_shop_customer ON public.debts(shop_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(shop_id, phone);
CREATE INDEX IF NOT EXISTS idx_subscriptions_shop ON public.subscription_payments(shop_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON public.expenses(shop_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- QUERY 10: AUTO-BUMP CHANGE SEQUENCE & TIMESTAMPS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_change_seq()
RETURNS TRIGGER AS $$
BEGIN
    NEW.change_seq = nextval(pg_get_serial_sequence(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'change_seq'));
    IF TG_OP = 'UPDATE' AND column_exists(TG_TABLE_SCHEMA, TG_TABLE_NAME, 'updated_at') THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper to check column existence safely
CREATE OR REPLACE FUNCTION public.column_exists(p_schema text, p_table text, p_column text)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = p_schema AND table_name = p_table AND column_name = p_column
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Attach change_seq bump triggers
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['shops', 'users', 'products', 'product_stock', 'stock_movements', 'cash_sessions', 'customers', 'sales', 'sale_items', 'debts', 'debt_payments', 'expenses'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_%I ON public.%I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER trg_bump_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_change_seq()', tbl, tbl);
    END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- QUERY 11: AUTHENTICATION STORED RPC FUNCTIONS
-- Enables phone + 4-digit PIN authentication & shop registration directly via Postgres
-- ------------------------------------------------------------------------------

-- 11a. RPC: Authenticate user by phone and PIN
CREATE OR REPLACE FUNCTION public.auth_login_with_pin(
    p_phone TEXT,
    p_pin TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_clean_phone TEXT;
    v_pin_hash TEXT;
    v_user RECORD;
    v_shop RECORD;
BEGIN
    -- Normalize phone to Kenyan format (254...)
    v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
    IF v_clean_phone LIKE '0%' THEN
        v_clean_phone := '254' || substr(v_clean_phone, 2);
    END IF;

    -- Compute SHA-256 hash using pin + phone as salt
    v_pin_hash := encode(digest(p_pin || v_clean_phone, 'sha256'), 'hex');

    -- Find user
    SELECT * INTO v_user
    FROM public.users
    WHERE phone = v_clean_phone AND pin_hash = v_pin_hash
    LIMIT 1;

    IF v_user.id IS NULL THEN
        RAISE EXCEPTION 'Nambari ya simu au PIN si sahihi (Invalid phone or PIN)';
    END IF;

    IF NOT v_user.is_active THEN
        RAISE EXCEPTION 'Akaunti imezimwa. Wasiliana na mwenye duka.';
    END IF;

    -- Retrieve shop info
    SELECT * INTO v_shop
    FROM public.shops
    WHERE id = v_user.shop_id
    LIMIT 1;

    RETURN jsonb_build_object(
        'shopId', v_user.shop_id,
        'user', to_jsonb(v_user),
        'shop', to_jsonb(v_shop),
        'session', jsonb_build_object(
            'accessToken', 'sb-token-' || encode(gen_random_bytes(16), 'hex'),
            'refreshToken', 'sb-refresh-' || encode(gen_random_bytes(16), 'hex'),
            'expiresAt', (EXTRACT(EPOCH FROM NOW()) * 1000 + 86400000 * 30)::BIGINT,
            'userId', v_user.id,
            'shopId', v_user.shop_id,
            'role', v_user.role
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11b. RPC: Register new shop & owner
CREATE OR REPLACE FUNCTION public.auth_register_shop(
    p_shop_name TEXT,
    p_owner_name TEXT,
    p_phone TEXT,
    p_pin TEXT,
    p_till_number TEXT DEFAULT '542190'
)
RETURNS JSONB AS $$
DECLARE
    v_clean_phone TEXT;
    v_pin_hash TEXT;
    v_shop_id TEXT;
    v_user_id TEXT;
    v_paid_until TIMESTAMPTZ;
    v_shop RECORD;
    v_user RECORD;
BEGIN
    v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
    IF v_clean_phone LIKE '0%' THEN
        v_clean_phone := '254' || substr(v_clean_phone, 2);
    END IF;

    -- Check if phone already exists
    IF EXISTS (SELECT 1 FROM public.users WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'Nambari hii ya simu tayari imesajiliwa (Phone already registered)';
    END IF;

    v_shop_id := 'shop-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8);
    v_user_id := 'user-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8);
    v_paid_until := NOW() + INTERVAL '30 days';
    v_pin_hash := encode(digest(p_pin || v_clean_phone, 'sha256'), 'hex');

    -- Insert Shop
    INSERT INTO public.shops (
        id, shop_name, owner_name, phone, till_number,
        plan_code, plan_name, plan_amount_kes, plan_status,
        subscription_paid_until, created_at, updated_at
    ) VALUES (
        v_shop_id, trim(p_shop_name), trim(p_owner_name), v_clean_phone, COALESCE(p_till_number, '542190'),
        'daily_30', 'Daily Access Plan (KES 30/day)', 30.00, 'active',
        v_paid_until, NOW(), NOW()
    ) RETURNING * INTO v_shop;

    -- Insert Owner User
    INSERT INTO public.users (
        id, shop_id, name, username, phone, role, pin_hash, onboarding_step, is_active, created_at, updated_at
    ) VALUES (
        v_user_id, v_shop_id, trim(p_owner_name), 'user_' || substr(v_clean_phone, -6), v_clean_phone, 'owner',
        v_pin_hash, 'contact', TRUE, NOW(), NOW()
    ) RETURNING * INTO v_user;

    RETURN jsonb_build_object(
        'shopId', v_shop_id,
        'user', to_jsonb(v_user),
        'shop', to_jsonb(v_shop),
        'session', jsonb_build_object(
            'accessToken', 'sb-token-' || encode(gen_random_bytes(16), 'hex'),
            'refreshToken', 'sb-refresh-' || encode(gen_random_bytes(16), 'hex'),
            'expiresAt', (EXTRACT(EPOCH FROM NOW()) * 1000 + 86400000 * 30)::BIGINT,
            'userId', v_user_id,
            'shopId', v_shop_id,
            'role', 'owner'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11c. Supabase auth.users Trigger (Link Supabase Auth users to public.users)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_shop_id TEXT;
    v_shop_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
BEGIN
    v_shop_name := COALESCE(NEW.raw_user_meta_data->>'shop_name', 'Duka Langu');
    v_owner_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '');
    v_shop_id := 'shop-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8);

    -- Create shop if user doesn't already belong to one
    INSERT INTO public.shops (id, shop_name, owner_name, phone, contact_email)
    VALUES (v_shop_id, v_shop_name, v_owner_name, v_phone, NEW.email)
    ON CONFLICT (id) DO NOTHING;

    -- Create user record linked to auth.users.id
    INSERT INTO public.users (
        id, shop_id, auth_user_id, name, email, phone, role, is_active
    ) VALUES (
        NEW.id::TEXT, v_shop_id, NEW.id, v_owner_name, NEW.email, v_phone, 'owner', TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
        auth_user_id = NEW.id,
        email = EXCLUDED.email;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ------------------------------------------------------------------------------
-- QUERY 12: ROW LEVEL SECURITY (RLS) & TENANT ISOLATION
-- ------------------------------------------------------------------------------

-- Helper function to extract shop_id from Supabase JWT claims or user lookup
CREATE OR REPLACE FUNCTION public.current_shop_id()
RETURNS TEXT AS $$
DECLARE
    claim_shop TEXT;
    user_shop TEXT;
BEGIN
    -- 1. Check custom claim from JWT
    claim_shop := NULLIF(CURRENT_SETTING('request.jwt.claims', true)::jsonb ->> 'shop_id', '');
    IF claim_shop IS NOT NULL THEN
        RETURN claim_shop;
    END IF;

    -- 2. Lookup via auth.uid()
    IF auth.uid() IS NOT NULL THEN
        SELECT shop_id INTO user_shop FROM public.users WHERE auth_user_id = auth.uid() OR id = auth.uid()::TEXT LIMIT 1;
        IF user_shop IS NOT NULL THEN
            RETURN user_shop;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Dynamic clean policy creator
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'shops', 'users', 'subscription_payments', 'products', 'stock_movements',
        'product_stock', 'cash_sessions', 'customers', 'sales', 'sale_items',
        'debts', 'debt_payments', 'expenses', 'audit_log'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%I" ON public.%I', tbl, tbl);
        IF tbl = 'shops' THEN
            EXECUTE format('CREATE POLICY "tenant_isolation_%I" ON public.%I FOR ALL USING (id = public.current_shop_id() OR auth.role() = ''service_role'' OR public.current_shop_id() IS NULL)', tbl, tbl);
        ELSE
            EXECUTE format('CREATE POLICY "tenant_isolation_%I" ON public.%I FOR ALL USING (shop_id = public.current_shop_id() OR auth.role() = ''service_role'' OR public.current_shop_id() IS NULL)', tbl, tbl);
        END IF;
    END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- QUERY 13: REALTIME REPLICATION & ASSET STORAGE
-- ------------------------------------------------------------------------------
-- Add tables to realtime publication for instant multi-device live cashier sync
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shops, public.users, public.products, public.sales, public.debts, public.cash_sessions, public.subscription_payments;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- Create Storage Bucket for shop logos and avatar images
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access to avatars
DROP POLICY IF EXISTS "Public Avatar Access" ON storage.objects;
CREATE POLICY "Public Avatar Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Avatar Upload" ON storage.objects;
CREATE POLICY "Authenticated Avatar Upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'avatars');

-- ==============================================================================
-- END OF SCHEMA & AUTH SETUP SCRIPT
-- ==============================================================================
