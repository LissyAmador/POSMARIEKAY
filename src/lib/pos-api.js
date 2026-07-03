import { isDemoMode } from "./demo-mode";
import {
  demoGetSession,
  demoGetUser,
  demoSignIn,
  demoSignOut,
  demoOnAuthStateChange,
} from "./demo/auth";
import { getDemoStore, updateDemoStore, uuid } from "./demo/store";
import { DEMO_BRANCH_ID, DEMO_TENANT_ID } from "./demo/seed";
import { resolveRole } from "./admin-api";
import { supabase } from "@/src/utils/supabase/client";
import { CARD_FEE_RATE } from "./category-attributes";
import {
  groupProfitByDay,
  groupProfitByMonth,
  groupProfitByProduct,
  groupProfitByClient,
  summarizeProfit,
  calcSaleProfit,
} from "./profit-utils";

export const auth = {
  async getSession() {
    if (isDemoMode()) return demoGetSession();
    return supabase.auth.getSession();
  },
  async getUser() {
    if (isDemoMode()) return demoGetUser();
    return supabase.auth.getUser();
  },
  async signInWithPassword(credentials) {
    if (isDemoMode()) return demoSignIn(credentials);
    return supabase.auth.signInWithPassword(credentials);
  },
  async signOut() {
    if (isDemoMode()) return demoSignOut();
    return supabase.auth.signOut();
  },
  onAuthStateChange(callback) {
    if (isDemoMode()) return demoOnAuthStateChange(callback);
    return supabase.auth.onAuthStateChange(callback);
  },
};

export async function getUserProfile(userId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const profile = store.users_profiles.find((p) => p.user_id === userId);
    if (!profile) return { data: null, error: { message: "Perfil no encontrado" } };

    const tenant = store.tenants.find((t) => t.id === profile.tenant_id);
    const branch = store.branches.find((b) => b.id === profile.branch_id);
    const demoUser = (store.demo_users || []).find((u) => u.id === userId);
    const roleData = resolveRole(store, profile);

    return {
      data: {
        ...profile,
        name: demoUser?.name || profile.name,
        email: demoUser?.email,
        role: roleData.slug,
        role_name: roleData.name,
        permissions: roleData.permissions,
        tenants: tenant,
        branches: branch,
      },
      error: null,
    };
  }

  return supabase
    .from("users_profiles")
    .select("*, tenants(*), branches(*)")
    .eq("user_id", userId)
    .single();
}

export async function getTenantBranches(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const branches = store.branches
      .filter((b) => b.tenant_id === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { data: branches, error: null };
  }

  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");

  return { data: data || [], error };
}

export async function getDashboardStats(branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const salesToday = store.sales.filter(
      (s) =>
        s.branch_id === branchId &&
        s.status !== "anulada" &&
        new Date(s.created_at) >= today
    );
    const revenueToday = salesToday.reduce((sum, s) => sum + Number(s.total), 0);
    const pendingCredits = store.sales.filter(
      (s) =>
        s.branch_id === branchId &&
        s.status !== "anulada" &&
        s.type === "credito" &&
        s.status_credit === "pendiente"
    ).length;
    const openRegister = store.cash_registers.some(
      (r) => r.branch_id === branchId && r.status === "abierta"
    );

    return {
      products: store.inventory.filter((i) => i.branch_id === branchId).length,
      salesToday: salesToday.length,
      revenueToday,
      pendingCredits,
      openRegister,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [productsRes, salesRes, creditsRes, registerRes] = await Promise.all([
    supabase
      .from("inventory")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId),
    supabase
      .from("sales")
      .select("total")
      .eq("branch_id", branchId)
      .gte("created_at", today.toISOString()),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("type", "credito")
      .eq("status_credit", "pendiente"),
    supabase
      .from("cash_registers")
      .select("id")
      .eq("branch_id", branchId)
      .eq("status", "abierta")
      .maybeSingle(),
  ]);

  const revenue = (salesRes.data || []).reduce(
    (sum, s) => sum + Number(s.total),
    0
  );

  return {
    products: productsRes.count || 0,
    salesToday: salesRes.data?.length || 0,
    revenueToday: revenue,
    pendingCredits: creditsRes.count || 0,
    openRegister: !!registerRes.data,
  };
}

