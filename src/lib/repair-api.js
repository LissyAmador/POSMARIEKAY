import { isDemoMode } from "./demo-mode";
import { getDemoStore, updateDemoStore, uuid } from "./demo/store";
import { getSaleWithDetails } from "./pos-api";
import { supabase } from "@/src/utils/supabase/client";
import { enrichSupabaseProduct } from "./supabase-helpers";
import {
  calculateRepairTotal,
  generateTicketPassword,
  getRepairTicketNumber,
} from "./repair-utils";
import {
  filterPartsForDevice,
  getMergedBrandCatalog,
  getBrandListFromCatalog,
  getModelsFromCatalog,
} from "./device-catalog";

const SERVICE_CATEGORY_NAMES = new Set([
  "Servicios de Reparación",
  "servicios de reparación",
]);

const PARTS_CATEGORY_NAMES = new Set([
  "Repuestos Android",
  "Repuestos iOS",
  "repuestos android",
  "repuestos ios",
]);

const PHONE_CATEGORY_NAMES = new Set([
  "Teléfonos Android",
  "Teléfonos iOS",
  "teléfonos android",
  "teléfonos ios",
]);

function enrichProduct(store, product, branchId) {
  const inv = store.inventory.find(
    (i) => i.branch_id === branchId && i.product_id === product.id
  );
  const category = (store.categories || []).find((c) => c.id === product.category_id);
  return {
    ...product,
    stock: inv?.stock ?? 0,
    category,
    category_name: category?.name || "Sin categoría",
  };
}

export async function getTechnicians(tenantId, branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const techs = (store.technicians || []).filter(
      (t) => t.tenant_id === tenantId && t.branch_id === branchId && t.active !== false
    );
    return { data: techs, error: null };
  }

  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("active", true)
    .order("name");

  return { data: data || [], error };
}

export async function getRepairCatalog(tenantId, branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const products = store.products
      .filter((p) => p.tenant_id === tenantId)
      .map((p) => enrichProduct(store, p, branchId));

    const services = products.filter((p) =>
      SERVICE_CATEGORY_NAMES.has(p.category_name)
    );
    const parts = products.filter((p) =>
      PARTS_CATEGORY_NAMES.has(p.category_name)
    );
    const phones = products.filter((p) => PHONE_CATEGORY_NAMES.has(p.category_name));
    const brandCatalog = getMergedBrandCatalog(phones);

    return {
      data: {
        services,
        parts,
        phones,
        brandCatalog,
        brands: getBrandListFromCatalog(brandCatalog),
      },
      error: null,
    };
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("*, categories(name), inventory!inner(stock, branch_id)")
    .eq("tenant_id", tenantId)
    .eq("inventory.branch_id", branchId);

  if (error) {
    return {
      data: { services: [], parts: [], phones: [], brandCatalog: {}, brands: [] },
      error,
    };
  }

  const enriched = (products || []).map((p) => enrichSupabaseProduct(p));
  const services = enriched.filter((p) => SERVICE_CATEGORY_NAMES.has(p.category_name));
  const parts = enriched.filter((p) => PARTS_CATEGORY_NAMES.has(p.category_name));
  const phones = enriched.filter((p) => PHONE_CATEGORY_NAMES.has(p.category_name));
  const brandCatalog = getMergedBrandCatalog(phones);

  return {
    data: {
      services,
      parts,
      phones,
      brandCatalog,
      brands: getBrandListFromCatalog(brandCatalog),
    },
    error: null,
  };
}

export function getPartsForBrandModel(parts, brand, model) {
  return filterPartsForDevice(parts, brand, model).filter((p) => p.stock > 0);
}

export function getModelsForBrand(catalog, brand) {
  return getModelsFromCatalog(catalog, brand);
}

