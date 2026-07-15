-- =============================================================================
-- POS Multi-tenant SaaS - Esquema completo con Row Level Security (RLS)
-- Ejecutar en el SQL Editor de Supabase (en orden)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('admin_org', 'vendedor');
CREATE TYPE public.cash_register_status AS ENUM ('abierta', 'cerrada');
CREATE TYPE public.sale_type AS ENUM ('contado', 'credito');
CREATE TYPE public.credit_status AS ENUM ('pagado', 'pendiente');

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.users_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, product_id)
);

CREATE TABLE public.cash_registers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status public.cash_register_status NOT NULL DEFAULT 'cerrada',
  initial_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_name TEXT,
  type public.sale_type NOT NULL DEFAULT 'contado',
  total DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status_credit public.credit_status DEFAULT 'pagado',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.sales_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price DECIMAL(12, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE public.credit_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount_paid DECIMAL(12, 2) NOT NULL CHECK (amount_paid > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE INDEX idx_users_profiles_user ON public.users_profiles(user_id);
CREATE INDEX idx_users_profiles_tenant ON public.users_profiles(tenant_id);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_inventory_branch ON public.inventory(branch_id);
CREATE INDEX idx_inventory_product ON public.inventory(product_id);
CREATE INDEX idx_cash_registers_branch_status ON public.cash_registers(branch_id, status);
CREATE INDEX idx_sales_branch ON public.sales(branch_id);
CREATE INDEX idx_sales_credit ON public.sales(type, status_credit);
CREATE INDEX idx_sales_details_sale ON public.sales_details(sale_id);
CREATE INDEX idx_credit_payments_sale ON public.credit_payments(sale_id);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares para RLS (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.users_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.branch_belongs_to_my_tenant(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.get_my_tenant_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.sale_belongs_to_my_tenant(p_sale_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales s
    JOIN public.branches b ON b.id = s.branch_id
    WHERE s.id = p_sale_id
      AND b.tenant_id = public.get_my_tenant_id()
  );
$$;

-- -----------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Políticas RLS: aislamiento estricto por tenant_id via auth.uid()
-- -----------------------------------------------------------------------------

-- TENANTS
CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT USING (id = public.get_my_tenant_id());

CREATE POLICY "tenants_update_admin" ON public.tenants
  FOR UPDATE USING (id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

-- BRANCHES
CREATE POLICY "branches_select_tenant" ON public.branches
  FOR SELECT USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "branches_insert_admin" ON public.branches
  FOR INSERT WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

CREATE POLICY "branches_update_admin" ON public.branches
  FOR UPDATE USING (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

CREATE POLICY "branches_delete_admin" ON public.branches
  FOR DELETE USING (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

-- USERS_PROFILES
CREATE POLICY "profiles_select_tenant" ON public.users_profiles
  FOR SELECT USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "profiles_insert_admin" ON public.users_profiles
  FOR INSERT WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

CREATE POLICY "profiles_update_admin" ON public.users_profiles
  FOR UPDATE USING (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

CREATE POLICY "profiles_update_self" ON public.users_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- PRODUCTS
CREATE POLICY "products_select_tenant" ON public.products
  FOR SELECT USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "products_insert_tenant" ON public.products
  FOR INSERT WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "products_update_tenant" ON public.products
  FOR UPDATE USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "products_delete_tenant" ON public.products
  FOR DELETE USING (tenant_id = public.get_my_tenant_id() AND public.get_my_role() = 'admin_org');

-- INVENTORY (por sucursal del tenant)
CREATE POLICY "inventory_select_branch" ON public.inventory
  FOR SELECT USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

CREATE POLICY "inventory_insert_branch" ON public.inventory
  FOR INSERT WITH CHECK (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

CREATE POLICY "inventory_update_branch" ON public.inventory
  FOR UPDATE USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

CREATE POLICY "inventory_delete_branch" ON public.inventory
  FOR DELETE USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
    AND public.get_my_role() = 'admin_org'
  );

-- CASH_REGISTERS
CREATE POLICY "cash_registers_select_branch" ON public.cash_registers
  FOR SELECT USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

CREATE POLICY "cash_registers_insert_branch" ON public.cash_registers
  FOR INSERT WITH CHECK (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "cash_registers_update_branch" ON public.cash_registers
  FOR UPDATE USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

-- SALES
CREATE POLICY "sales_select_branch" ON public.sales
  FOR SELECT USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

CREATE POLICY "sales_insert_branch" ON public.sales
  FOR INSERT WITH CHECK (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "sales_update_branch" ON public.sales
  FOR UPDATE USING (
    public.branch_belongs_to_my_tenant(branch_id)
    AND branch_id = public.get_my_branch_id()
  );

-- SALES_DETAILS
CREATE POLICY "sales_details_select" ON public.sales_details
  FOR SELECT USING (public.sale_belongs_to_my_tenant(sale_id));

CREATE POLICY "sales_details_insert" ON public.sales_details
  FOR INSERT WITH CHECK (public.sale_belongs_to_my_tenant(sale_id));

-- CREDIT_PAYMENTS
CREATE POLICY "credit_payments_select" ON public.credit_payments
  FOR SELECT USING (public.sale_belongs_to_my_tenant(sale_id));

CREATE POLICY "credit_payments_insert" ON public.credit_payments
  FOR INSERT WITH CHECK (public.sale_belongs_to_my_tenant(sale_id));

-- -----------------------------------------------------------------------------
-- Función RPC: procesar venta (transacción atómica)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale(
  p_client_name TEXT,
  p_sale_type public.sale_type,
  p_payment_method TEXT DEFAULT 'efectivo',
  p_due_date DATE DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_user_id UUID;
  v_tenant_id UUID;
  v_sale_id UUID;
  v_total DECIMAL(12, 2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_qty INTEGER;
  v_price DECIMAL(12, 2);
  v_stock INTEGER;
  v_cash_register_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_branch_id := public.get_my_branch_id();
  v_tenant_id := public.get_my_tenant_id();

  IF v_branch_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Perfil de usuario no configurado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;

  -- Validar stock y calcular total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL(12, 2);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto %', v_product_id;
    END IF;

    SELECT stock INTO v_stock
    FROM public.inventory
    WHERE branch_id = v_branch_id AND product_id = v_product_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', v_product_id;
    END IF;

    v_total := v_total + (v_price * v_qty);
  END LOOP;

  -- Crear venta
  INSERT INTO public.sales (
    branch_id, user_id, client_name, type, total,
    status_credit, due_date
  ) VALUES (
    v_branch_id,
    v_user_id,
    p_client_name,
    p_sale_type,
    v_total,
    CASE WHEN p_sale_type = 'credito' THEN 'pendiente'::public.credit_status ELSE 'pagado'::public.credit_status END,
    CASE WHEN p_sale_type = 'credito' THEN p_due_date ELSE NULL END
  )
  RETURNING id INTO v_sale_id;

  -- Detalles y débito de inventario
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL(12, 2);

    INSERT INTO public.sales_details (sale_id, product_id, quantity, price)
    VALUES (v_sale_id, v_product_id, v_qty, v_price);

    UPDATE public.inventory
    SET stock = stock - v_qty
    WHERE branch_id = v_branch_id AND product_id = v_product_id;
  END LOOP;

  -- Contado: incrementar caja abierta
  IF p_sale_type = 'contado' THEN
    SELECT id INTO v_cash_register_id
    FROM public.cash_registers
    WHERE branch_id = v_branch_id AND status = 'abierta'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_cash_register_id IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta. Abra la caja antes de vender al contado.';
    END IF;

    UPDATE public.cash_registers
    SET current_balance = current_balance + v_total
    WHERE id = v_cash_register_id;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'type', p_sale_type,
    'payment_method', p_payment_method
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Función RPC: registrar abono a crédito
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_credit_payment(
  p_sale_id UUID,
  p_amount DECIMAL(12, 2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_paid DECIMAL(12, 2);
  v_pending DECIMAL(12, 2);
  v_cash_register_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  SELECT s.*, b.tenant_id INTO v_sale
  FROM public.sales s
  JOIN public.branches b ON b.id = s.branch_id
  WHERE s.id = p_sale_id
    AND s.branch_id = public.get_my_branch_id()
    AND b.tenant_id = public.get_my_tenant_id()
  FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.type <> 'credito' OR v_sale.status_credit <> 'pendiente' THEN
    RAISE EXCEPTION 'La venta no es un crédito pendiente';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0) INTO v_paid
  FROM public.credit_payments
  WHERE sale_id = p_sale_id;

  v_pending := v_sale.total - v_paid;

  IF p_amount > v_pending THEN
    RAISE EXCEPTION 'El abono excede el saldo pendiente (%)', v_pending;
  END IF;

  INSERT INTO public.credit_payments (sale_id, amount_paid)
  VALUES (p_sale_id, p_amount);

  v_paid := v_paid + p_amount;

  IF v_paid >= v_sale.total THEN
    UPDATE public.sales SET status_credit = 'pagado' WHERE id = p_sale_id;
  END IF;

  -- Inyectar abono a caja abierta
  SELECT id INTO v_cash_register_id
  FROM public.cash_registers
  WHERE branch_id = v_sale.branch_id AND status = 'abierta'
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_register_id IS NULL THEN
    RAISE EXCEPTION 'No hay caja abierta para registrar el abono.';
  END IF;

  UPDATE public.cash_registers
  SET current_balance = current_balance + p_amount
  WHERE id = v_cash_register_id;

  RETURN jsonb_build_object(
    'sale_id', p_sale_id,
    'amount_paid', p_amount,
    'remaining', GREATEST(v_sale.total - v_paid, 0),
    'status_credit', CASE WHEN v_paid >= v_sale.total THEN 'pagado' ELSE 'pendiente' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_credit_payment TO authenticated;

-- -----------------------------------------------------------------------------
-- Categorías, presentaciones e imágenes de productos
-- -----------------------------------------------------------------------------
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.presentations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id),
  ADD COLUMN IF NOT EXISTS presentation_id UUID REFERENCES public.presentations(id),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GTQ';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'activa',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_tenant" ON public.categories
  FOR ALL USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "presentations_tenant" ON public.presentations
  FOR ALL USING (tenant_id = public.get_my_tenant_id());

-- -----------------------------------------------------------------------------
-- Sandy: atributos por categoría, utilidad, envío, intercambios
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.sales_details
  ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_shipping BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_fee DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit DECIMAL(12, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.seller_exchanges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  from_branch_id UUID NOT NULL REFERENCES public.branches(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_branch_id UUID NOT NULL REFERENCES public.branches(id),
  type TEXT NOT NULL CHECK (type IN ('producto', 'efectivo')),
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.seller_exchanges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_exchanges_tenant" ON public.seller_exchanges
  FOR ALL USING (tenant_id = public.get_my_tenant_id());
-- =============================================================================
-- POS — Extensiones: RBAC, servicio técnico, RPCs completos, RLS multi-sucursal
-- Ejecutar DESPUÉS de schema.sql en proyecto vacío
-- =============================================================================

-- Ampliar enum de roles
DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'contabilidad';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Tabla roles (RBAC granular)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE public.users_profiles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id),
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS device_brand TEXT,
  ADD COLUMN IF NOT EXISTS device_model TEXT,
  ADD COLUMN IF NOT EXISTS device_platform TEXT,
  ADD COLUMN IF NOT EXISTS device_universal BOOLEAN DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS repair_order_id UUID;

-- -----------------------------------------------------------------------------
-- Servicio técnico
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.repair_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ticket_number TEXT NOT NULL,
  ticket_password TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  device_brand TEXT NOT NULL,
  device_model TEXT NOT NULL,
  device_condition TEXT NOT NULL,
  condition_notes TEXT,
  repair_service_id UUID REFERENCES public.products(id),
  repair_service_name TEXT,
  labor_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  technician_id UUID REFERENCES public.technicians(id),
  technician_name TEXT,
  estimated_completion DATE,
  notes TEXT,
  total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recibido',
  parts_deducted BOOLEAN NOT NULL DEFAULT false,
  sale_id UUID REFERENCES public.sales(id),
  delivered_at TIMESTAMPTZ,
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_repair_order_id_fkey;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_repair_order_id_fkey
  FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_technicians_branch ON public.technicians(branch_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_branch_status ON public.repair_orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_repair_orders_ticket ON public.repair_orders(branch_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_products_attributes_gin ON public.products USING GIN (attributes);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Helpers RLS: acceso multi-sucursal para admins
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = public.get_my_tenant_id()
      AND (
        public.get_my_role() = 'admin_org'
        OR b.id = public.get_my_branch_id()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(r.permissions, '[]'::jsonb)
  FROM public.users_profiles up
  LEFT JOIN public.roles r ON r.id = up.role_id
  WHERE up.user_id = auth.uid()
  LIMIT 1;
$$;

-- Políticas roles / técnicos / reparaciones
DROP POLICY IF EXISTS "roles_tenant" ON public.roles;
CREATE POLICY "roles_tenant" ON public.roles
  FOR ALL USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "technicians_tenant" ON public.technicians;
CREATE POLICY "technicians_tenant" ON public.technicians
  FOR ALL USING (
    tenant_id = public.get_my_tenant_id()
    AND public.can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "repair_orders_branch" ON public.repair_orders;
CREATE POLICY "repair_orders_branch" ON public.repair_orders
  FOR ALL USING (
    tenant_id = public.get_my_tenant_id()
    AND public.can_access_branch(branch_id)
  );

-- Actualizar políticas de inventario, ventas y caja
DROP POLICY IF EXISTS "inventory_select_branch" ON public.inventory;
CREATE POLICY "inventory_select_branch" ON public.inventory
  FOR SELECT USING (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "inventory_insert_branch" ON public.inventory;
CREATE POLICY "inventory_insert_branch" ON public.inventory
  FOR INSERT WITH CHECK (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "inventory_update_branch" ON public.inventory;
CREATE POLICY "inventory_update_branch" ON public.inventory
  FOR UPDATE USING (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "inventory_delete_branch" ON public.inventory;
CREATE POLICY "inventory_delete_branch" ON public.inventory
  FOR DELETE USING (
    public.can_access_branch(branch_id)
    AND public.get_my_role() = 'admin_org'
  );

DROP POLICY IF EXISTS "cash_registers_select_branch" ON public.cash_registers;
CREATE POLICY "cash_registers_select_branch" ON public.cash_registers
  FOR SELECT USING (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "cash_registers_insert_branch" ON public.cash_registers;
CREATE POLICY "cash_registers_insert_branch" ON public.cash_registers
  FOR INSERT WITH CHECK (
    public.can_access_branch(branch_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cash_registers_update_branch" ON public.cash_registers;
CREATE POLICY "cash_registers_update_branch" ON public.cash_registers
  FOR UPDATE USING (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "sales_select_branch" ON public.sales;
CREATE POLICY "sales_select_branch" ON public.sales
  FOR SELECT USING (public.can_access_branch(branch_id));

DROP POLICY IF EXISTS "sales_insert_branch" ON public.sales;
CREATE POLICY "sales_insert_branch" ON public.sales
  FOR INSERT WITH CHECK (
    public.can_access_branch(branch_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "sales_update_branch" ON public.sales;
CREATE POLICY "sales_update_branch" ON public.sales
  FOR UPDATE USING (public.can_access_branch(branch_id));

-- -----------------------------------------------------------------------------
-- process_sale actualizado (envío, utilidad, costos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sale(
  p_client_name TEXT,
  p_sale_type public.sale_type,
  p_payment_method TEXT DEFAULT 'efectivo',
  p_due_date DATE DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_requires_shipping BOOLEAN DEFAULT false,
  p_shipping_cost DECIMAL(12, 2) DEFAULT 0,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_user_id UUID;
  v_sale_id UUID;
  v_subtotal DECIMAL(12, 2) := 0;
  v_shipping DECIMAL(12, 2) := 0;
  v_total DECIMAL(12, 2) := 0;
  v_gross_profit DECIMAL(12, 2) := 0;
  v_card_fee DECIMAL(12, 2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_qty INTEGER;
  v_price DECIMAL(12, 2);
  v_cost DECIMAL(12, 2);
  v_stock INTEGER;
  v_cash_register_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_branch_id := COALESCE(p_branch_id, public.get_my_branch_id());
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Perfil de usuario no configurado';
  END IF;

  IF NOT public.can_access_branch(v_branch_id) THEN
    RAISE EXCEPTION 'Sucursal no autorizada';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;

  v_shipping := CASE WHEN p_requires_shipping THEN COALESCE(p_shipping_cost, 0) ELSE 0 END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL(12, 2);
    v_cost := COALESCE((v_item->>'cost')::DECIMAL(12, 2), 0);

    IF v_cost = 0 THEN
      SELECT cost INTO v_cost FROM public.products WHERE id = v_product_id;
      v_cost := COALESCE(v_cost, 0);
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto %', v_product_id;
    END IF;

    SELECT stock INTO v_stock
    FROM public.inventory
    WHERE branch_id = v_branch_id AND product_id = v_product_id
    FOR UPDATE;

    IF v_stock IS NULL OR v_stock < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', v_product_id;
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_gross_profit := v_gross_profit + ((v_price - v_cost) * v_qty);
  END LOOP;

  v_total := v_subtotal + v_shipping;

  IF p_sale_type = 'contado' AND p_payment_method = 'tarjeta' THEN
    v_card_fee := v_gross_profit * 0.05;
  END IF;

  INSERT INTO public.sales (
    branch_id, user_id, client_name, type, total, subtotal,
    shipping_cost, requires_shipping, card_fee, gross_profit, net_profit,
    payment_method, status_credit, due_date, status
  ) VALUES (
    v_branch_id,
    v_user_id,
    p_client_name,
    p_sale_type,
    v_total,
    v_subtotal,
    v_shipping,
    p_requires_shipping,
    v_card_fee,
    v_gross_profit,
    v_gross_profit - v_card_fee,
    p_payment_method,
    CASE WHEN p_sale_type = 'credito' THEN 'pendiente'::public.credit_status ELSE 'pagado'::public.credit_status END,
    CASE WHEN p_sale_type = 'credito' THEN p_due_date ELSE NULL END,
    'activa'
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL(12, 2);
    v_cost := COALESCE((v_item->>'cost')::DECIMAL(12, 2), 0);

    IF v_cost = 0 THEN
      SELECT cost INTO v_cost FROM public.products WHERE id = v_product_id;
      v_cost := COALESCE(v_cost, 0);
    END IF;

    INSERT INTO public.sales_details (sale_id, product_id, quantity, price, cost)
    VALUES (v_sale_id, v_product_id, v_qty, v_price, v_cost);

    UPDATE public.inventory
    SET stock = stock - v_qty
    WHERE branch_id = v_branch_id AND product_id = v_product_id;
  END LOOP;

  IF p_sale_type = 'contado' THEN
    SELECT id INTO v_cash_register_id
    FROM public.cash_registers
    WHERE branch_id = v_branch_id AND status = 'abierta'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_cash_register_id IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta. Abra la caja antes de vender al contado.';
    END IF;

    UPDATE public.cash_registers
    SET current_balance = current_balance + v_total
    WHERE id = v_cash_register_id;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping,
    'card_fee', v_card_fee,
    'type', p_sale_type,
    'payment_method', p_payment_method
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- void_sale: anular recibo y revertir inventario/caja
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_detail RECORD;
  v_payments_total DECIMAL(12, 2) := 0;
  v_cash_register_id UUID;
BEGIN
  SELECT s.* INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND public.can_access_branch(s.branch_id)
  FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Recibo no encontrado';
  END IF;

  IF v_sale.status = 'anulada' THEN
    RAISE EXCEPTION 'Este recibo ya fue anulado';
  END IF;

  FOR v_detail IN
    SELECT * FROM public.sales_details WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.inventory
    SET stock = stock + v_detail.quantity
    WHERE branch_id = v_sale.branch_id AND product_id = v_detail.product_id;
  END LOOP;

  SELECT COALESCE(SUM(amount_paid), 0) INTO v_payments_total
  FROM public.credit_payments
  WHERE sale_id = p_sale_id;

  SELECT id INTO v_cash_register_id
  FROM public.cash_registers
  WHERE branch_id = v_sale.branch_id AND status = 'abierta'
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_register_id IS NOT NULL THEN
    IF v_sale.type = 'contado' THEN
      UPDATE public.cash_registers
      SET current_balance = current_balance - v_sale.total
      WHERE id = v_cash_register_id;
    END IF;

    IF v_payments_total > 0 THEN
      UPDATE public.cash_registers
      SET current_balance = current_balance - v_payments_total
      WHERE id = v_cash_register_id;
    END IF;
  END IF;

  UPDATE public.sales
  SET status = 'anulada',
      voided_at = NOW(),
      status_credit = CASE WHEN type = 'credito' THEN 'pagado'::public.credit_status ELSE status_credit END
  WHERE id = p_sale_id;

  RETURN jsonb_build_object('sale_id', p_sale_id, 'status', 'anulada');
END;
$$;

-- -----------------------------------------------------------------------------
-- process_seller_exchange
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_seller_exchange(
  p_tenant_id UUID,
  p_from_user_id UUID,
  p_from_branch_id UUID,
  p_to_user_id UUID,
  p_to_branch_id UUID,
  p_type TEXT,
  p_product_id UUID DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_amount DECIMAL(12, 2) DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_from_stock INTEGER;
  v_exchange_id UUID;
  v_final_amount DECIMAL(12, 2) := 0;
BEGIN
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Seleccione una vendedora distinta';
  END IF;

  IF p_tenant_id <> public.get_my_tenant_id() THEN
    RAISE EXCEPTION 'Organización inválida';
  END IF;

  IF NOT public.can_access_branch(p_from_branch_id) OR NOT public.can_access_branch(p_to_branch_id) THEN
    RAISE EXCEPTION 'Sucursal no autorizada';
  END IF;

  IF p_type = 'producto' THEN
    IF p_product_id IS NULL THEN
      RAISE EXCEPTION 'Seleccione un producto';
    END IF;

    IF p_quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    SELECT stock INTO v_from_stock
    FROM public.inventory
    WHERE branch_id = p_from_branch_id AND product_id = p_product_id
    FOR UPDATE;

    IF v_from_stock IS NULL OR v_from_stock < p_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente en la vendedora origen';
    END IF;

    v_final_amount := COALESCE(v_product.cost, 0) * p_quantity;

    UPDATE public.inventory
    SET stock = stock - p_quantity
    WHERE branch_id = p_from_branch_id AND product_id = p_product_id;

    INSERT INTO public.inventory (branch_id, product_id, stock)
    VALUES (p_to_branch_id, p_product_id, p_quantity)
    ON CONFLICT (branch_id, product_id)
    DO UPDATE SET stock = public.inventory.stock + EXCLUDED.stock;

  ELSIF p_type = 'efectivo' THEN
    v_final_amount := COALESCE(p_amount, 0);
    IF v_final_amount <= 0 THEN
      RAISE EXCEPTION 'Ingrese un monto válido';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de intercambio inválido';
  END IF;

  INSERT INTO public.seller_exchanges (
    tenant_id, from_user_id, from_branch_id, to_user_id, to_branch_id,
    type, product_id, quantity, amount, notes
  ) VALUES (
    p_tenant_id, p_from_user_id, p_from_branch_id, p_to_user_id, p_to_branch_id,
    p_type, p_product_id, CASE WHEN p_type = 'producto' THEN p_quantity ELSE NULL END,
    v_final_amount, p_notes
  )
  RETURNING id INTO v_exchange_id;

  RETURN jsonb_build_object('exchange_id', v_exchange_id, 'amount', v_final_amount);
END;
$$;

-- -----------------------------------------------------------------------------
-- deliver_repair_order
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deliver_repair_order(
  p_order_id UUID,
  p_payment_method TEXT DEFAULT 'efectivo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_part JSONB;
  v_sale_id UUID;
  v_total DECIMAL(12, 2) := 0;
  v_cash_register_id UUID;
  v_product_id UUID;
  v_qty INTEGER;
  v_price DECIMAL(12, 2);
  v_stock INTEGER;
BEGIN
  SELECT * INTO v_order
  FROM public.repair_orders
  WHERE id = p_order_id
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;

  IF v_order.status = 'entregado' THEN
    RAISE EXCEPTION 'Esta orden ya fue entregada';
  END IF;

  IF v_order.sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('sale_id', v_order.sale_id, 'order_id', p_order_id);
  END IF;

  SELECT id INTO v_cash_register_id
  FROM public.cash_registers
  WHERE branch_id = v_order.branch_id AND status = 'abierta'
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_register_id IS NULL THEN
    RAISE EXCEPTION 'No hay caja abierta. Abra la caja antes de entregar y cobrar.';
  END IF;

  v_total := COALESCE(v_order.labor_cost, 0);
  FOR v_part IN SELECT * FROM jsonb_array_elements(COALESCE(v_order.parts, '[]'::jsonb))
  LOOP
    v_total := v_total + COALESCE((v_part->>'price')::DECIMAL(12, 2), 0) * COALESCE((v_part->>'quantity')::INTEGER, 0);
  END LOOP;

  IF NOT v_order.parts_deducted THEN
    IF v_order.repair_service_id IS NOT NULL THEN
      SELECT stock INTO v_stock
      FROM public.inventory
      WHERE branch_id = v_order.branch_id AND product_id = v_order.repair_service_id
      FOR UPDATE;
      IF v_stock IS NULL OR v_stock < 1 THEN
        RAISE EXCEPTION 'Stock insuficiente para el servicio de reparación';
      END IF;
    END IF;

    FOR v_part IN SELECT * FROM jsonb_array_elements(COALESCE(v_order.parts, '[]'::jsonb))
    LOOP
      v_product_id := (v_part->>'product_id')::UUID;
      v_qty := COALESCE((v_part->>'quantity')::INTEGER, 0);
      SELECT stock INTO v_stock
      FROM public.inventory
      WHERE branch_id = v_order.branch_id AND product_id = v_product_id
      FOR UPDATE;
      IF v_stock IS NULL OR v_stock < v_qty THEN
        RAISE EXCEPTION 'Stock insuficiente para repuesto';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.sales (
    branch_id, user_id, client_name, type, total, payment_method,
    status, status_credit, repair_order_id
  ) VALUES (
    v_order.branch_id, auth.uid(), v_order.client_name, 'contado', v_total,
    p_payment_method, 'activa', 'pagado', p_order_id
  )
  RETURNING id INTO v_sale_id;

  IF v_order.repair_service_id IS NOT NULL AND NOT v_order.parts_deducted THEN
    INSERT INTO public.sales_details (sale_id, product_id, quantity, price)
    VALUES (v_sale_id, v_order.repair_service_id, 1, v_order.labor_cost);

    UPDATE public.inventory
    SET stock = stock - 1
    WHERE branch_id = v_order.branch_id AND product_id = v_order.repair_service_id;
  ELSIF v_order.repair_service_id IS NOT NULL THEN
    INSERT INTO public.sales_details (sale_id, product_id, quantity, price)
    VALUES (v_sale_id, v_order.repair_service_id, 1, v_order.labor_cost);
  END IF;

  IF NOT v_order.parts_deducted THEN
    FOR v_part IN SELECT * FROM jsonb_array_elements(COALESCE(v_order.parts, '[]'::jsonb))
    LOOP
      v_product_id := (v_part->>'product_id')::UUID;
      v_qty := COALESCE((v_part->>'quantity')::INTEGER, 0);
      v_price := COALESCE((v_part->>'price')::DECIMAL(12, 2), 0);

      INSERT INTO public.sales_details (sale_id, product_id, quantity, price)
      VALUES (v_sale_id, v_product_id, v_qty, v_price);

      UPDATE public.inventory
      SET stock = stock - v_qty
      WHERE branch_id = v_order.branch_id AND product_id = v_product_id;
    END LOOP;
  ELSE
    FOR v_part IN SELECT * FROM jsonb_array_elements(COALESCE(v_order.parts, '[]'::jsonb))
    LOOP
      v_product_id := (v_part->>'product_id')::UUID;
      v_qty := COALESCE((v_part->>'quantity')::INTEGER, 0);
      v_price := COALESCE((v_part->>'price')::DECIMAL(12, 2), 0);

      INSERT INTO public.sales_details (sale_id, product_id, quantity, price)
      VALUES (v_sale_id, v_product_id, v_qty, v_price);
    END LOOP;
  END IF;

  UPDATE public.cash_registers
  SET current_balance = current_balance + v_total
  WHERE id = v_cash_register_id;

  UPDATE public.repair_orders
  SET status = 'entregado',
      parts_deducted = true,
      sale_id = v_sale_id,
      delivered_at = NOW(),
      payment_method = p_payment_method,
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'order_id', p_order_id, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_seller_exchange TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_repair_order TO authenticated;

-- Actualizar register_credit_payment para admins multi-sucursal
CREATE OR REPLACE FUNCTION public.register_credit_payment(
  p_sale_id UUID,
  p_amount DECIMAL(12, 2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_paid DECIMAL(12, 2);
  v_pending DECIMAL(12, 2);
  v_cash_register_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  SELECT s.*, b.tenant_id INTO v_sale
  FROM public.sales s
  JOIN public.branches b ON b.id = s.branch_id
  WHERE s.id = p_sale_id
    AND b.tenant_id = public.get_my_tenant_id()
    AND public.can_access_branch(s.branch_id)
  FOR UPDATE;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.type <> 'credito' OR v_sale.status_credit <> 'pendiente' THEN
    RAISE EXCEPTION 'La venta no es un crédito pendiente';
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0) INTO v_paid
  FROM public.credit_payments
  WHERE sale_id = p_sale_id;

  v_pending := v_sale.total - v_paid;

  IF p_amount > v_pending THEN
    RAISE EXCEPTION 'El abono excede el saldo pendiente (%)', v_pending;
  END IF;

  INSERT INTO public.credit_payments (sale_id, amount_paid)
  VALUES (p_sale_id, p_amount);

  v_paid := v_paid + p_amount;

  IF v_paid >= v_sale.total THEN
    UPDATE public.sales SET status_credit = 'pagado' WHERE id = p_sale_id;
  END IF;

  SELECT id INTO v_cash_register_id
  FROM public.cash_registers
  WHERE branch_id = v_sale.branch_id AND status = 'abierta'
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_register_id IS NULL THEN
    RAISE EXCEPTION 'No hay caja abierta para registrar el abono.';
  END IF;

  UPDATE public.cash_registers
  SET current_balance = current_balance + p_amount
  WHERE id = v_cash_register_id;

  RETURN jsonb_build_object(
    'sale_id', p_sale_id,
    'amount_paid', p_amount,
    'remaining', GREATEST(v_sale.total - v_paid, 0),
    'status_credit', CASE WHEN v_paid >= v_sale.total THEN 'pagado' ELSE 'pendiente' END
  );
END;
$$;
-- =============================================================================
-- Sandy / Mary Kay — datos iniciales
-- Ejecutar DESPUÉS de setup-complete.sql
-- =============================================================================

INSERT INTO public.tenants (id, name) VALUES ('a0000000-0000-4000-8000-000000000004', 'Sandy') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.branches (id, tenant_id, name, address) VALUES
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000004', 'Sandy — María', 'Zona 10, Guatemala'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000004', 'Sandy — Laura', 'Mixco, Guatemala')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, tenant_id, name, slug, permissions, is_system) VALUES
  ('e0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000004', 'Admin Sandy', 'admin_org', '["admin.access","admin.roles","admin.usuarios","pos.vender","inventario.gestionar","caja.gestionar","creditos.gestionar","recibos.gestionar","reportes.ver","intercambios.gestionar"]'::jsonb, true),
  ('e0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000004', 'Vendedora Sandy', 'vendedor', '["pos.vender","inventario.gestionar","caja.gestionar","creditos.gestionar","recibos.gestionar","reportes.ver","intercambios.gestionar"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, tenant_id, name) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'MARY KAY'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'ROPA DE NIÑOS'),
  ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'CARTERAS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.presentations (id, tenant_id, name) VALUES
  ('f0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000004', 'Unidad'),
  ('f0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000004', 'Set'),
  ('f0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000004', 'Par')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, tenant_id, name, sku, barcode, price, cost, category_id, presentation_id, image_url, attributes) VALUES
  ('511d93bf-30db-4da2-8dc6-b7d985e3b6bc', 'a0000000-0000-4000-8000-000000000004', 'Set de Manos de Seda', 'MK-SETDEMAN-001', '759002100001', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('dd670fde-7615-4886-86c4-90df740db90f', 'a0000000-0000-4000-8000-000000000004', 'Set Milagroso TIME WISE C/G', 'MK-SETMILTI-002', '759002100002', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('1f2eac8f-fcbf-4587-8b10-eb61e012a096', 'a0000000-0000-4000-8000-000000000004', 'Set Milagroso TIME WISE N/S', 'MK-SETMILTI-003', '759002100003', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('fa908f81-ab6f-4e42-8c52-04ca9d84ea0b', 'a0000000-0000-4000-8000-000000000004', 'Set Milagroso TIME WISE C/G máximo', 'MK-SETMILTI-004', '759002100004', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('c3950466-d14d-4c4c-8d9d-be39afc582a9', 'a0000000-0000-4000-8000-000000000004', 'Set Milagroso TIME WISE N/S máximo', 'MK-SETMILTI-005', '759002100005', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('fef994d9-dda5-4bb3-8885-9200a6d1e420', 'a0000000-0000-4000-8000-000000000004', 'Limpiadora facial 4 en 1 TW C/G', 'MK-LIMFAC4-006', '759002100006', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('a1aeb8b8-d2d8-4796-8d98-fa8af5469b54', 'a0000000-0000-4000-8000-000000000004', 'Limpiadora facial 4 en 1 TW N/S', 'MK-LIMFAC4-007', '759002100007', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('0775b3ff-1e7d-45a1-87a7-0b74c544dca2', 'a0000000-0000-4000-8000-000000000004', 'Loción Facial Humectante con Antioxidantes TW C/G', 'MK-LOCFACHU-008', '759002100008', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('0a39fafa-c43f-48f1-8e92-e2665c225733', 'a0000000-0000-4000-8000-000000000004', 'Loción Facial  Humectante con Antioxidantes TW N/S', 'MK-LOCFACHU-009', '759002100009', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('e87b21eb-2915-4e82-8205-786f5ae88893', 'a0000000-0000-4000-8000-000000000004', 'Loción Facial protectora de día con FPS', 'MK-LOCFACPR-010', '759002100010', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('43b8a10b-d147-4bda-8acc-24bd426bb013', 'a0000000-0000-4000-8000-000000000004', 'Gel de Recuperación Nocturna TW', 'MK-GELDEREC-011', '759002100011', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('af3e86b8-ba77-4db4-889f-7ff600514b5a', 'a0000000-0000-4000-8000-000000000004', 'Crema para el Contorno de los Ojos TW', 'MK-CREPAREL-012', '759002100012', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('6d142013-0fa3-4835-8d4c-d9a737998bb1', 'a0000000-0000-4000-8000-000000000004', 'Limpiadora Facial Matificante', 'MK-LIMFACMA-013', '759002100013', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('f3375587-b7fa-4c37-89f2-f32b88ceca1e', 'a0000000-0000-4000-8000-000000000004', 'Limpiadora Facial Hidratante', 'MK-LIMFACHI-014', '759002100014', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('277bb6ff-4308-47d2-8ba2-40f9249f72a3', 'a0000000-0000-4000-8000-000000000004', 'Crema Facial Matificante', 'MK-CREFACMA-015', '759002100015', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('c8a6e44e-4d24-47e6-839d-bf034229d2c6', 'a0000000-0000-4000-8000-000000000004', 'Crema Facial Hidratante', 'MK-CREFACHI-016', '759002100016', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('b3aca6d2-634e-45ca-8787-07c529ca9d90', 'a0000000-0000-4000-8000-000000000004', 'Exfoliante Facial', 'MK-EXFFAC-017', '759002100017', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('80956198-53ee-43d9-8b84-3a2ce5bc6506', 'a0000000-0000-4000-8000-000000000004', 'Tonico Equilibrante Mary Kay', 'MK-TONEQUMA-018', '759002100018', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('16cc0d08-9d44-4868-8521-5b2483806b12', 'a0000000-0000-4000-8000-000000000004', 'Mascarilla Facial Carbon Activado', 'MK-MASFACCA-019', '759002100019', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('b8f0f982-0591-4dc2-8976-cbe3e91ac2b0', 'a0000000-0000-4000-8000-000000000004', 'Crema Humectante para Cutis con tendencia acné', 'MK-CREHUMPA-020', '759002100020', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('d728ae10-d429-49f2-8c4a-ef66c57fddb9', 'a0000000-0000-4000-8000-000000000004', 'Crema Focalizadora para cutis con tendencia acné', 'MK-CREFOCPA-021', '759002100021', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('d8280527-80fd-4432-8763-88dd8b114a81', 'a0000000-0000-4000-8000-000000000004', 'Potenciador Iluminador Acido Ferulico y Niacinamida', 'MK-POTILUAC-022', '759002100022', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('465fcae4-0749-480f-8686-a80fb35b6ab5', 'a0000000-0000-4000-8000-000000000004', 'Potenciador Reductor de Lineas Vitamina C + Resveratrol', 'MK-POTREDDE-023', '759002100023', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('86e1106a-9644-4510-8e38-9b47d42a7ecd', 'a0000000-0000-4000-8000-000000000004', 'Potenciador exfoliante', 'MK-POTEXF-024', '759002100024', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('fbbaffa2-cbb8-4665-8095-caa23260b8c0', 'a0000000-0000-4000-8000-000000000004', 'Potenciador HA + Ceramida para la Humectacion', 'MK-POTHACER-025', '759002100025', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('a5bd6ff8-fb76-4cb5-8f05-fb3aa362bd30', 'a0000000-0000-4000-8000-000000000004', 'Crema Facial Dia SPF Repair', 'MK-CREFACDI-026', '759002100026', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('7f205962-0ee2-4652-8ea6-44d51e211403', 'a0000000-0000-4000-8000-000000000004', 'Crema Facial Nocturna Repair', 'MK-CREFACNO-027', '759002100027', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('d0ebb3b3-762d-4049-84f7-5d1261b07cc7', 'a0000000-0000-4000-8000-000000000004', 'Crema Efecto Rellenador de arrugas Repair', 'MK-CREEFERE-028', '759002100028', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('facfaf68-4559-4ab3-8ab7-458f37344515', 'a0000000-0000-4000-8000-000000000004', 'Crema de Accion Renovadora para el contorno de los ojos', 'MK-CREDEACC-029', '759002100029', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('508d9fa0-36b9-4316-8314-9e3be70071d8', 'a0000000-0000-4000-8000-000000000004', 'Locion Facial Efecto Reafirmante Repair', 'MK-LOCFACEF-030', '759002100030', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('22c97930-2193-47cc-845c-4cdab86462d9', 'a0000000-0000-4000-8000-000000000004', 'Gel Facial Efecto Peeling', 'MK-GELFACEF-031', '759002100031', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('2f8b42a8-feef-464a-8c91-dca04c1da405', 'a0000000-0000-4000-8000-000000000004', 'Crema Facial con Efecto Tensor', 'MK-CREFACCO-032', '759002100032', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('c015a670-e15e-4b4c-8e15-30c2187c5567', 'a0000000-0000-4000-8000-000000000004', 'Crema Humectante Intensiva (rosado)', 'MK-CREHUMIN-033', '759002100033', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('cdc308f3-d1ad-4626-840c-328a91aa0b8f', 'a0000000-0000-4000-8000-000000000004', 'Crema de noche Extraemoliente', 'MK-CREDENOC-034', '759002100034', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('506760fb-5566-4b7d-8398-06364b9570f0', 'a0000000-0000-4000-8000-000000000004', 'Protector Solar FPS 50', 'MK-PROSOLFP-035', '759002100035', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('b8a4345e-60fd-4303-81fa-52e1ea672a15', 'a0000000-0000-4000-8000-000000000004', 'Protector Solar FPS 30 Mineral', 'MK-PROSOLFP-036', '759002100036', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('7ad050ad-0c3c-4cc7-84cc-46104b12a95d', 'a0000000-0000-4000-8000-000000000004', 'Loción facial Regenadora C+E', 'MK-LOCFACRE-037', '759002100037', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('04b6bff0-3479-42ed-81de-63890883d955', 'a0000000-0000-4000-8000-000000000004', 'Crema para manos con karité', 'MK-CREPARMA-038', '759002100038', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('ab694ecf-5ed0-43f2-8afc-a81b4b5a33dc', 'a0000000-0000-4000-8000-000000000004', 'Crema para pies', 'MK-CREPARPI-039', '759002100039', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('1e677414-2075-4f40-89ff-743b32cc573c', 'a0000000-0000-4000-8000-000000000004', 'Agua Micelar', 'MK-AGUMIC-040', '759002100040', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('8799ef17-3de7-4b43-81ac-9869e467f03e', 'a0000000-0000-4000-8000-000000000004', 'Desmaquillante para ojos', 'MK-DESPAROJ-041', '759002100041', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('0dec9574-d93a-46ad-8502-8400540bcf93', 'a0000000-0000-4000-8000-000000000004', 'Minimizador de Apariencia de bolsas en los ojos', 'MK-MINDEAPA-042', '759002100042', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('9de6d8fb-03f0-4398-812a-91ebeca45c95', 'a0000000-0000-4000-8000-000000000004', 'Gel Corporal Restaurador para despues de asolearse', 'MK-GELCORRE-043', '759002100043', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('3aadd328-790a-4776-85be-f6c6dbcfe0df', 'a0000000-0000-4000-8000-000000000004', 'Mascarilla Humectante Efecto Renovador', 'MK-MASHUMEF-044', '759002100044', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('c635e94b-8031-45f3-8dac-0f1d3e639627', 'a0000000-0000-4000-8000-000000000004', 'Parches de Hidrogel', 'MK-PARDEHID-045', '759002100045', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('e514eaf1-b253-4a63-841e-ee3f8cd24ce6', 'a0000000-0000-4000-8000-000000000004', 'Gel Refrescante indulge para ojos', 'MK-GELREFIN-046', '759002100046', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('b985cce1-4ba7-4d7c-880b-c008c0435f4f', 'a0000000-0000-4000-8000-000000000004', 'Gel Limpiador Facial MK Men', 'MK-GELLIMFA-047', '759002100047', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('4ecba004-25d5-4e85-800e-bed648f1d436', 'a0000000-0000-4000-8000-000000000004', 'Locion Facial Hidratente Intensiva MK Men', 'MK-LOCFACHI-048', '759002100048', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('f31838d9-8ff6-4fe2-8534-9ed522dffc8c', 'a0000000-0000-4000-8000-000000000004', 'Crema de afeitar 2 en 1 MK Men', 'MK-CREDEAFE-049', '759002100049', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('3be7bdea-00cf-40a8-8657-7a88937205cf', 'a0000000-0000-4000-8000-000000000004', 'Locion Facial Restauradora de la Barrera 3 en 1', 'MK-LOCFACRE-050', '759002100050', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('121af323-546a-4a51-8b07-ca6bd9f05518', 'a0000000-0000-4000-8000-000000000004', 'Locion Humectante Efecto Renovador', 'MK-LOCHUMEF-051', '759002100051', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('496d59c4-99dc-4b98-880f-2b32e0433c64', 'a0000000-0000-4000-8000-000000000004', 'Aceite Nutritivo MK', 'MK-ACENUTMK-052', '759002100052', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('8b3117c8-bc8d-4241-8476-0a56362996e5', 'a0000000-0000-4000-8000-000000000004', 'Set de Microdermoabrasión', 'MK-SETDEMIC-053', '759002100053', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000012', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Cuidado de la piel"}'::jsonb),
  ('7bfb55ed-2bac-4b82-887a-b77d84942850', 'a0000000-0000-4000-8000-000000000004', 'Authentic Hero Bold', 'MK-AUTHERBO-054', '759002100054', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Fragancias"}'::jsonb),
  ('c7b26925-08ca-42b9-8e94-cd146d896cd6', 'a0000000-0000-4000-8000-000000000004', 'Free Spirit', 'MK-FRESPI-055', '759002100055', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Fragancias"}'::jsonb),
  ('72ee4e38-de24-4f44-8913-51ceae528daf', 'a0000000-0000-4000-8000-000000000004', 'Confidently', 'MK-CON-056', '759002100056', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Fragancias"}'::jsonb),
  ('ee035827-7624-4511-889a-a9ba302f6b33', 'a0000000-0000-4000-8000-000000000004', 'Dream Fearlessly', 'MK-DREFEA-057', '759002100057', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Fragancias"}'::jsonb),
  ('3684de87-6e7a-4210-8c88-3fdab8d5da52', 'a0000000-0000-4000-8000-000000000004', 'PreBase de Maquillaje', 'MK-PREDEMAQ-058', '759002100058', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('49350320-807b-4f07-81e6-c01c5bda637f', 'a0000000-0000-4000-8000-000000000004', 'Base C120', 'MK-BASC12-059', '759002100059', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('7dc816f2-fb91-4b63-840a-bc131c11aa33', 'a0000000-0000-4000-8000-000000000004', 'Base C170', 'MK-BASC17-060', '759002100060', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('18801769-cafb-442b-8a97-9826cba50128', 'a0000000-0000-4000-8000-000000000004', 'Base C220', 'MK-BASC22-061', '759002100061', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('ebdb3ff2-d2e0-434e-87d0-ad3589a5fb4f', 'a0000000-0000-4000-8000-000000000004', 'Base N150', 'MK-BASN15-062', '759002100062', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('510154e3-eb70-47df-81d3-afa0780cfe07', 'a0000000-0000-4000-8000-000000000004', 'Base N190', 'MK-BASN19-063', '759002100063', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('24521a98-12e4-4d4a-837f-994b27b88cf9', 'a0000000-0000-4000-8000-000000000004', 'Base N210', 'MK-BASN21-064', '759002100064', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('34a2f448-a0d3-4dbc-85d7-e088e598cd87', 'a0000000-0000-4000-8000-000000000004', 'Base W110', 'MK-BASW11-065', '759002100065', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('947cdbe8-fad0-4e3e-871a-cb0a4c0770ce', 'a0000000-0000-4000-8000-000000000004', 'Base W160', 'MK-BASW16-066', '759002100066', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('37bf042c-172e-4697-8d1e-a492a8fa5e92', 'a0000000-0000-4000-8000-000000000004', 'Base W180', 'MK-BASW18-067', '759002100067', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('8d7793c8-16ee-4e51-8cdc-6fc77c17ed0b', 'a0000000-0000-4000-8000-000000000004', 'CC Cream Very Light', 'MK-CCCREVER-068', '759002100068', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('95e44302-ddfe-46c6-8d90-0b09359c1b97', 'a0000000-0000-4000-8000-000000000004', 'CC Cream Light to Medium', 'MK-CCCRELIG-069', '759002100069', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('ba794b71-4efe-4f69-8bb6-9a2e20671f2f', 'a0000000-0000-4000-8000-000000000004', 'CC Cream Medium to Deep', 'MK-CCCREMED-070', '759002100070', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('3d204a26-46c1-4c25-850f-91691063119a', 'a0000000-0000-4000-8000-000000000004', 'Base AT PLAY Light to Medium', 'MK-BASATPLA-071', '759002100071', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('0b8204e7-d411-4ab9-8424-9667fc2f6c82', 'a0000000-0000-4000-8000-000000000004', 'Base AT PLAY Medium to Deep', 'MK-BASATPLA-072', '759002100072', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('31d88dad-8d12-472f-8fef-3092fc7a898f', 'a0000000-0000-4000-8000-000000000004', 'Fijador de Maquillaje', 'MK-FIJDEMAQ-073', '759002100073', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('ad21cadd-69bd-42a6-8167-50c1e43cd5ec', 'a0000000-0000-4000-8000-000000000004', 'Toallitas de Lino Absorbentes', 'MK-TOADELIN-074', '759002100074', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - Bases"}'::jsonb),
  ('18d565bf-2540-49d9-8b20-356fbcc79b2b', 'a0000000-0000-4000-8000-000000000004', 'Compacto Petit Palette vacío', 'MK-COMPETPA-075', '759002100075', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('1975bce6-0d46-4250-86d3-75f01fc7bb06', 'a0000000-0000-4000-8000-000000000004', 'Delineador AT Play Negro', 'MK-DELATPLA-076', '759002100076', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('dd4765c8-f0d0-4631-8f35-b50d77ec7e84', 'a0000000-0000-4000-8000-000000000004', 'Mascara Greath Height', 'MK-MASGREHE-077', '759002100077', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('e365a5f2-17ac-45bb-84fc-ac4357e3fbdc', 'a0000000-0000-4000-8000-000000000004', 'Mascara Greath Height A prueba de Agua', 'MK-MASGREHE-078', '759002100078', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ed05a464-b07b-4ae7-8c54-5f872b91183c', 'a0000000-0000-4000-8000-000000000004', 'Paleta de Sombras rosa', 'MK-PALDESOM-079', '759002100079', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('62a48b7f-6f96-439a-8cca-5dab90e44ecd', 'a0000000-0000-4000-8000-000000000004', 'Paleta de Sombras azul', 'MK-PALDESOM-080', '759002100080', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('1a358827-3456-4ddf-8090-0a3cd9876fb7', 'a0000000-0000-4000-8000-000000000004', 'Polvos Traslúcidos', 'MK-POLTRA-081', '759002100081', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('41fff4ee-6a99-4dc7-8d0a-efa33afda4cb', 'a0000000-0000-4000-8000-000000000004', 'Polvos Light Beige', 'MK-POLLIGBE-082', '759002100082', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3d1d3d17-7d4e-4ca0-8b50-a755910c77be', 'a0000000-0000-4000-8000-000000000004', 'Polvos Medium Ivory', 'MK-POLMEDIV-083', '759002100083', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('cad52aa3-f65d-48ee-8f4c-979230ecce98', 'a0000000-0000-4000-8000-000000000004', 'Polvo para rostro multifuncional', 'MK-POLPARRO-084', '759002100084', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('92f41b87-d02b-4a78-8557-cc00d4ce221a', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Unique Mauve', 'MK-BRILABUN-085', '759002100085', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('d1495cd2-8430-4878-81ea-7b1f959045ef', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Cooper Aura', 'MK-BRILABCO-086', '759002100086', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('546416c1-9a57-4ca1-8155-862a8bd7ee82', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Tawny Nude', 'MK-BRILABTA-087', '759002100087', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('6b822cca-d309-4033-8f70-97e5679db3e0', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Fancy Nancy', 'MK-BRILABFA-088', '759002100088', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('445571b0-c49c-4867-89bc-6baebd080f95', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Sheer Ilusion', 'MK-BRILABSH-089', '759002100089', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('5b5362e8-0f85-4759-8bb8-8abc8fa609c5', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Berry Delight', 'MK-BRILABBE-090', '759002100090', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('0befd6aa-022a-497b-82bc-9007fabf54c8', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Iconic Red', 'MK-BRILABIC-091', '759002100091', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('80a3928e-56e0-44b4-8c57-2e2018123031', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Lilac Love', 'MK-BRILABLI-092', '759002100092', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3c5d7036-e2bf-48a0-8376-2a790d8a6bef', 'a0000000-0000-4000-8000-000000000004', 'Brillo Labial Pink Fusion', 'MK-BRILABPI-093', '759002100093', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('15910afa-5b02-44bc-823f-a103102a63d3', 'a0000000-0000-4000-8000-000000000004', 'Delineador Plumon', 'MK-DELPLU-094', '759002100094', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('a5f8c3a8-0118-4a33-8adc-872f39fc099c', 'a0000000-0000-4000-8000-000000000004', 'Gel Fijador de Cejas', 'MK-GELFIJDE-095', '759002100095', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3c75793f-91b2-4589-8bc2-5e5e7e18cbb9', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Cejas Brunette', 'MK-DELDECEJ-096', '759002100096', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ee743bae-767e-4e28-82e4-97308da10773', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Ojos Azul', 'MK-DELDEOJO-097', '759002100097', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('26ad72a9-2df6-490b-8158-8ade64522771', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Ojos Café', 'MK-DELDEOJO-098', '759002100098', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('fa451c88-dca6-4615-8670-dadb8e80ec2d', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Labios Tangerinne', 'MK-DELDELAB-099', '759002100099', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('e3daed13-6f1e-4bce-834f-e71e1edd40a6', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Labios Rose', 'MK-DELDELAB-100', '759002100100', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3a267d81-7a92-43a8-8f6f-64797a895834', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Labios Mauve Nude', 'MK-DELDELAB-101', '759002100101', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('dcb6c1e2-80e9-47f0-802a-6eeeee1518a0', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Labios Red', 'MK-DELDELAB-102', '759002100102', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('1e131e55-a966-43c9-80ac-14767f03c1c0', 'a0000000-0000-4000-8000-000000000004', 'Delineador de Labios Violet Lilac', 'MK-DELDELAB-103', '759002100103', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('a0f1e1dd-a6ae-4ddc-81c4-5c5a24540fed', 'a0000000-0000-4000-8000-000000000004', 'Gel Voluminizador Brunette', 'MK-GELVOLBR-104', '759002100104', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('876d597e-9ac4-4558-8d31-ce9e7cceab31', 'a0000000-0000-4000-8000-000000000004', 'Gel Voluminizador Dark Brunette', 'MK-GELVOLDA-105', '759002100105', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('0e013129-33c1-42cc-8fa1-778e48fbd5a6', 'a0000000-0000-4000-8000-000000000004', 'Gel Voluminizador Dark Blonde', 'MK-GELVOLDA-106', '759002100106', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('36899edf-84e1-47e5-87ca-802cb8e2e07f', 'a0000000-0000-4000-8000-000000000004', 'Corrector Yellow', 'MK-CORYEL-107', '759002100107', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('33d9b748-abe1-4133-884e-f6bced065f8f', 'a0000000-0000-4000-8000-000000000004', 'Corrector iluminador light peach', 'MK-CORILULI-108', '759002100108', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('8ef36e79-a8cd-4ce7-8ad6-62638ab47ea3', 'a0000000-0000-4000-8000-000000000004', 'Polvo Compacto Beige1', 'MK-POLCOMBE-109', '759002100109', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('41c3f552-bb00-4d26-8ab1-261a2e55470b', 'a0000000-0000-4000-8000-000000000004', 'Rubor Hint of Pink', 'MK-RUBHINOF-110', '759002100110', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('dae5dcf0-102f-4286-8fec-31ee7553245a', 'a0000000-0000-4000-8000-000000000004', 'Labial Matte I Love Lilac', 'MK-LABMATI-111', '759002100111', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('fbdae6e7-10fc-4466-8536-4fba4bab2732', 'a0000000-0000-4000-8000-000000000004', 'Labial Matte Chai Adore You', 'MK-LABMATCH-112', '759002100112', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('d23fdb51-1e61-4026-8822-4fa0991d5b53', 'a0000000-0000-4000-8000-000000000004', 'Labial Matte cafe', 'MK-LABMATCA-113', '759002100113', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ed0cf38e-03b1-4654-8dc7-2e86edd4f1d2', 'a0000000-0000-4000-8000-000000000004', 'Esponja para Maquillaje', 'MK-ESPPARMA-114', '759002100114', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3b56fffc-20f8-442f-8aa5-a6749f21bb95', 'a0000000-0000-4000-8000-000000000004', 'Labial Hidratante Toasted Plum', 'MK-LABHIDTO-115', '759002100115', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('2c55b56a-cd6b-4e1b-89b6-ada454131be7', 'a0000000-0000-4000-8000-000000000004', 'Labial en Gel Semi Shine Sunset Peach', 'MK-LABENGEL-116', '759002100116', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('bd77055c-4f8f-40b6-8707-ab29bdf104e1', 'a0000000-0000-4000-8000-000000000004', 'Labial en Gel Semi Shine Red Smolder', 'MK-LABENGEL-117', '759002100117', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('93b01c24-5652-4faf-8963-e3249f91c93c', 'a0000000-0000-4000-8000-000000000004', 'Labial en Gel Semi Shine Rose Wood', 'MK-LABENGEL-118', '759002100118', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ee2bca47-b346-4592-8ee7-59e3ed82482a', 'a0000000-0000-4000-8000-000000000004', 'Labial en Gel Semi Shine Raspberry Ice', 'MK-LABENGEL-119', '759002100119', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('f207745f-69ad-4fdb-834b-6df72db93f72', 'a0000000-0000-4000-8000-000000000004', 'Labial en Gel Semi Matte Midnight Red', 'MK-LABENGEL-120', '759002100120', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('a9a2b94a-db62-4cbf-8404-e8d0c6bc14c6', 'a0000000-0000-4000-8000-000000000004', 'Labial Hidratante Supreme Mauve Crush', 'MK-LABHIDSU-121', '759002100121', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('a2cbc5d3-10fb-4b87-8952-cf768366dfc2', 'a0000000-0000-4000-8000-000000000004', 'Brocha para el pliegue del párpado', 'MK-BROPAREL-122', '759002100122', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('15c452a1-e210-4e85-83ca-1a180ea0da38', 'a0000000-0000-4000-8000-000000000004', 'Brocha para polvos', 'MK-BROPARPO-123', '759002100123', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ef1c1e9b-17b1-45ca-8572-5ea2609c8835', 'a0000000-0000-4000-8000-000000000004', 'Brocha para maquillaje en crema', 'MK-BROPARMA-124', '759002100124', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('7235ede2-00a2-4ef0-8db9-4a86abbe3019', 'a0000000-0000-4000-8000-000000000004', 'Brocha para maquillaje liquido', 'MK-BROPARMA-125', '759002100125', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('abbe42a9-d006-4dae-8273-799345a24206', 'a0000000-0000-4000-8000-000000000004', 'Brocha para difuminar', 'MK-BROPARDI-126', '759002100126', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('cca995ad-999e-4aeb-8b26-ab7956584da6', 'a0000000-0000-4000-8000-000000000004', 'Brocha para rubor 3 en 1', 'MK-BROPARRU-127', '759002100127', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('3e380e56-e256-4c97-8358-38e7cf7a26c9', 'a0000000-0000-4000-8000-000000000004', 'Set de brochas', 'MK-SETDEBRO-128', '759002100128', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('638c841f-7530-45c7-83e3-81a9ea8949f7', 'a0000000-0000-4000-8000-000000000004', 'Base para sombras con color brownie', 'MK-BASPARSO-129', '759002100129', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('f3f2a8ac-5c4a-4e19-87bd-01e799542544', 'a0000000-0000-4000-8000-000000000004', 'Base para sombras con color sweetie', 'MK-BASPARSO-130', '759002100130', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('52db6bee-0834-4036-8ebf-11188c464cb8', 'a0000000-0000-4000-8000-000000000004', 'Balsamo para Labios Coral Blaze', 'MK-BALPARLA-131', '759002100131', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('92580479-e2ca-4a48-8b30-a0ec456459ed', 'a0000000-0000-4000-8000-000000000004', 'Balsamo para Labios Radiant Pink', 'MK-BALPARLA-132', '759002100132', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('f35ee726-75fa-4857-889f-d403841894db', 'a0000000-0000-4000-8000-000000000004', 'Rubor en Gel crema Soft Buff', 'MK-RUBENGEL-133', '759002100133', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('709487fd-cf80-4a2d-82eb-bc8874a2862f', 'a0000000-0000-4000-8000-000000000004', 'Rubor en Gel crema Pink Stars', 'MK-RUBENGEL-134', '759002100134', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('4cb90b38-bc61-4fe1-809f-9828f3ef0f66', 'a0000000-0000-4000-8000-000000000004', 'Rubor en Gel crema Coral Kiss', 'MK-RUBENGEL-135', '759002100135', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('36dc650d-aead-4d50-8695-90cdd23163a1', 'a0000000-0000-4000-8000-000000000004', 'Aceite para labios Berry', 'MK-ACEPARLA-136', '759002100136', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('f49c16dd-e9bd-4345-8948-e5a88947c206', 'a0000000-0000-4000-8000-000000000004', 'Aceite para labios Blush', 'MK-ACEPARLA-137', '759002100137', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('fe3d1f6b-2036-486e-8204-a4ec42ab30cc', 'a0000000-0000-4000-8000-000000000004', 'Sombra en barra pink Prism', 'MK-SOMENBAR-138', '759002100138', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ab25632b-cb98-4e82-856c-d5006ff12628', 'a0000000-0000-4000-8000-000000000004', 'Sombra en barra Golden', 'MK-SOMENBAR-139', '759002100139', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('aa962b06-8c2f-4f9f-81fe-6062d1ac62c5', 'a0000000-0000-4000-8000-000000000004', 'Sombra en barra Cooper', 'MK-SOMENBAR-140', '759002100140', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('4a146bf8-e2f1-41a6-8706-893faa310b0f', 'a0000000-0000-4000-8000-000000000004', 'Sombra en barra Radiant', 'MK-SOMENBAR-141', '759002100141', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Maquillaje - MAQ"}'::jsonb),
  ('ac599f06-9fd8-4977-878e-1e90472a3fe8', 'a0000000-0000-4000-8000-000000000004', 'Toallas faciales desechables', 'MK-TOAFACDE-142', '759002100142', 0, 0, 'f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', NULL, '{"tono":"Por definir","vencimiento":"2027-12-31","linea":"Herramientas"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000104', 'a0000000-0000-4000-8000-000000000004', 'Vestido Niña Flores', 'RN-VEST-FL', '7590020000004', 120, 65, 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000011', NULL, '{"talla":"5-6","color":"Rosa","genero":"Niña"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000105', 'a0000000-0000-4000-8000-000000000004', 'Pijama Niño Dinosaurio', 'RN-PIJ-DI', '7590020000005', 95, 48, 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000011', NULL, '{"talla":"3-4","color":"Verde","genero":"Niño"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000106', 'a0000000-0000-4000-8000-000000000004', 'Calcetines Bebé Pack', 'RN-CAL-BB', '7590020000006', 45, 22, 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000013', NULL, '{"talla":"0-3M","color":"Multicolor","genero":"Unisex"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000107', 'a0000000-0000-4000-8000-000000000004', 'Cartera Cuero Clásica', 'CT-CU-CL', '7590020000007', 180, 95, 'f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000011', NULL, '{"material":"Cuero sintético","color":"Negro","tamano":"Mediana"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000108', 'a0000000-0000-4000-8000-000000000004', 'Bolso Crossbody Rosa', 'CT-CR-RS', '7590020000008', 150, 78, 'f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000011', NULL, '{"material":"Tela","color":"Rosa","tamano":"Pequeña"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000109', 'a0000000-0000-4000-8000-000000000004', 'Cartera Elegante Dorada', 'CT-EL-DO', '7590020000009', 220, 115, 'f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000011', NULL, '{"material":"Metal y cuero","color":"Dorado","tamano":"Pequeña"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inventory (branch_id, product_id, stock) VALUES
  ('b0000000-0000-4000-8000-000000000010', '511d93bf-30db-4da2-8dc6-b7d985e3b6bc', 1),
  ('b0000000-0000-4000-8000-000000000010', 'dd670fde-7615-4886-86c4-90df740db90f', 1),
  ('b0000000-0000-4000-8000-000000000010', '1f2eac8f-fcbf-4587-8b10-eb61e012a096', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fa908f81-ab6f-4e42-8c52-04ca9d84ea0b', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c3950466-d14d-4c4c-8d9d-be39afc582a9', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fef994d9-dda5-4bb3-8885-9200a6d1e420', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a1aeb8b8-d2d8-4796-8d98-fa8af5469b54', 1),
  ('b0000000-0000-4000-8000-000000000010', '0775b3ff-1e7d-45a1-87a7-0b74c544dca2', 1),
  ('b0000000-0000-4000-8000-000000000010', '0a39fafa-c43f-48f1-8e92-e2665c225733', 1),
  ('b0000000-0000-4000-8000-000000000010', 'e87b21eb-2915-4e82-8205-786f5ae88893', 1),
  ('b0000000-0000-4000-8000-000000000010', '43b8a10b-d147-4bda-8acc-24bd426bb013', 1),
  ('b0000000-0000-4000-8000-000000000010', 'af3e86b8-ba77-4db4-889f-7ff600514b5a', 1),
  ('b0000000-0000-4000-8000-000000000010', '6d142013-0fa3-4835-8d4c-d9a737998bb1', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f3375587-b7fa-4c37-89f2-f32b88ceca1e', 1),
  ('b0000000-0000-4000-8000-000000000010', '277bb6ff-4308-47d2-8ba2-40f9249f72a3', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c8a6e44e-4d24-47e6-839d-bf034229d2c6', 1),
  ('b0000000-0000-4000-8000-000000000010', 'b3aca6d2-634e-45ca-8787-07c529ca9d90', 1),
  ('b0000000-0000-4000-8000-000000000010', '80956198-53ee-43d9-8b84-3a2ce5bc6506', 1),
  ('b0000000-0000-4000-8000-000000000010', '16cc0d08-9d44-4868-8521-5b2483806b12', 1),
  ('b0000000-0000-4000-8000-000000000010', 'b8f0f982-0591-4dc2-8976-cbe3e91ac2b0', 1),
  ('b0000000-0000-4000-8000-000000000010', 'd728ae10-d429-49f2-8c4a-ef66c57fddb9', 1),
  ('b0000000-0000-4000-8000-000000000010', 'd8280527-80fd-4432-8763-88dd8b114a81', 1),
  ('b0000000-0000-4000-8000-000000000010', '465fcae4-0749-480f-8686-a80fb35b6ab5', 1),
  ('b0000000-0000-4000-8000-000000000010', '86e1106a-9644-4510-8e38-9b47d42a7ecd', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fbbaffa2-cbb8-4665-8095-caa23260b8c0', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a5bd6ff8-fb76-4cb5-8f05-fb3aa362bd30', 1),
  ('b0000000-0000-4000-8000-000000000010', '7f205962-0ee2-4652-8ea6-44d51e211403', 1),
  ('b0000000-0000-4000-8000-000000000010', 'd0ebb3b3-762d-4049-84f7-5d1261b07cc7', 1),
  ('b0000000-0000-4000-8000-000000000010', 'facfaf68-4559-4ab3-8ab7-458f37344515', 1),
  ('b0000000-0000-4000-8000-000000000010', '508d9fa0-36b9-4316-8314-9e3be70071d8', 1),
  ('b0000000-0000-4000-8000-000000000010', '22c97930-2193-47cc-845c-4cdab86462d9', 1),
  ('b0000000-0000-4000-8000-000000000010', '2f8b42a8-feef-464a-8c91-dca04c1da405', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c015a670-e15e-4b4c-8e15-30c2187c5567', 1),
  ('b0000000-0000-4000-8000-000000000010', 'cdc308f3-d1ad-4626-840c-328a91aa0b8f', 1),
  ('b0000000-0000-4000-8000-000000000010', '506760fb-5566-4b7d-8398-06364b9570f0', 1),
  ('b0000000-0000-4000-8000-000000000010', 'b8a4345e-60fd-4303-81fa-52e1ea672a15', 1),
  ('b0000000-0000-4000-8000-000000000010', '7ad050ad-0c3c-4cc7-84cc-46104b12a95d', 1),
  ('b0000000-0000-4000-8000-000000000010', '04b6bff0-3479-42ed-81de-63890883d955', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ab694ecf-5ed0-43f2-8afc-a81b4b5a33dc', 1),
  ('b0000000-0000-4000-8000-000000000010', '1e677414-2075-4f40-89ff-743b32cc573c', 1),
  ('b0000000-0000-4000-8000-000000000010', '8799ef17-3de7-4b43-81ac-9869e467f03e', 1),
  ('b0000000-0000-4000-8000-000000000010', '0dec9574-d93a-46ad-8502-8400540bcf93', 1),
  ('b0000000-0000-4000-8000-000000000010', '9de6d8fb-03f0-4398-812a-91ebeca45c95', 1),
  ('b0000000-0000-4000-8000-000000000010', '3aadd328-790a-4776-85be-f6c6dbcfe0df', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c635e94b-8031-45f3-8dac-0f1d3e639627', 1),
  ('b0000000-0000-4000-8000-000000000010', 'e514eaf1-b253-4a63-841e-ee3f8cd24ce6', 1),
  ('b0000000-0000-4000-8000-000000000010', 'b985cce1-4ba7-4d7c-880b-c008c0435f4f', 1),
  ('b0000000-0000-4000-8000-000000000010', '4ecba004-25d5-4e85-800e-bed648f1d436', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f31838d9-8ff6-4fe2-8534-9ed522dffc8c', 1),
  ('b0000000-0000-4000-8000-000000000010', '3be7bdea-00cf-40a8-8657-7a88937205cf', 1),
  ('b0000000-0000-4000-8000-000000000010', '121af323-546a-4a51-8b07-ca6bd9f05518', 1),
  ('b0000000-0000-4000-8000-000000000010', '496d59c4-99dc-4b98-880f-2b32e0433c64', 1),
  ('b0000000-0000-4000-8000-000000000010', '8b3117c8-bc8d-4241-8476-0a56362996e5', 1),
  ('b0000000-0000-4000-8000-000000000010', '7bfb55ed-2bac-4b82-887a-b77d84942850', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c7b26925-08ca-42b9-8e94-cd146d896cd6', 1),
  ('b0000000-0000-4000-8000-000000000010', '72ee4e38-de24-4f44-8913-51ceae528daf', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ee035827-7624-4511-889a-a9ba302f6b33', 1),
  ('b0000000-0000-4000-8000-000000000010', '3684de87-6e7a-4210-8c88-3fdab8d5da52', 1),
  ('b0000000-0000-4000-8000-000000000010', '49350320-807b-4f07-81e6-c01c5bda637f', 1),
  ('b0000000-0000-4000-8000-000000000010', '7dc816f2-fb91-4b63-840a-bc131c11aa33', 1),
  ('b0000000-0000-4000-8000-000000000010', '18801769-cafb-442b-8a97-9826cba50128', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ebdb3ff2-d2e0-434e-87d0-ad3589a5fb4f', 1),
  ('b0000000-0000-4000-8000-000000000010', '510154e3-eb70-47df-81d3-afa0780cfe07', 1),
  ('b0000000-0000-4000-8000-000000000010', '24521a98-12e4-4d4a-837f-994b27b88cf9', 1),
  ('b0000000-0000-4000-8000-000000000010', '34a2f448-a0d3-4dbc-85d7-e088e598cd87', 1),
  ('b0000000-0000-4000-8000-000000000010', '947cdbe8-fad0-4e3e-871a-cb0a4c0770ce', 1),
  ('b0000000-0000-4000-8000-000000000010', '37bf042c-172e-4697-8d1e-a492a8fa5e92', 1),
  ('b0000000-0000-4000-8000-000000000010', '8d7793c8-16ee-4e51-8cdc-6fc77c17ed0b', 1),
  ('b0000000-0000-4000-8000-000000000010', '95e44302-ddfe-46c6-8d90-0b09359c1b97', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ba794b71-4efe-4f69-8bb6-9a2e20671f2f', 1),
  ('b0000000-0000-4000-8000-000000000010', '3d204a26-46c1-4c25-850f-91691063119a', 1),
  ('b0000000-0000-4000-8000-000000000010', '0b8204e7-d411-4ab9-8424-9667fc2f6c82', 1),
  ('b0000000-0000-4000-8000-000000000010', '31d88dad-8d12-472f-8fef-3092fc7a898f', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ad21cadd-69bd-42a6-8167-50c1e43cd5ec', 1),
  ('b0000000-0000-4000-8000-000000000010', '18d565bf-2540-49d9-8b20-356fbcc79b2b', 1),
  ('b0000000-0000-4000-8000-000000000010', '1975bce6-0d46-4250-86d3-75f01fc7bb06', 1),
  ('b0000000-0000-4000-8000-000000000010', 'dd4765c8-f0d0-4631-8f35-b50d77ec7e84', 1),
  ('b0000000-0000-4000-8000-000000000010', 'e365a5f2-17ac-45bb-84fc-ac4357e3fbdc', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ed05a464-b07b-4ae7-8c54-5f872b91183c', 1),
  ('b0000000-0000-4000-8000-000000000010', '62a48b7f-6f96-439a-8cca-5dab90e44ecd', 1),
  ('b0000000-0000-4000-8000-000000000010', '1a358827-3456-4ddf-8090-0a3cd9876fb7', 1),
  ('b0000000-0000-4000-8000-000000000010', '41fff4ee-6a99-4dc7-8d0a-efa33afda4cb', 1),
  ('b0000000-0000-4000-8000-000000000010', '3d1d3d17-7d4e-4ca0-8b50-a755910c77be', 1),
  ('b0000000-0000-4000-8000-000000000010', 'cad52aa3-f65d-48ee-8f4c-979230ecce98', 1),
  ('b0000000-0000-4000-8000-000000000010', '92f41b87-d02b-4a78-8557-cc00d4ce221a', 1),
  ('b0000000-0000-4000-8000-000000000010', 'd1495cd2-8430-4878-81ea-7b1f959045ef', 1),
  ('b0000000-0000-4000-8000-000000000010', '546416c1-9a57-4ca1-8155-862a8bd7ee82', 1),
  ('b0000000-0000-4000-8000-000000000010', '6b822cca-d309-4033-8f70-97e5679db3e0', 1),
  ('b0000000-0000-4000-8000-000000000010', '445571b0-c49c-4867-89bc-6baebd080f95', 1),
  ('b0000000-0000-4000-8000-000000000010', '5b5362e8-0f85-4759-8bb8-8abc8fa609c5', 1),
  ('b0000000-0000-4000-8000-000000000010', '0befd6aa-022a-497b-82bc-9007fabf54c8', 1),
  ('b0000000-0000-4000-8000-000000000010', '80a3928e-56e0-44b4-8c57-2e2018123031', 1),
  ('b0000000-0000-4000-8000-000000000010', '3c5d7036-e2bf-48a0-8376-2a790d8a6bef', 1),
  ('b0000000-0000-4000-8000-000000000010', '15910afa-5b02-44bc-823f-a103102a63d3', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a5f8c3a8-0118-4a33-8adc-872f39fc099c', 1),
  ('b0000000-0000-4000-8000-000000000010', '3c75793f-91b2-4589-8bc2-5e5e7e18cbb9', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ee743bae-767e-4e28-82e4-97308da10773', 1),
  ('b0000000-0000-4000-8000-000000000010', '26ad72a9-2df6-490b-8158-8ade64522771', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fa451c88-dca6-4615-8670-dadb8e80ec2d', 1),
  ('b0000000-0000-4000-8000-000000000010', 'e3daed13-6f1e-4bce-834f-e71e1edd40a6', 1),
  ('b0000000-0000-4000-8000-000000000010', '3a267d81-7a92-43a8-8f6f-64797a895834', 1),
  ('b0000000-0000-4000-8000-000000000010', 'dcb6c1e2-80e9-47f0-802a-6eeeee1518a0', 1),
  ('b0000000-0000-4000-8000-000000000010', '1e131e55-a966-43c9-80ac-14767f03c1c0', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a0f1e1dd-a6ae-4ddc-81c4-5c5a24540fed', 1),
  ('b0000000-0000-4000-8000-000000000010', '876d597e-9ac4-4558-8d31-ce9e7cceab31', 1),
  ('b0000000-0000-4000-8000-000000000010', '0e013129-33c1-42cc-8fa1-778e48fbd5a6', 1),
  ('b0000000-0000-4000-8000-000000000010', '36899edf-84e1-47e5-87ca-802cb8e2e07f', 1),
  ('b0000000-0000-4000-8000-000000000010', '33d9b748-abe1-4133-884e-f6bced065f8f', 1),
  ('b0000000-0000-4000-8000-000000000010', '8ef36e79-a8cd-4ce7-8ad6-62638ab47ea3', 1),
  ('b0000000-0000-4000-8000-000000000010', '41c3f552-bb00-4d26-8ab1-261a2e55470b', 1),
  ('b0000000-0000-4000-8000-000000000010', 'dae5dcf0-102f-4286-8fec-31ee7553245a', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fbdae6e7-10fc-4466-8536-4fba4bab2732', 1),
  ('b0000000-0000-4000-8000-000000000010', 'd23fdb51-1e61-4026-8822-4fa0991d5b53', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ed0cf38e-03b1-4654-8dc7-2e86edd4f1d2', 1),
  ('b0000000-0000-4000-8000-000000000010', '3b56fffc-20f8-442f-8aa5-a6749f21bb95', 1),
  ('b0000000-0000-4000-8000-000000000010', '2c55b56a-cd6b-4e1b-89b6-ada454131be7', 1),
  ('b0000000-0000-4000-8000-000000000010', 'bd77055c-4f8f-40b6-8707-ab29bdf104e1', 1),
  ('b0000000-0000-4000-8000-000000000010', '93b01c24-5652-4faf-8963-e3249f91c93c', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ee2bca47-b346-4592-8ee7-59e3ed82482a', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f207745f-69ad-4fdb-834b-6df72db93f72', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a9a2b94a-db62-4cbf-8404-e8d0c6bc14c6', 1),
  ('b0000000-0000-4000-8000-000000000010', 'a2cbc5d3-10fb-4b87-8952-cf768366dfc2', 1),
  ('b0000000-0000-4000-8000-000000000010', '15c452a1-e210-4e85-83ca-1a180ea0da38', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ef1c1e9b-17b1-45ca-8572-5ea2609c8835', 1),
  ('b0000000-0000-4000-8000-000000000010', '7235ede2-00a2-4ef0-8db9-4a86abbe3019', 1),
  ('b0000000-0000-4000-8000-000000000010', 'abbe42a9-d006-4dae-8273-799345a24206', 1),
  ('b0000000-0000-4000-8000-000000000010', 'cca995ad-999e-4aeb-8b26-ab7956584da6', 1),
  ('b0000000-0000-4000-8000-000000000010', '3e380e56-e256-4c97-8358-38e7cf7a26c9', 1),
  ('b0000000-0000-4000-8000-000000000010', '638c841f-7530-45c7-83e3-81a9ea8949f7', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f3f2a8ac-5c4a-4e19-87bd-01e799542544', 1),
  ('b0000000-0000-4000-8000-000000000010', '52db6bee-0834-4036-8ebf-11188c464cb8', 1),
  ('b0000000-0000-4000-8000-000000000010', '92580479-e2ca-4a48-8b30-a0ec456459ed', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f35ee726-75fa-4857-889f-d403841894db', 1),
  ('b0000000-0000-4000-8000-000000000010', '709487fd-cf80-4a2d-82eb-bc8874a2862f', 1),
  ('b0000000-0000-4000-8000-000000000010', '4cb90b38-bc61-4fe1-809f-9828f3ef0f66', 1),
  ('b0000000-0000-4000-8000-000000000010', '36dc650d-aead-4d50-8695-90cdd23163a1', 1),
  ('b0000000-0000-4000-8000-000000000010', 'f49c16dd-e9bd-4345-8948-e5a88947c206', 1),
  ('b0000000-0000-4000-8000-000000000010', 'fe3d1f6b-2036-486e-8204-a4ec42ab30cc', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ab25632b-cb98-4e82-856c-d5006ff12628', 1),
  ('b0000000-0000-4000-8000-000000000010', 'aa962b06-8c2f-4f9f-81fe-6062d1ac62c5', 1),
  ('b0000000-0000-4000-8000-000000000010', '4a146bf8-e2f1-41a6-8706-893faa310b0f', 1),
  ('b0000000-0000-4000-8000-000000000010', 'ac599f06-9fd8-4977-878e-1e90472a3fe8', 1),
  ('b0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000104', 6),
  ('b0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000105', 10),
  ('b0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000107', 5),
  ('b0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000106', 15),
  ('b0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000108', 8),
  ('b0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000109', 3)
ON CONFLICT (branch_id, product_id) DO UPDATE SET stock = EXCLUDED.stock;

-- Usuarios: crear en Auth Dashboard o con scripts/apply-supabase-setup.mjs
-- admin@sandy.demo / SandyAdmin123!
-- maria@sandy.demo / Sandy123!
-- laura@sandy.demo / Sandy123!

CREATE OR REPLACE FUNCTION public.link_sandy_user(
  p_user_id UUID,
  p_email TEXT,
  p_display_name TEXT,
  p_branch_id UUID,
  p_role_id UUID,
  p_role_slug public.user_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users_profiles (user_id, tenant_id, branch_id, role, role_id, display_name, active)
  VALUES (p_user_id, 'a0000000-0000-4000-8000-000000000004', p_branch_id, p_role_slug, p_role_id, p_display_name, true)
  ON CONFLICT (user_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    display_name = EXCLUDED.display_name,
    active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_sandy_user TO anon, authenticated, service_role;
-- =============================================================================
-- Usuarios Sandy — migración automática a Supabase Auth
-- Ejecutar DESPUÉS de setup-all.sql (o seed-sandy.sql)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- admin@posmariekay.com / SandyAdmin123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000020';
  v_email TEXT := 'admin@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('SandyAdmin123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sandy — Administradora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, email, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', v_email, NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    email = EXCLUDED.email,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'Sandy — Administradora',
    'b0000000-0000-4000-8000-000000000010',
    'e0000000-0000-4000-8000-000000000020', 'admin_org'
  );
END $$;

-- maria@posmariekay.com / Sandy123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000021';
  v_email TEXT := 'maria@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('Sandy123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"María González — Vendedora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, email, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', v_email, NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    email = EXCLUDED.email,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'María González — Vendedora',
    'b0000000-0000-4000-8000-000000000010',
    'e0000000-0000-4000-8000-000000000021', 'vendedor'
  );
END $$;

-- laura@posmariekay.com / Sandy123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000022';
  v_email TEXT := 'laura@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('Sandy123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Laura Méndez — Vendedora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, email, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', v_email, NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    email = EXCLUDED.email,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'Laura Méndez — Vendedora',
    'b0000000-0000-4000-8000-000000000011',
    'e0000000-0000-4000-8000-000000000021', 'vendedor'
  );
END $$;