export async function getCashRegisterData(branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const open =
      store.cash_registers
        .filter((r) => r.branch_id === branchId && r.status === "abierta")
        .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at))[0] || null;

    const closed = store.cash_registers
      .filter((r) => r.branch_id === branchId && r.status === "cerrada")
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
      .slice(0, 10);

    return { open, closed };
  }

  const { data: open } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("branch_id", branchId)
    .eq("status", "abierta")
    .order("opened_at", { ascending: false })
    .maybeSingle();

  const { data: closed } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("branch_id", branchId)
    .eq("status", "cerrada")
    .order("closed_at", { ascending: false })
    .limit(10);

  return { open, closed: closed || [] };
}

export async function openCashRegister({ branchId, userId, initialBalance }) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const hasOpen = store.cash_registers.some(
      (r) => r.branch_id === branchId && r.status === "abierta"
    );
    if (hasOpen) {
      return { error: { message: "Ya hay una caja abierta en esta sucursal." } };
    }

    updateDemoStore((data) => ({
      ...data,
      cash_registers: [
        ...data.cash_registers,
        {
          id: uuid(),
          branch_id: branchId,
          user_id: userId,
          status: "abierta",
          initial_balance: initialBalance,
          current_balance: initialBalance,
          opened_at: new Date().toISOString(),
          closed_at: null,
        },
      ],
    }));

    return { error: null };
  }

  return supabase.from("cash_registers").insert({
    branch_id: branchId,
    user_id: userId,
    status: "abierta",
    initial_balance: initialBalance,
    current_balance: initialBalance,
    opened_at: new Date().toISOString(),
  });
}

export async function closeCashRegister(registerId) {
  if (isDemoMode()) {
    updateDemoStore((data) => ({
      ...data,
      cash_registers: data.cash_registers.map((r) =>
        r.id === registerId
          ? { ...r, status: "cerrada", closed_at: new Date().toISOString() }
          : r
      ),
    }));
    return { error: null };
  }

  return supabase
    .from("cash_registers")
    .update({ status: "cerrada", closed_at: new Date().toISOString() })
    .eq("id", registerId);
}

function enrichProduct(store, product, branchId) {
  const inv = store.inventory.find(
    (i) => i.branch_id === branchId && i.product_id === product.id
  );
  const category = (store.categories || []).find((c) => c.id === product.category_id);
  const presentation = (store.presentations || []).find(
    (p) => p.id === product.presentation_id
  );

  return {
    ...product,
    stock: inv?.stock ?? 0,
    inventory: inv ? [inv] : [],
    category,
    presentation,
    category_name: category?.name || "Sin categoría",
    presentation_name: presentation?.name || "—",
  };
}

export async function getCategories(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    return {
      data: (store.categories || []).filter((c) => c.tenant_id === tenantId),
      error: null,
    };
  }
  return supabase.from("categories").select("*").eq("tenant_id", tenantId).order("name");
}

export async function saveCategory({ editing, tenantId, name }) {
  if (!name?.trim()) return { error: { message: "Nombre requerido." } };

  if (isDemoMode()) {
    if (editing) {
      updateDemoStore((data) => ({
        ...data,
        categories: data.categories.map((c) =>
          c.id === editing.id ? { ...c, name: name.trim() } : c
        ),
      }));
    } else {
      updateDemoStore((data) => ({
        ...data,
        categories: [
          ...(data.categories || []),
          { id: uuid(), tenant_id: tenantId, name: name.trim() },
        ],
      }));
    }
    return { error: null };
  }

  if (editing) {
    return supabase.from("categories").update({ name: name.trim() }).eq("id", editing.id);
  }
  return supabase.from("categories").insert({ tenant_id: tenantId, name: name.trim() });
}