export async function getRepairOrders(branchId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const orders = (store.repair_orders || [])
      .filter((o) => o.branch_id === branchId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((order) => enrichOrder(order, branchId));
    return { data: orders, error: null };
  }

  const { data, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  return {
    data: (data || []).map((order) => enrichOrder(order, branchId)),
    error,
  };
}

function enrichOrder(order, branchId) {
  return {
    ...order,
    ticket_number: order.ticket_number || getRepairTicketNumber(order.id, branchId),
    parts_deducted: order.parts_deducted ?? false,
  };
}

export async function findRepairOrder(branchId, query) {
  if (!query?.trim()) {
    return { data: null, error: { message: "Ingrese número de ticket o contraseña." } };
  }

  if (isDemoMode()) {
    const store = getDemoStore();
    const q = query.trim().toUpperCase();
    const order = (store.repair_orders || []).find((o) => {
      if (o.branch_id !== branchId) return false;
      const ticket = (o.ticket_number || getRepairTicketNumber(o.id, branchId)).toUpperCase();
      return ticket === q || ticket.includes(q) || o.ticket_password === query.trim();
    });

    if (!order) {
      return { data: null, error: { message: "Ticket no encontrado en esta sucursal." } };
    }

    return { data: enrichOrder(order, branchId), error: null };
  }

  const q = query.trim().toUpperCase();
  const { data, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("branch_id", branchId)
    .or(`ticket_number.ilike.%${q}%,ticket_password.eq.${query.trim()}`)
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) {
    return { data: null, error: { message: "Ticket no encontrado en esta sucursal." } };
  }

  return { data: enrichOrder(data, branchId), error: null };
}

export async function createRepairOrder({
  tenantId,
  branchId,
  userId,
  ticketNumber,
  clientName,
  clientPhone,
  deviceBrand,
  deviceModel,
  deviceCondition,
  conditionNotes,
  repairServiceId,
  repairServiceName,
  laborCost,
  parts,
  technicianId,
  technicianName,
  estimatedCompletion,
  notes,
}) {
  if (!clientName?.trim()) {
    return { error: { message: "Nombre del cliente requerido." } };
  }
  if (!clientPhone?.trim()) {
    return { error: { message: "Teléfono del cliente requerido." } };
  }
  if (!deviceBrand?.trim() || !deviceModel?.trim()) {
    return { error: { message: "Marca y modelo del equipo requeridos." } };
  }
  if (!deviceCondition) {
    return { error: { message: "Seleccione el estado del teléfono." } };
  }
  if (!repairServiceId) {
    return { error: { message: "Seleccione el tipo de reparación." } };
  }
  if (!technicianId) {
    return { error: { message: "Asigne un técnico." } };
  }
  if (!estimatedCompletion) {
    return { error: { message: "Indique la fecha estimada de entrega." } };
  }

  if (isDemoMode()) {
    const store = getDemoStore();
    const orderId = uuid();
    const finalTicketNumber =
      ticketNumber?.trim() || getRepairTicketNumber(orderId, branchId);

    const duplicate = (store.repair_orders || []).some(
      (o) =>
        o.branch_id === branchId &&
        (o.ticket_number || "").toUpperCase() === finalTicketNumber.toUpperCase()
    );
    if (duplicate) {
      return { error: { message: "El número de ticket ya existe en esta sucursal." } };
    }

    for (const part of parts || []) {
      const inv = store.inventory.find(
        (i) => i.branch_id === branchId && i.product_id === part.product_id
      );
      if (!inv || inv.stock < part.quantity) {
        return {
          error: {
            message: `Stock insuficiente para ${part.product_name || "repuesto"}.`,
          },
        };
      }
    }

    const ticketPassword = generateTicketPassword();
    const totalCost = calculateRepairTotal(laborCost, parts);

    const order = {
      id: orderId,
      tenant_id: tenantId,
      branch_id: branchId,
      user_id: userId,
      ticket_number: finalTicketNumber,
      ticket_password: ticketPassword,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      device_brand: deviceBrand.trim(),
      device_model: deviceModel.trim(),
      device_condition: deviceCondition,
      condition_notes: conditionNotes?.trim() || "",
      repair_service_id: repairServiceId,
      repair_service_name: repairServiceName,
      labor_cost: Number(laborCost) || 0,
      parts: parts || [],
      technician_id: technicianId,
      technician_name: technicianName,
      estimated_completion: estimatedCompletion,
      notes: notes?.trim() || "",
      total_cost: totalCost,
      status: "recibido",
      parts_deducted: false,
      sale_id: null,
      created_at: new Date().toISOString(),
    };

    updateDemoStore((data) => ({
      ...data,
      repair_orders: [...(data.repair_orders || []), order],
    }));

    return { data: order, error: null };
  }

  const orderId = uuid();
  const finalTicketNumber = ticketNumber?.trim() || getRepairTicketNumber(orderId, branchId);
  const ticketPassword = generateTicketPassword();
  const totalCost = calculateRepairTotal(laborCost, parts);

  const { data: existing } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("branch_id", branchId)
    .ilike("ticket_number", finalTicketNumber)
    .maybeSingle();

  if (existing) {
    return { error: { message: "El número de ticket ya existe en esta sucursal." } };
  }

  const { data, error } = await supabase
    .from("repair_orders")
    .insert({
      id: orderId,
      tenant_id: tenantId,
      branch_id: branchId,
      user_id: userId,
      ticket_number: finalTicketNumber,
      ticket_password: ticketPassword,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      device_brand: deviceBrand.trim(),
      device_model: deviceModel.trim(),
      device_condition: deviceCondition,
      condition_notes: conditionNotes?.trim() || "",
      repair_service_id: repairServiceId,
      repair_service_name: repairServiceName,
      labor_cost: Number(laborCost) || 0,
      parts: parts || [],
      technician_id: technicianId,
      technician_name: technicianName,
      estimated_completion: estimatedCompletion,
      notes: notes?.trim() || "",
      total_cost: totalCost,
      status: "recibido",
      parts_deducted: false,
    })
    .select()
    .single();

  return { data, error };
}

export async function deliverRepairOrder({
  orderId,
  userId,
  paymentMethod = "efectivo",
}) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const order = (store.repair_orders || []).find((o) => o.id === orderId);

    if (!order) return { error: { message: "Orden no encontrada." } };
    if (order.status === "entregado") {
      return { error: { message: "Esta orden ya fue entregada." } };
    }
    if (order.sale_id) {
      const receipt = await getSaleWithDetails(order.sale_id);
      return { data: { order, sale: receipt.sale, items: receipt.details }, error: null };
    }

    const openRegister = store.cash_registers.find(
      (r) => r.branch_id === order.branch_id && r.status === "abierta"
    );
    if (!openRegister) {
      return {
        error: {
          message: "No hay caja abierta. Abra la caja antes de entregar y cobrar.",
        },
      };
    }

    const items = [
      {
        product_id: order.repair_service_id,
        quantity: 1,
        price: order.labor_cost,
      },
      ...(order.parts || []).map((part) => ({
        product_id: part.product_id,
        quantity: part.quantity,
        price: part.price,
      })),
    ];

    const itemsToDeduct = order.parts_deducted
      ? items.filter((i) => i.product_id === order.repair_service_id)
      : items;

    for (const item of itemsToDeduct) {
      const inv = store.inventory.find(
        (i) => i.branch_id === order.branch_id && i.product_id === item.product_id
      );
      if (!inv || inv.stock < item.quantity) {
        return { error: { message: "Stock insuficiente para completar la entrega." } };
      }
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );

    const saleId = uuid();
    const sale = {
      id: saleId,
      branch_id: order.branch_id,
      user_id: userId,
      client_name: order.client_name,
      type: "contado",
      payment_method: paymentMethod,
      total,
      status: "activa",
      status_credit: "pagado",
      due_date: null,
      repair_order_id: orderId,
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
        const item = itemsToDeduct.find(
          (it) => it.product_id === i.product_id && i.branch_id === order.branch_id
        );
        if (!item) return i;
        return { ...i, stock: i.stock - item.quantity };
      });

      const cash_registers = data.cash_registers.map((r) =>
        r.branch_id === order.branch_id && r.status === "abierta"
          ? { ...r, current_balance: Number(r.current_balance) + total }
          : r
      );

      const repair_orders = (data.repair_orders || []).map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "entregado",
              parts_deducted: true,
              sale_id: saleId,
              delivered_at: new Date().toISOString(),
              payment_method: paymentMethod,
            }
          : o
      );

      return {
        ...data,
        inventory,
        cash_registers,
        sales: [...data.sales, sale],
        sales_details: [...data.sales_details, ...details],
        repair_orders,
      };
    });

    const receipt = await getSaleWithDetails(saleId);
    const updatedOrder = getDemoStore().repair_orders.find((o) => o.id === orderId);

    return {
      data: {
        order: enrichOrder(updatedOrder, order.branch_id),
        sale: receipt.sale,
        items: receipt.details,
      },
      error: null,
    };
  }

  const { data, error } = await supabase.rpc("deliver_repair_order", {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
  });

  if (error) return { error };

  const saleId = data?.sale_id;
  if (!saleId) return { error: { message: "No se generó el recibo de entrega." } };

  const receipt = await getSaleWithDetails(saleId);
  const { data: order } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  return {
    data: {
      order: enrichOrder(order, order?.branch_id),
      sale: receipt.sale,
      items: receipt.details,
    },
    error: null,
  };
}

