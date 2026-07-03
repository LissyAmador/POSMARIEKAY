/**
 * Lee inventario.xlsx y genera src/lib/demo/sandy-inventory-import.js
 * Ejecutar: node scripts/generate-sandy-inventory.js
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const SANDY_TENANT_ID = "a0000000-0000-4000-8000-000000000004";
const SANDY_BRANCH_MARIA_ID = "b0000000-0000-4000-8000-000000000010";
const MARY_KAY_CAT = "sd-cat-001";
const PRES_UNIT = "sd-pres-001";
const PRES_SET = "sd-pres-002";

function slugSku(name, index) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.slice(0, 3).toUpperCase())
    .join("")
    .slice(0, 8);
  return `MK-${base || "PRD"}-${String(index).padStart(3, "0")}`;
}

const xlsxPath = path.join(__dirname, "..", "inventario.xlsx");
const wb = XLSX.readFile(xlsxPath);
const rows = XLSX.utils
  .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" })
  .filter(
    (r) =>
      r.Producto &&
      r["CATEGORÍA"] &&
      r["CATEGORÍA"] !== "CATEGORÍA" &&
      r.Producto !== "Producto"
  );

const products = [];
const inventory = [];

rows.forEach((row, i) => {
  const index = i + 1;
  const id = `sd-excel-${String(index).padStart(3, "0")}`;
  const tipo = String(row.TIPO || "").trim().toUpperCase();
  const presentation_id = tipo === "KIT" ? PRES_SET : PRES_UNIT;

  products.push({
    id,
    tenant_id: SANDY_TENANT_ID,
    category_id: MARY_KAY_CAT,
    presentation_id,
    name: String(row.Producto).trim(),
    sku: slugSku(row.Producto, index),
    barcode: `7590021${String(index).padStart(5, "0")}`,
    price: 0,
    cost: 0,
    image_url: null,
    attributes: {
      tono: "Por definir",
      vencimiento: "2027-12-31",
      linea: String(row["CATEGORÍA"]).trim(),
    },
  });

  inventory.push({
    id: `sd-excel-inv-${String(index).padStart(3, "0")}`,
    branch_id: SANDY_BRANCH_MARIA_ID,
    product_id: id,
    stock: 1,
  });
});

const out = `/** Generado desde inventario.xlsx — ${products.length} productos Mary Kay */
export const SANDY_EXCEL_IMPORT_VERSION = 1;
export const SANDY_EXCEL_PRODUCT_COUNT = ${products.length};

export const SANDY_EXCEL_PRODUCTS = ${JSON.stringify(products, null, 2)};

export const SANDY_EXCEL_INVENTORY = ${JSON.stringify(inventory, null, 2)};

export function buildSandyExcelCatalog() {
  return {
    excelProducts: SANDY_EXCEL_PRODUCTS,
    excelInventory: SANDY_EXCEL_INVENTORY,
  };
}
`;

const outPath = path.join(__dirname, "..", "src", "lib", "demo", "sandy-inventory-import.js");
fs.writeFileSync(outPath, out, "utf8");
console.log(`Generados ${products.length} productos → ${outPath}`);