export async function deleteCategory(categoryId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const inUse = store.products.some((p) => p.category_id === categoryId);
    if (inUse) {
      return { error: { message: "No se puede eliminar: hay productos en esta categoría." } };
    }
    updateDemoStore((data) => ({
      ...data,
      categories: data.categories.filter((c) => c.id !== categoryId),
    }));
    return { error: null };
  }
  return supabase.from("categories").delete().eq("id", categoryId);
}

export async function getPresentations(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    return {
      data: (store.presentations || []).filter((p) => p.tenant_id === tenantId),
      error: null,
    };
  }
  return supabase.from("presentations").select("*").eq("tenant_id", tenantId).order("name");
}

export async function savePresentation({ editing, tenantId, name }) {
  if (!name?.trim()) return { error: { message: "Nombre requerido." } };

  if (isDemoMode()) {
    if (editing) {
      updateDemoStore((data) => ({
        ...data,
        presentations: data.presentations.map((p) =>
          p.id === editing.id ? { ...p, name: name.trim() } : p
        ),
      }));
    } else {
      updateDemoStore((data) => ({
        ...data,
        presentations: [
          ...(data.presentations || []),
          { id: uuid(), tenant_id: tenantId, name: name.trim() },
        ],
      }));
    }
    return { error: null };
  }

  if (editing) {
    return supabase.from("presentations").update({ name: name.trim() }).eq("id", editing.id);
  }
  return supabase.from("presentations").insert({ tenant_id: tenantId, name: name.trim() });
}

export async function deletePresentation(presentationId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const inUse = store.products.some((p) => p.presentation_id === presentationId);
    if (inUse) {
      return { error: { message: "No se puede eliminar: hay productos con esta presentación." } };
    }
    updateDemoStore((data) => ({
      ...data,
      presentations: data.presentations.filter((p) => p.id !== presentationId),
    }));
    return { error: null };
  }
  return supabase.from("presentations").delete().eq("id", presentationId);
}

export async function getInventoryProducts(tenantId, branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const products = store.products
      .filter((p) => p.tenant_id === tenantId)
      .map((p) => enrichProduct(store, p, branchId))
      .sort((a, b) => {
        const catA = a.category?.name || "";
        const catB = b.category?.name || "";
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.localeCompare(b.name);
      });

    return { data: products, error: null };
  }

  return supabase
    .from("products")
    .select(`*, inventory!inner(stock, branch_id)`)
    .eq("tenant_id", tenantId)
    .eq("inventory.branch_id", branchId)
    .order("name");
}

export async function getPOSProducts(tenantId, branchId, { includeOutOfStock = false } = {}) {
  if (isDemoMode()) {
    const { data } = await getInventoryProducts(tenantId, branchId);
    const filtered = includeOutOfStock
      ? data || []
      : (data || []).filter((p) => p.stock > 0);
    return { data: filtered, error: null };
  }

  let query = supabase
    .from("products")
    .select(`*, inventory!inner(stock, branch_id)`)
    .eq("tenant_id", tenantId)
    .eq("inventory.branch_id", branchId)
    .order("name");

  if (!includeOutOfStock) {
    query = query.gt("inventory.stock", 0);
  }

  return query;
}

export async function saveProduct({
  editing,
  tenantId,
  branchId,
  productData,
  stock,
}) {
  if (isDemoMode()) {
    if (editing) {
      updateDemoStore((data) => ({
        ...data,
        products: data.products.map((p) =>
          p.id === editing.id ? { ...p, ...productData } : p
        ),
        inventory: data.inventory.map((i) =>
          i.branch_id === branchId && i.product_id === editing.id
            ? { ...i, stock }
            : i
        ),
      }));
    } else {
      const newId = uuid();
      updateDemoStore((data) => ({
        ...data,
        products: [...data.products, { ...productData, id: newId, tenant_id: tenantId }],
        inventory: [
          ...data.inventory,
          { id: uuid(), branch_id: branchId, product_id: newId, stock },
        ],
      }));
    }
    return { error: null };
  }

  if (editing) {
    const { error } = await supabase
      .from("products")
      .update(productData)
      .eq("id", editing.id);
    if (error) return { error };

    const { error: invError } = await supabase
      .from("inventory")
      .update({ stock })
      .eq("branch_id", branchId)
      .eq("product_id", editing.id);

    return { error: invError };
  }

  const { data: newProduct, error } = await supabase
    .from("products")
    .insert({ ...productData, tenant_id: tenantId })
    .select()
    .single();

  if (error) return { error };

  const { error: invError } = await supabase.from("inventory").insert({
    branch_id: branchId,
    product_id: newProduct.id,
    stock,
  });

  return { error: invError };
}

