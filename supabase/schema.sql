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
