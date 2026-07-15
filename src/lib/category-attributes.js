/** Campos dinámicos por categoría de producto (atributos → products.attributes) */

export const CATEGORY_ATTRIBUTE_SCHEMAS = {
  "MARY KAY": [
    { key: "tono", label: "Tono", type: "text", required: true },
    {
      key: "vencimiento",
      label: "Fecha de vencimiento",
      type: "date",
      required: true,
      help: "Obligatoria. Al abrir caja se alerta si vence en 30 días o ya venció.",
    },
    { key: "linea", label: "Línea", type: "text" },
  ],
  "ROPA DE NIÑOS": [
    {
      key: "talla",
      label: "Talla",
      type: "select",
      options: ["RN", "0-3M", "3-6M", "6-12M", "1-2", "3-4", "5-6", "7-8", "10-12", "14-16"],
      required: true,
    },
    { key: "color", label: "Color", type: "text", required: true },
    {
      key: "genero",
      label: "Género",
      type: "select",
      options: ["Niño", "Niña", "Unisex"],
    },
  ],
  CARTERAS: [
    { key: "material", label: "Material", type: "text", required: true },
    { key: "color", label: "Color", type: "text", required: true },
    {
      key: "tamano",
      label: "Tamaño",
      type: "select",
      options: ["Pequeña", "Mediana", "Grande"],
      required: true,
    },
  ],
};

export const CARD_FEE_RATE = 0.05;

export function normalizeCategoryName(name) {
  return (name || "").trim().toUpperCase();
}

export function getCategoryAttributeSchema(categoryName) {
  return CATEGORY_ATTRIBUTE_SCHEMAS[normalizeCategoryName(categoryName)] || [];
}

export function getEmptyAttributes(categoryName) {
  const schema = getCategoryAttributeSchema(categoryName);
  return Object.fromEntries(schema.map((f) => [f.key, ""]));
}

export function validateCategoryAttributes(categoryName, attributes = {}) {
  const schema = getCategoryAttributeSchema(categoryName);
  const isMaryKay = normalizeCategoryName(categoryName) === "MARY KAY";

  const missing = schema
    .filter((f) => {
      if (f.key === "vencimiento" && isMaryKay) {
        return !String(attributes[f.key] ?? "").trim();
      }
      return f.required && !String(attributes[f.key] ?? "").trim();
    })
    .map((f) => f.label);

  if (missing.length) {
    return { valid: false, message: `Complete: ${missing.join(", ")}` };
  }
  return { valid: true };
}

export function formatAttributesSummary(categoryName, attributes = {}) {
  const schema = getCategoryAttributeSchema(categoryName);
  if (!schema.length) return "";
  return schema
    .map((f) => {
      const val = attributes[f.key];
      if (!val) return null;
      return `${f.label}: ${val}`;
    })
    .filter(Boolean)
    .join(" · ");
}

export function productMatchesSearch(product, search) {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  const base =
    `${product.name} ${product.sku || ""} ${product.barcode || ""} ${product.category_name || ""}`.toLowerCase();
  if (base.includes(q)) return true;
  const attrs = product.attributes || {};
  return Object.values(attrs).some((v) => String(v).toLowerCase().includes(q));
}