export async function deleteProduct(productId) {
  if (isDemoMode()) {
    updateDemoStore((data) => ({
      ...data,
      products: data.products.filter((p) => p.id !== productId),
      inventory: data.inventory.filter((i) => i.product_id !== productId),
    }));
    return { error: null };
  }

  return supabase.from("products").delete().eq("id", productId);
}

export async function processSale({
  clientName,
  saleType,
  paymentMethod,
  dueDate,
  items,
  branchId,
  userId,
  requiresShipping = false,
  shippingCost = 0,
}) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );
    const shipping = requiresShipping ? Number(shippingCost) || 0 : 0;
    const total = subtotal + shipping;

    for (const item of items) {
      const inv = store.inventory.find(
        (i) => i.branch_id === branchId && i.product_id === item.product_id
      );
      if (!inv || inv.stock < item.quantity) {
        return { error: { message: "Stock insuficiente para uno o más productos." } };
      }
    }

    if (saleType === "contado") {
      const openRegister = store.cash_registers.find(
        (r) => r.branch_id === branchId && r.status === "abierta"
      );
      if (!openRegister) {
        return {
          error: {
            message: "No hay caja abierta. Abra la caja antes de vender al contado.",
          },
        };
      }
    }

    const detailsWithCost = items.map((item) => {
      const product = store.products.find((p) => p.id === item.product_id);
      return {
        ...item,
        cost: item.cost ?? product?.cost ?? 0,
      };
    });

    const grossProfit = detailsWithCost.reduce(
      (sum, item) => sum + (Number(item.price) - Number(item.cost)) * item.quantity,
      0
    );
    const cardFee =
      saleType === "contado" && paymentMethod === "tarjeta"
        ? grossProfit * CARD_FEE_RATE
        : 0;

    const saleId = uuid();
    const sale = {
      id: saleId,
      branch_id: branchId,
      user_id: userId,
      client_name: clientName || null,
      type: saleType,
      payment_method: paymentMethod || null,
      subtotal,
      shipping_cost: shipping,
      requires_shipping: requiresShipping,
      card_fee: cardFee,
      gross_profit: grossProfit,
      net_profit: grossProfit - cardFee,
      total,
      status: "activa",
      status_credit: saleType === "credito" ? "pendiente" : "pagado",
      due_date: saleType === "credito" ? dueDate : null,
      created_at: new Date().toISOString(),
    };

    const details = detailsWithCost.map((item) => ({
      id: uuid(),
      sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
      cost: item.cost,
    }));

    updateDemoStore((data) => {
      const inventory = data.inventory.map((i) => {
        const item = items.find(
          (it) => it.product_id === i.product_id && i.branch_id === branchId
        );
        if (!item) return i;
        return { ...i, stock: i.stock - item.quantity };
      });

      let cash_registers = data.cash_registers;
      if (saleType === "contado") {
        cash_registers = cash_registers.map((r) =>
          r.branch_id === branchId && r.status === "abierta"
            ? { ...r, current_balance: Number(r.current_balance) + total }
            : r
        );
      }

      return {
        ...data,
        inventory,
        cash_registers,
        sales: [...data.sales, sale],
        sales_details: [...data.sales_details, ...details],
      };
    });

    return {
      data: {
        sale_id: saleId,
        total,
        subtotal,
        shipping_cost: shipping,
        card_fee: cardFee,
        type: saleType,
        payment_method: paymentMethod,
      },
      error: null,
    };
  }

  return supabase.rpc("process_sale", {
    p_client_name: clientName || null,
    p_sale_type: saleType,
    p_payment_method: paymentMethod,
    p_due_date: saleType === "credito" ? dueDate : null,
    p_items: items,
    p_requires_shipping: requiresShipping,
    p_shipping_cost: shippingCost,
  });
}

