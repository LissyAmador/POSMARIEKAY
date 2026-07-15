/**
 * Genera supabase/seed-sandy.sql desde los datos demo de Sandy (Mary Kay).
 * Uso: node scripts/generate-sandy-seed-sql.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  SANDY_EXCEL_PRODUCTS,
  SANDY_EXCEL_INVENTORY,
} = require("../src/lib/demo/sandy-inventory-import");

const SANDY_TENANT_ID = "a0000000-0000-4000-8000-000000000004";
const SANDY_BRANCH_MARIA_ID = "b0000000-0000-4000-8000-000000000010";
const SANDY_BRANCH_LAURA_ID = "b0000000-0000-4000-8000-000000000011";
const ROLE_SANDY_ADMIN = "e0000000-0000-4000-8000-000000000020";
const ROLE_SANDY_VENDEDOR = "e0000000-0000-4000-8000-000000000021";
const CAT_MARY_KAY = "f0000000-0000-4000-8000-000000000001";
const CAT_ROPA = "f0000000-0000-4000-8000-000000000002";
const CAT_CARTERAS = "f0000000-0000-4000-8000-000000000003";
const PRES_UNIDAD = "f0000000-0000-4000-8000-000000000011";
const PRES_SET = "f0000000-0000-4000-8000-000000000012";
const PRES_PAR = "f0000000-0000-4000-8000-000000000013";

const idMap = new Map([
  ["sd-cat-001", CAT_MARY_KAY],
  ["sd-cat-002", CAT_ROPA],
  ["sd-cat-003", CAT_CARTERAS],
  ["sd-pres-001", PRES_UNIDAD],
  ["sd-pres-002", PRES_SET],
  ["sd-pres-003", PRES_PAR],
  ["sd-prod-004", "c0000000-0000-4000-8000-000000000104"],
  ["sd-prod-005", "c0000000-0000-4000-8000-000000000105"],
  ["sd-prod-006", "c0000000-0000-4000-8000-000000000106"],
  ["sd-prod-007", "c0000000-0000-4000-8000-000000000107"],
  ["sd-prod-008", "c0000000-0000-4000-8000-000000000108"],
  ["sd-prod-009", "c0000000-0000-4000-8000-000000000109"],
]);

function toUuid(seed) {
  if (idMap.has(seed)) return idMap.get(seed);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seed)) {
    return seed;
  }
  const hash = crypto.createHash("md5").update(`sandy:${seed}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

const extraProducts = [
  {
    id: "sd-prod-004",
    category_id: "sd-cat-002",
    presentation_id: "sd-pres-001",
    name: "Vestido Niña Flores",
    sku: "RN-VEST-FL",
    barcode: "7590020000004",
    price: 120,
    cost: 65,
    attributes: { talla: "5-6", color: "Rosa", genero: "Niña" },
  },
  {
    id: "sd-prod-005",
    category_id: "sd-cat-002",
    presentation_id: "sd-pres-001",
    name: "Pijama Niño Dinosaurio",
    sku: "RN-PIJ-DI",
    barcode: "7590020000005",
    price: 95,
    cost: 48,
    attributes: { talla: "3-4", color: "Verde", genero: "Niño" },
  },
  {
    id: "sd-prod-006",
    category_id: "sd-cat-002",
    presentation_id: "sd-pres-003",
    name: "Calcetines Bebé Pack",
    sku: "RN-CAL-BB",
    barcode: "7590020000006",
    price: 45,
    cost: 22,
    attributes: { talla: "0-3M", color: "Multicolor", genero: "Unisex" },
  },
  {
    id: "sd-prod-007",
    category_id: "sd-cat-003",
    presentation_id: "sd-pres-001",
    name: "Cartera Cuero Clásica",
    sku: "CT-CU-CL",
    barcode: "7590020000007",
    price: 180,
    cost: 95,
    attributes: { material: "Cuero sintético", color: "Negro", tamano: "Mediana" },
  },
  {
    id: "sd-prod-008",
    category_id: "sd-cat-003",
    presentation_id: "sd-pres-001",
    name: "Bolso Crossbody Rosa",
    sku: "CT-CR-RS",
    barcode: "7590020000008",
    price: 150,
    cost: 78,
    attributes: { material: "Tela", color: "Rosa", tamano: "Pequeña" },
  },
  {
    id: "sd-prod-009",
    category_id: "sd-cat-003",
    presentation_id: "sd-pres-001",
    name: "Cartera Elegante Dorada",
    sku: "CT-EL-DO",
    barcode: "7590020000009",
    price: 220,
    cost: 115,
    attributes: { material: "Metal y cuero", color: "Dorado", tamano: "Pequeña" },
  },
];

const extraInventory = [
  { branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-004", stock: 6 },
  { branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-005", stock: 10 },
  { branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-007", stock: 5 },
  { branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-006", stock: 15 },
  { branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-008", stock: 8 },
  { branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-009", stock: 3 },
];

const ADMIN_PERMS = [
  "admin.access",
  "admin.roles",
  "admin.usuarios",
  "pos.vender",
  "inventario.gestionar",
  "caja.gestionar",
  "creditos.gestionar",
  "recibos.gestionar",
  "reportes.ver",
  "intercambios.gestionar",
];

const VENDEDOR_PERMS = [
  "pos.vender",
  "inventario.gestionar",
  "caja.gestionar",
  "creditos.gestionar",
  "recibos.gestionar",
  "reportes.ver",
  "intercambios.gestionar",
];

const lines = [];
lines.push("-- =============================================================================");
lines.push("-- Sandy / Mary Kay — datos iniciales");
lines.push("-- Ejecutar DESPUÉS de setup-complete.sql");
lines.push("-- =============================================================================");
lines.push("");

lines.push(`INSERT INTO public.tenants (id, name) VALUES ('${SANDY_TENANT_ID}', 'Sandy') ON CONFLICT (id) DO NOTHING;`);
lines.push(`INSERT INTO public.branches (id, tenant_id, name, address) VALUES`);
lines.push(`  ('${SANDY_BRANCH_MARIA_ID}', '${SANDY_TENANT_ID}', 'Sandy — María', 'Zona 10, Guatemala'),`);
lines.push(`  ('${SANDY_BRANCH_LAURA_ID}', '${SANDY_TENANT_ID}', 'Sandy — Laura', 'Mixco, Guatemala')`);
lines.push("ON CONFLICT (id) DO NOTHING;");
lines.push("");

lines.push(`INSERT INTO public.roles (id, tenant_id, name, slug, permissions, is_system) VALUES`);
lines.push(`  ('${ROLE_SANDY_ADMIN}', '${SANDY_TENANT_ID}', 'Admin Sandy', 'admin_org', ${sqlJson(ADMIN_PERMS)}, true),`);
lines.push(`  ('${ROLE_SANDY_VENDEDOR}', '${SANDY_TENANT_ID}', 'Vendedora Sandy', 'vendedor', ${sqlJson(VENDEDOR_PERMS)}, true)`);
lines.push("ON CONFLICT (id) DO NOTHING;");
lines.push("");

lines.push(`INSERT INTO public.categories (id, tenant_id, name) VALUES`);
lines.push(`  ('${CAT_MARY_KAY}', '${SANDY_TENANT_ID}', 'MARY KAY'),`);
lines.push(`  ('${CAT_ROPA}', '${SANDY_TENANT_ID}', 'ROPA DE NIÑOS'),`);
lines.push(`  ('${CAT_CARTERAS}', '${SANDY_TENANT_ID}', 'CARTERAS')`);
lines.push("ON CONFLICT (id) DO NOTHING;");
lines.push("");

lines.push(`INSERT INTO public.presentations (id, tenant_id, name) VALUES`);
lines.push(`  ('${PRES_UNIDAD}', '${SANDY_TENANT_ID}', 'Unidad'),`);
lines.push(`  ('${PRES_SET}', '${SANDY_TENANT_ID}', 'Set'),`);
lines.push(`  ('${PRES_PAR}', '${SANDY_TENANT_ID}', 'Par')`);
lines.push("ON CONFLICT (id) DO NOTHING;");
lines.push("");

const allProducts = [...SANDY_EXCEL_PRODUCTS, ...extraProducts];
lines.push("INSERT INTO public.products (id, tenant_id, name, sku, barcode, price, cost, category_id, presentation_id, image_url, attributes) VALUES");

const productRows = allProducts.map((p, i) => {
  const id = toUuid(p.id);
  const categoryId = toUuid(p.category_id);
  const presentationId = toUuid(p.presentation_id);
  const suffix = i < allProducts.length - 1 ? "," : "";
  return `  ('${id}', '${SANDY_TENANT_ID}', ${sqlStr(p.name)}, ${sqlStr(p.sku)}, ${sqlStr(p.barcode)}, ${p.price}, ${p.cost}, '${categoryId}', '${presentationId}', NULL, ${sqlJson(p.attributes || {})})${suffix}`;
});
lines.push(...productRows);
lines.push("ON CONFLICT (id) DO NOTHING;");
lines.push("");

const allInventory = [...SANDY_EXCEL_INVENTORY, ...extraInventory];
lines.push("INSERT INTO public.inventory (branch_id, product_id, stock) VALUES");
const invRows = allInventory.map((inv, i) => {
  const productId = toUuid(inv.product_id);
  const suffix = i < allInventory.length - 1 ? "," : "";
  return `  ('${inv.branch_id}', '${productId}', ${inv.stock})${suffix}`;
});
lines.push(...invRows);
lines.push("ON CONFLICT (branch_id, product_id) DO UPDATE SET stock = EXCLUDED.stock;");
lines.push("");

lines.push(`-- Usuarios: crear en Auth Dashboard o con scripts/apply-supabase-setup.mjs`);
lines.push(`-- admin@sandy.demo / SandyAdmin123!`);
lines.push(`-- maria@sandy.demo / Sandy123!`);
lines.push(`-- laura@sandy.demo / Sandy123!`);
lines.push("");
lines.push(`CREATE OR REPLACE FUNCTION public.link_sandy_user(`);
lines.push(`  p_user_id UUID,`);
lines.push(`  p_email TEXT,`);
lines.push(`  p_display_name TEXT,`);
lines.push(`  p_branch_id UUID,`);
lines.push(`  p_role_id UUID,`);
lines.push(`  p_role_slug public.user_role`);
lines.push(`) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$`);
lines.push(`BEGIN`);
lines.push(`  INSERT INTO public.users_profiles (user_id, tenant_id, branch_id, role, role_id, display_name, active)`);
lines.push(`  VALUES (p_user_id, '${SANDY_TENANT_ID}', p_branch_id, p_role_slug, p_role_id, p_display_name, true)`);
lines.push(`  ON CONFLICT (user_id) DO UPDATE SET`);
lines.push(`    tenant_id = EXCLUDED.tenant_id,`);
lines.push(`    branch_id = EXCLUDED.branch_id,`);
lines.push(`    role = EXCLUDED.role,`);
lines.push(`    role_id = EXCLUDED.role_id,`);
lines.push(`    display_name = EXCLUDED.display_name,`);
lines.push(`    active = true;`);
lines.push(`END;`);
lines.push(`$$;`);
lines.push("");
lines.push(`GRANT EXECUTE ON FUNCTION public.link_sandy_user TO anon, authenticated, service_role;`);

const outPath = path.join(__dirname, "..", "supabase", "seed-sandy.sql");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Generado: ${outPath}`);
console.log(`Productos: ${allProducts.length}, inventario: ${allInventory.length}`);
