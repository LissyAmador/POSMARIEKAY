import { CARD_FEE_RATE } from "./category-attributes";

export function calcSaleProfit(sale, details = []) {
  const grossProfit = details.reduce((sum, d) => {
    const price = Number(d.price) || 0;
    const cost = Number(d.cost) || 0;
    const qty = Number(d.quantity) || 0;
    return sum + (price - cost) * qty;
  }, 0);

  const cardFee =
    sale.type === "contado" && sale.payment_method === "tarjeta"
      ? grossProfit * CARD_FEE_RATE
      : Number(sale.card_fee) || 0;

  const netProfit = grossProfit - cardFee;
  const revenue = Number(sale.subtotal ?? sale.total) || 0;
  const totalCost = details.reduce(
    (sum, d) => sum + (Number(d.cost) || 0) * (Number(d.quantity) || 0),
    0
  );

  return {
    revenue,
    totalCost,
    grossProfit,
    cardFee,
    netProfit,
    shippingCost: Number(sale.shipping_cost) || 0,
  };
}

export function groupProfitByDay(salesWithDetails) {
  const groups = {};
  for (const { sale, details } of salesWithDetails) {
    const day = sale.created_at?.split("T")[0] || "—";
    if (!groups[day]) {
      groups[day] = { key: day, label: day, count: 0, revenue: 0, cost: 0, grossProfit: 0, cardFee: 0, netProfit: 0 };
    }
    const p = calcSaleProfit(sale, details);
    groups[day].count += 1;
    groups[day].revenue += p.revenue;
    groups[day].cost += p.totalCost;
    groups[day].grossProfit += p.grossProfit;
    groups[day].cardFee += p.cardFee;
    groups[day].netProfit += p.netProfit;
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
}

export function groupProfitByMonth(salesWithDetails) {
  const groups = {};
  for (const { sale, details } of salesWithDetails) {
    const d = new Date(sale.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-GT", { year: "numeric", month: "long" });
    if (!groups[key]) {
      groups[key] = { key, label, count: 0, revenue: 0, cost: 0, grossProfit: 0, cardFee: 0, netProfit: 0 };
    }
    const p = calcSaleProfit(sale, details);
    groups[key].count += 1;
    groups[key].revenue += p.revenue;
    groups[key].cost += p.totalCost;
    groups[key].grossProfit += p.grossProfit;
    groups[key].cardFee += p.cardFee;
    groups[key].netProfit += p.netProfit;
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
}

export function groupProfitByProduct(salesWithDetails, products = []) {
  const groups = {};
  for (const { details } of salesWithDetails) {
    for (const d of details) {
      const product = products.find((p) => p.id === d.product_id) || d.products;
      const key = d.product_id;
      if (!groups[key]) {
        groups[key] = {
          key,
          label: product?.name || "Producto",
          quantity: 0,
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          netProfit: 0,
        };
      }
      const qty = Number(d.quantity) || 0;
      const price = Number(d.price) || 0;
      const cost = Number(d.cost) || 0;
      groups[key].quantity += qty;
      groups[key].revenue += price * qty;
      groups[key].cost += cost * qty;
      groups[key].grossProfit += (price - cost) * qty;
      groups[key].netProfit += (price - cost) * qty;
    }
  }
  return Object.values(groups).sort((a, b) => b.netProfit - a.netProfit);
}

export function groupProfitByClient(salesWithDetails) {
  const groups = {};
  for (const { sale, details } of salesWithDetails) {
    const key = (sale.client_name || "Cliente general").trim();
    if (!groups[key]) {
      groups[key] = { key, label: key, count: 0, revenue: 0, cost: 0, grossProfit: 0, cardFee: 0, netProfit: 0 };
    }
    const p = calcSaleProfit(sale, details);
    groups[key].count += 1;
    groups[key].revenue += p.revenue;
    groups[key].cost += p.totalCost;
    groups[key].grossProfit += p.grossProfit;
    groups[key].cardFee += p.cardFee;
    groups[key].netProfit += p.netProfit;
  }
  return Object.values(groups).sort((a, b) => b.netProfit - a.netProfit);
}

export function summarizeProfit(salesWithDetails) {
  let revenue = 0;
  let totalCost = 0;
  let grossProfit = 0;
  let cardFee = 0;
  let netProfit = 0;

  for (const { sale, details } of salesWithDetails) {
    const p = calcSaleProfit(sale, details);
    revenue += p.revenue;
    totalCost += p.totalCost;
    grossProfit += p.grossProfit;
    cardFee += p.cardFee;
    netProfit += p.netProfit;
  }

  return { count: salesWithDetails.length, revenue, totalCost, grossProfit, cardFee, netProfit };
}