export async function getSaleWithDetails(saleId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const sale = store.sales.find((s) => s.id === saleId);
    const details = store.sales_details
      .filter((d) => d.sale_id === saleId)
      .map((d) => ({
        ...d,
        products: store.products.find((p) => p.id === d.product_id),
      }));

    return { sale, details };
  }

  const { data: sale } = await supabase
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .single();

  const { data: details } = await supabase
    .from("sales_details")
    .select("*, products(name)")
    .eq("sale_id", saleId);

  return { sale, details: details || [] };
}

export async function getSaleById(saleId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const sale = store.sales.find((s) => s.id === saleId);

    if (!sale) {
      return { error: { message: "Recibo no encontrado." } };
    }

    const branch = store.branches.find((b) => b.id === sale.branch_id);
    const tenant = store.tenants.find((t) => t.id === branch?.tenant_id);
    const items = store.sales_details
      .filter((d) => d.sale_id === saleId)
      .map((d) => ({
        ...d,
        products: store.products.find((p) => p.id === d.product_id),
      }));

    return {
      sale,
      items,
      tenant,
      branch,
      paymentMethod: sale.payment_method,
      error: null,
    };
  }

  const { data: sale, error } = await supabase
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .single();

  if (error || !sale) {
    return { error: { message: "Recibo no encontrado." } };
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("*, tenants(*)")
    .eq("id", sale.branch_id)
    .single();

  const { data: details } = await supabase
    .from("sales_details")
    .select("*, products(name)")
    .eq("sale_id", saleId);

  return {
    sale,
    items: details || [],
    tenant: branch?.tenants,
    branch,
    paymentMethod: sale.payment_method,
    error: null,
  };
}

export async function getPendingCredits(branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const credits = store.sales
      .filter(
        (s) =>
          s.branch_id === branchId &&
          s.status !== "anulada" &&
          s.type === "credito" &&
          s.status_credit === "pendiente"
      )
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .map((sale) => {
        const paid = store.credit_payments
          .filter((p) => p.sale_id === sale.id)
          .reduce((sum, p) => sum + Number(p.amount_paid), 0);
        return {
          ...sale,
          paid,
          pending: Number(sale.total) - paid,
        };
      });

    return { data: credits, error: null };
  }

  const { data: sales, error } = await supabase
    .from("sales")
    .select("*")
    .eq("branch_id", branchId)
    .eq("type", "credito")
    .eq("status_credit", "pendiente")
    .order("due_date", { ascending: true });

  if (error) return { data: [], error };

  const enriched = await Promise.all(
    (sales || []).map(async (sale) => {
      const { data: payments } = await supabase
        .from("credit_payments")
        .select("amount_paid")
        .eq("sale_id", sale.id);

      const paid = (payments || []).reduce(
        (sum, p) => sum + Number(p.amount_paid),
        0
      );

      return { ...sale, paid, pending: Number(sale.total) - paid };
    })
  );

  return { data: enriched, error: null };
}

export async function registerCreditPayment(saleId, amount) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const sale = store.sales.find((s) => s.id === saleId);

    if (!sale || sale.type !== "credito" || sale.status_credit !== "pendiente") {
      return { error: { message: "La venta no es un crédito pendiente." } };
    }

    if (sale.status === "anulada") {
      return { error: { message: "No se puede abonar un recibo anulado." } };
    }

    const paid = store.credit_payments
      .filter((p) => p.sale_id === saleId)
      .reduce((sum, p) => sum + Number(p.amount_paid), 0);
    const pending = Number(sale.total) - paid;

    if (amount <= 0 || amount > pending) {
      return { error: { message: `Monto inválido. Saldo pendiente: ${pending}` } };
    }

    const openRegister = store.cash_registers.find(
      (r) => r.branch_id === sale.branch_id && r.status === "abierta"
    );
    if (!openRegister) {
      return { error: { message: "No hay caja abierta para registrar el abono." } };
    }

    const newPaid = paid + amount;
    const remaining = Math.max(Number(sale.total) - newPaid, 0);

    updateDemoStore((data) => ({
      ...data,
      credit_payments: [
        ...data.credit_payments,
        {
          id: uuid(),
          sale_id: saleId,
          amount_paid: amount,
          created_at: new Date().toISOString(),
        },
      ],
      sales: data.sales.map((s) =>
        s.id === saleId
          ? { ...s, status_credit: remaining <= 0 ? "pagado" : "pendiente" }
          : s
      ),
      cash_registers: data.cash_registers.map((r) =>
        r.id === openRegister.id
          ? { ...r, current_balance: Number(r.current_balance) + amount }
          : r
      ),
    }));

    return {
      data: {
        sale_id: saleId,
        amount_paid: amount,
        remaining,
        status_credit: remaining <= 0 ? "pagado" : "pendiente",
      },
      error: null,
    };
  }

  return supabase.rpc("register_credit_payment", {
    p_sale_id: saleId,
    p_amount: amount,
  });
}

