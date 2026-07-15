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
