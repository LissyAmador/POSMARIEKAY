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
import { supabase } from "@/src/utils/supabase/client";

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

    return {
      data: { ...profile, tenants: tenant, branches: branch },
      error: null,
    };
  }

  return supabase
    .from("users_profiles")
    .select("*, tenants(*), branches(*)")
    .eq("user_id", userId)
    .single();
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

export async function getInventoryProducts(tenantId, branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const products = store.products
      .filter((p) => p.tenant_id === tenantId)
      .map((p) => {
        const inv = store.inventory.find(
          (i) => i.branch_id === branchId && i.product_id === p.id
        );
        return { ...p, stock: inv?.stock ?? 0, inventory: inv ? [inv] : [] };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { data: products, error: null };
  }

  return supabase
    .from("products")
    .select(`*, inventory!inner(stock, branch_id)`)
    .eq("tenant_id", tenantId)
    .eq("inventory.branch_id", branchId)
    .order("name");
}

export async function getPOSProducts(tenantId, branchId) {
  if (isDemoMode()) {
    const { data } = await getInventoryProducts(tenantId, branchId);
    return {
      data: (data || []).filter((p) => p.stock > 0),
      error: null,
    };
  }

  return supabase
    .from("products")
    .select(`*, inventory!inner(stock, branch_id)`)
    .eq("tenant_id", tenantId)
    .eq("inventory.branch_id", branchId)
    .gt("inventory.stock", 0)
    .order("name");
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
}) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );

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

    const saleId = uuid();
    const sale = {
      id: saleId,
      branch_id: branchId,
      user_id: userId,
      client_name: clientName || null,
      type: saleType,
      payment_method: paymentMethod || null,
      total,
      status: "activa",
      status_credit: saleType === "credito" ? "pendiente" : "pagado",
      due_date: saleType === "credito" ? dueDate : null,
      created_at: new Date().toISOString(),
    };

    const details = items.map((item) => ({
      id: uuid(),
      sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
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
      data: { sale_id: saleId, total, type: saleType, payment_method: paymentMethod },
      error: null,
    };
  }

  return supabase.rpc("process_sale", {
    p_client_name: clientName || null,
    p_sale_type: saleType,
    p_payment_method: paymentMethod,
    p_due_date: saleType === "credito" ? dueDate : null,
    p_items: items,
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

export { isDemoMode, DEMO_TENANT_ID, DEMO_BRANCH_ID };