export async function getIssuedReceipts(branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const receipts = store.sales
      .filter((s) => s.branch_id === branchId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((sale) => {
        const items = store.sales_details.filter((d) => d.sale_id === sale.id);
        return {
          ...sale,
          itemCount: items.length,
        };
      });

    return { data: receipts, error: null };
  }

  const { data, error } = await supabase
    .from("sales")
    .select("*, sales_details(count)")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };

  return {
    data: (data || []).map((sale) => ({
      ...sale,
      itemCount: sale.sales_details?.[0]?.count || 0,
    })),
    error: null,
  };
}

export async function voidSale(saleId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const sale = store.sales.find((s) => s.id === saleId);

    if (!sale) {
      return { error: { message: "Recibo no encontrado." } };
    }

    if (sale.status === "anulada") {
      return { error: { message: "Este recibo ya fue anulado." } };
    }

    const details = store.sales_details.filter((d) => d.sale_id === saleId);
    const payments = store.credit_payments.filter((p) => p.sale_id === saleId);
    const paymentsTotal = payments.reduce(
      (sum, p) => sum + Number(p.amount_paid),
      0
    );

    updateDemoStore((data) => {
      let inventory = data.inventory.map((item) => {
        const detail = details.find(
          (d) =>
            d.product_id === item.product_id &&
            item.branch_id === sale.branch_id
        );
        if (!detail) return item;
        return { ...item, stock: item.stock + detail.quantity };
      });

      let cash_registers = data.cash_registers;

      if (sale.type === "contado") {
        cash_registers = cash_registers.map((register) =>
          register.branch_id === sale.branch_id && register.status === "abierta"
            ? {
                ...register,
                current_balance:
                  Number(register.current_balance) - Number(sale.total),
              }
            : register
        );
      }

      if (paymentsTotal > 0) {
        cash_registers = cash_registers.map((register) =>
          register.branch_id === sale.branch_id && register.status === "abierta"
            ? {
                ...register,
                current_balance:
                  Number(register.current_balance) - paymentsTotal,
              }
            : register
        );
      }

      const sales = data.sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              status: "anulada",
              voided_at: new Date().toISOString(),
              status_credit:
                s.type === "credito" ? "pagado" : s.status_credit,
            }
          : s
      );

      return { ...data, inventory, cash_registers, sales };
    });

    return { error: null };
  }

  return {
    error: {
      message: "Anulación disponible en modo demo. Conecte Supabase para producción.",
    },
  };
}