export async function updateRepairOrderStatus(orderId, status) {
  if (status === "entregado") {
    return {
      error: {
        message: "Use el flujo de entrega para generar recibo y descontar inventario.",
      },
    };
  }

  if (isDemoMode()) {
    updateDemoStore((data) => ({
      ...data,
      repair_orders: (data.repair_orders || []).map((order) =>
        order.id === orderId
          ? { ...order, status, updated_at: new Date().toISOString() }
          : order
      ),
    }));
    return { error: null };
  }

  return supabase
    .from("repair_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

export async function getRepairOrderById(orderId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const order = (store.repair_orders || []).find((o) => o.id === orderId);
    if (!order) return { data: null, error: { message: "Orden no encontrada." } };
    return {
      data: enrichOrder(order, order.branch_id),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    return { data: null, error: error || { message: "Orden no encontrada." } };
  }

  return { data: enrichOrder(data, data.branch_id), error: null };
}

export async function getRepairReceipt(orderId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const order = (store.repair_orders || []).find((o) => o.id === orderId);
    if (!order?.sale_id) {
      return { data: null, error: { message: "Esta orden aún no tiene recibo." } };
    }
    const receipt = await getSaleWithDetails(order.sale_id);
    return {
      data: { order, sale: receipt.sale, items: receipt.details },
      error: null,
    };
  }

  const { data: order, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.sale_id) {
    return {
      data: null,
      error: error || { message: "Esta orden aún no tiene recibo." },
    };
  }

  const receipt = await getSaleWithDetails(order.sale_id);
  return {
    data: {
      order: enrichOrder(order, order.branch_id),
      sale: receipt.sale,
      items: receipt.details,
    },
    error: null,
  };
}