export async function getSalesReport(
  branchId,
  { startDate, endDate, paymentMethod = "all" } = {}
) {
  if (isDemoMode()) {
    const store = getDemoStore();
    let sales = store.sales.filter(
      (s) => s.branch_id === branchId && s.status !== "anulada"
    );

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      sales = sales.filter((s) => new Date(s.created_at) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      sales = sales.filter((s) => new Date(s.created_at) <= end);
    }

    if (paymentMethod && paymentMethod !== "all") {
      if (paymentMethod === "credito") {
        sales = sales.filter((s) => s.type === "credito");
      } else {
        sales = sales.filter(
          (s) => s.type === "contado" && (s.payment_method || "efectivo") === paymentMethod
        );
      }
    }

    const byPayment = {};
    sales.forEach((sale) => {
      const key =
        sale.type === "credito" ? "credito" : sale.payment_method || "efectivo";
      if (!byPayment[key]) {
        byPayment[key] = { count: 0, total: 0 };
      }
      byPayment[key].count += 1;
      byPayment[key].total += Number(sale.total);
    });

    const sorted = [...sales].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return {
      data: {
        sales: sorted,
        summary: {
          count: sales.length,
          total: sales.reduce((sum, s) => sum + Number(s.total), 0),
          byPayment,
        },
      },
      error: null,
    };
  }

  let query = supabase
    .from("sales")
    .select("*")
    .eq("branch_id", branchId)
    .neq("status", "anulada")
    .order("created_at", { ascending: false });

  if (startDate) {
    query = query.gte("created_at", `${startDate}T00:00:00`);
  }
  if (endDate) {
    query = query.lte("created_at", `${endDate}T23:59:59`);
  }
  if (paymentMethod && paymentMethod !== "all") {
    if (paymentMethod === "credito") {
      query = query.eq("type", "credito");
    } else {
      query = query.eq("type", "contado").eq("payment_method", paymentMethod);
    }
  }

  const { data: sales, error } = await query;
  if (error) return { data: null, error };

  const byPayment = {};
  (sales || []).forEach((sale) => {
    const key =
      sale.type === "credito" ? "credito" : sale.payment_method || "efectivo";
    if (!byPayment[key]) {
      byPayment[key] = { count: 0, total: 0 };
    }
    byPayment[key].count += 1;
    byPayment[key].total += Number(sale.total);
  });

  return {
    data: {
      sales: sales || [],
      summary: {
        count: (sales || []).length,
        total: (sales || []).reduce((sum, s) => sum + Number(s.total), 0),
        byPayment,
      },
    },
    error: null,
  };
}

function filterSalesByDate(sales, startDate, endDate) {
  let filtered = [...sales];
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter((s) => new Date(s.created_at) >= start);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((s) => new Date(s.created_at) <= end);
  }
  return filtered;
}

function buildSalesWithDetails(store, sales) {
  return sales.map((sale) => ({
    sale,
    details: store.sales_details
      .filter((d) => d.sale_id === sale.id)
      .map((d) => ({
        ...d,
        products: store.products.find((p) => p.id === d.product_id),
      })),
  }));
}

export async function getProfitReport(
  branchId,
  { startDate, endDate, groupBy = "day" } = {}
) {
  if (isDemoMode()) {
    const store = getDemoStore();
    let sales = store.sales.filter(
      (s) => s.branch_id === branchId && s.status !== "anulada"
    );
    sales = filterSalesByDate(sales, startDate, endDate);
    const salesWithDetails = buildSalesWithDetails(store, sales);
    const summary = summarizeProfit(salesWithDetails);

    const groupFns = {
      day: groupProfitByDay,
      month: groupProfitByMonth,
      product: () => groupProfitByProduct(salesWithDetails, store.products),
      client: groupProfitByClient,
    };

    return {
      data: {
        summary,
        groups: (groupFns[groupBy] || groupProfitByDay)(salesWithDetails),
        groupBy,
      },
      error: null,
    };
  }

  return {
    data: null,
    error: { message: "Reporte de utilidad disponible en modo demo." },
  };
}

export async function getTenantSellers(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const profiles = (store.users_profiles || []).filter((p) => p.tenant_id === tenantId);
    const sellers = profiles.map((profile) => {
      const user = (store.demo_users || []).find((u) => u.id === profile.user_id);
      const branch = store.branches.find((b) => b.id === profile.branch_id);
      return {
        user_id: profile.user_id,
        branch_id: profile.branch_id,
        name: user?.name || profile.name || "Vendedora",
        branch_name: branch?.name || "—",
        email: user?.email,
      };
    });
    return { data: sellers, error: null };
  }

  return { data: [], error: null };
}

export async function getSellerExchanges(tenantId, branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const exchanges = (store.seller_exchanges || [])
      .filter(
        (e) =>
          e.tenant_id === tenantId &&
          (e.from_branch_id === branchId || e.to_branch_id === branchId)
      )
      .map((e) => {
        const product = store.products.find((p) => p.id === e.product_id);
        const fromUser = (store.demo_users || []).find((u) => u.id === e.from_user_id);
        const toUser = (store.demo_users || []).find((u) => u.id === e.to_user_id);
        const fromBranch = store.branches.find((b) => b.id === e.from_branch_id);
        const toBranch = store.branches.find((b) => b.id === e.to_branch_id);
        return {
          ...e,
          product_name: product?.name,
          from_user_name: fromUser?.name,
          to_user_name: toUser?.name,
          from_branch_name: fromBranch?.name,
          to_branch_name: toBranch?.name,
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return { data: exchanges, error: null };
  }

  return { data: [], error: null };
}

export async function processSellerExchange({
  tenantId,
  fromUserId,
  fromBranchId,
  toUserId,
  toBranchId,
  type,
  productId,
  quantity = 1,
  cashAmount = 0,
  notes = "",
}) {
  if (isDemoMode()) {
    if (fromUserId === toUserId) {
      return { error: { message: "Seleccione una vendedora distinta." } };
    }

    const store = getDemoStore();
    const product = store.products.find((p) => p.id === productId);
    let amount = 0;

    if (type === "producto") {
      if (!productId) {
        return { error: { message: "Seleccione un producto." } };
      }
      const qty = parseInt(quantity, 10) || 0;
      if (qty <= 0) {
        return { error: { message: "Cantidad inválida." } };
      }

      const fromInv = store.inventory.find(
        (i) => i.branch_id === fromBranchId && i.product_id === productId
      );
      if (!fromInv || fromInv.stock < qty) {
        return { error: { message: "Stock insuficiente en la vendedora origen." } };
      }

      amount = Number(product?.cost || 0) * qty;

      updateDemoStore((data) => {
        let inventory = data.inventory.map((i) => {
          if (i.branch_id === fromBranchId && i.product_id === productId) {
            return { ...i, stock: i.stock - qty };
          }
          return i;
        });

        const toInv = inventory.find(
          (i) => i.branch_id === toBranchId && i.product_id === productId
        );
        if (toInv) {
          inventory = inventory.map((i) =>
            i.id === toInv.id ? { ...i, stock: i.stock + qty } : i
          );
        } else {
          inventory = [
            ...inventory,
            {
              id: uuid(),
              branch_id: toBranchId,
              product_id: productId,
              stock: qty,
            },
          ];
        }

        const exchange = {
          id: uuid(),
          tenant_id: tenantId,
          from_user_id: fromUserId,
          from_branch_id: fromBranchId,
          to_user_id: toUserId,
          to_branch_id: toBranchId,
          type: "producto",
          product_id: productId,
          quantity: qty,
          amount,
          notes: notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        return {
          ...data,
          inventory,
          seller_exchanges: [...(data.seller_exchanges || []), exchange],
        };
      });
    } else if (type === "efectivo") {
      amount = parseFloat(cashAmount) || 0;
      if (amount <= 0) {
        return { error: { message: "Ingrese un monto válido." } };
      }

      updateDemoStore((data) => {
        const exchange = {
          id: uuid(),
          tenant_id: tenantId,
          from_user_id: fromUserId,
          from_branch_id: fromBranchId,
          to_user_id: toUserId,
          to_branch_id: toBranchId,
          type: "efectivo",
          product_id: null,
          quantity: null,
          amount,
          notes: notes.trim() || null,
          created_at: new Date().toISOString(),
        };

        return {
          ...data,
          seller_exchanges: [...(data.seller_exchanges || []), exchange],
        };
      });
    } else {
      return { error: { message: "Tipo de intercambio inválido." } };
    }

    return { data: { amount }, error: null };
  }

  return {
    error: { message: "Intercambios disponibles en modo demo." },
  };
}

export { isDemoMode, DEMO_TENANT_ID, DEMO_BRANCH_ID };
