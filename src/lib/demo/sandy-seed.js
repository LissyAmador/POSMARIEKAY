/** Organización demo: Sandy — Mary Kay, ropa de niños y carteras */

import {
  SANDY_EXCEL_PRODUCTS,
  SANDY_EXCEL_INVENTORY,
} from "./sandy-inventory-import";

export const SANDY_TENANT_ID = "a0000000-0000-4000-8000-000000000004";
export const SANDY_BRANCH_MARIA_ID = "b0000000-0000-4000-8000-000000000010";
export const SANDY_BRANCH_LAURA_ID = "b0000000-0000-4000-8000-000000000011";

export const ROLE_SANDY_ADMIN = "r0000000-0000-4000-8000-000000000020";
export const ROLE_SANDY_VENDEDOR = "r0000000-0000-4000-8000-000000000021";

export const SANDY_USERS = {
  admin: {
    id: "d0000000-0000-4000-8000-000000000020",
    email: "admin@sandy.demo",
    password: "SandyAdmin123!",
    name: "Sandy — Administradora",
  },
  maria: {
    id: "d0000000-0000-4000-8000-000000000021",
    email: "maria@sandy.demo",
    password: "Sandy123!",
    name: "María González — Vendedora",
  },
  laura: {
    id: "d0000000-0000-4000-8000-000000000022",
    email: "laura@sandy.demo",
    password: "Sandy123!",
    name: "Laura Méndez — Vendedora",
  },
};

const SANDY_PERMS = [
  "pos.vender",
  "inventario.gestionar",
  "caja.gestionar",
  "creditos.gestionar",
  "recibos.gestionar",
  "reportes.ver",
  "intercambios.gestionar",
];

const ADMIN_SANDY_PERMS = [
  "admin.access",
  "admin.roles",
  "admin.usuarios",
  ...SANDY_PERMS,
];

export function createSandyBundle(now = new Date()) {
  const categories = [
    { id: "sd-cat-001", tenant_id: SANDY_TENANT_ID, name: "MARY KAY" },
    { id: "sd-cat-002", tenant_id: SANDY_TENANT_ID, name: "ROPA DE NIÑOS" },
    { id: "sd-cat-003", tenant_id: SANDY_TENANT_ID, name: "CARTERAS" },
  ];

  const presentations = [
    { id: "sd-pres-001", tenant_id: SANDY_TENANT_ID, name: "Unidad" },
    { id: "sd-pres-002", tenant_id: SANDY_TENANT_ID, name: "Set" },
    { id: "sd-pres-003", tenant_id: SANDY_TENANT_ID, name: "Par" },
  ];

  const products = [
    ...SANDY_EXCEL_PRODUCTS,
    {
      id: "sd-prod-004",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-002",
      presentation_id: "sd-pres-001",
      name: "Vestido Niña Flores",
      sku: "RN-VEST-FL",
      barcode: "7590020000004",
      price: 120,
      cost: 65,
      image_url: null,
      attributes: { talla: "5-6", color: "Rosa", genero: "Niña" },
    },
    {
      id: "sd-prod-005",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-002",
      presentation_id: "sd-pres-001",
      name: "Pijama Niño Dinosaurio",
      sku: "RN-PIJ-DI",
      barcode: "7590020000005",
      price: 95,
      cost: 48,
      image_url: null,
      attributes: { talla: "3-4", color: "Verde", genero: "Niño" },
    },
    {
      id: "sd-prod-006",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-002",
      presentation_id: "sd-pres-003",
      name: "Calcetines Bebé Pack",
      sku: "RN-CAL-BB",
      barcode: "7590020000006",
      price: 45,
      cost: 22,
      image_url: null,
      attributes: { talla: "0-3M", color: "Multicolor", genero: "Unisex" },
    },
    {
      id: "sd-prod-007",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-003",
      presentation_id: "sd-pres-001",
      name: "Cartera Cuero Clásica",
      sku: "CT-CU-CL",
      barcode: "7590020000007",
      price: 180,
      cost: 95,
      image_url: null,
      attributes: { material: "Cuero sintético", color: "Negro", tamano: "Mediana" },
    },
    {
      id: "sd-prod-008",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-003",
      presentation_id: "sd-pres-001",
      name: "Bolso Crossbody Rosa",
      sku: "CT-CR-RS",
      barcode: "7590020000008",
      price: 150,
      cost: 78,
      image_url: null,
      attributes: { material: "Tela", color: "Rosa", tamano: "Pequeña" },
    },
    {
      id: "sd-prod-009",
      tenant_id: SANDY_TENANT_ID,
      category_id: "sd-cat-003",
      presentation_id: "sd-pres-001",
      name: "Cartera Elegante Dorada",
      sku: "CT-EL-DO",
      barcode: "7590020000009",
      price: 220,
      cost: 115,
      image_url: null,
      attributes: { material: "Metal y cuero", color: "Dorado", tamano: "Pequeña" },
    },
  ];

  const inventory = [
    ...SANDY_EXCEL_INVENTORY,
    { id: "sd-inv-004", branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-004", stock: 6 },
    { id: "sd-inv-005", branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-005", stock: 10 },
    { id: "sd-inv-006", branch_id: SANDY_BRANCH_MARIA_ID, product_id: "sd-prod-007", stock: 5 },
    { id: "sd-inv-009", branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-006", stock: 15 },
    { id: "sd-inv-010", branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-008", stock: 8 },
    { id: "sd-inv-011", branch_id: SANDY_BRANCH_LAURA_ID, product_id: "sd-prod-009", stock: 3 },
  ];

  return {
    tenants: [{ id: SANDY_TENANT_ID, name: "Sandy", created_at: now.toISOString() }],
    branches: [
      {
        id: SANDY_BRANCH_MARIA_ID,
        tenant_id: SANDY_TENANT_ID,
        name: "Sandy — María",
        address: "Zona 10, Guatemala",
      },
      {
        id: SANDY_BRANCH_LAURA_ID,
        tenant_id: SANDY_TENANT_ID,
        name: "Sandy — Laura",
        address: "Mixco, Guatemala",
      },
    ],
    roles: [
      {
        id: ROLE_SANDY_ADMIN,
        tenant_id: SANDY_TENANT_ID,
        name: "Admin Sandy",
        slug: "admin_org",
        permissions: ADMIN_SANDY_PERMS,
        is_system: true,
      },
      {
        id: ROLE_SANDY_VENDEDOR,
        tenant_id: SANDY_TENANT_ID,
        name: "Vendedora Sandy",
        slug: "vendedor",
        permissions: SANDY_PERMS,
        is_system: true,
      },
    ],
    demo_users: [
      {
        id: SANDY_USERS.admin.id,
        name: SANDY_USERS.admin.name,
        email: SANDY_USERS.admin.email,
        password: SANDY_USERS.admin.password,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_MARIA_ID,
        role_id: ROLE_SANDY_ADMIN,
        active: true,
      },
      {
        id: SANDY_USERS.maria.id,
        name: SANDY_USERS.maria.name,
        email: SANDY_USERS.maria.email,
        password: SANDY_USERS.maria.password,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_MARIA_ID,
        role_id: ROLE_SANDY_VENDEDOR,
        active: true,
      },
      {
        id: SANDY_USERS.laura.id,
        name: SANDY_USERS.laura.name,
        email: SANDY_USERS.laura.email,
        password: SANDY_USERS.laura.password,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_LAURA_ID,
        role_id: ROLE_SANDY_VENDEDOR,
        active: true,
      },
    ],
    users_profiles: [
      {
        id: "sd-p-001",
        user_id: SANDY_USERS.admin.id,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_MARIA_ID,
        role_id: ROLE_SANDY_ADMIN,
        role: "admin_org",
      },
      {
        id: "sd-p-002",
        user_id: SANDY_USERS.maria.id,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_MARIA_ID,
        role_id: ROLE_SANDY_VENDEDOR,
        role: "vendedor",
      },
      {
        id: "sd-p-003",
        user_id: SANDY_USERS.laura.id,
        tenant_id: SANDY_TENANT_ID,
        branch_id: SANDY_BRANCH_LAURA_ID,
        role_id: ROLE_SANDY_VENDEDOR,
        role: "vendedor",
      },
    ],
    categories,
    presentations,
    products,
    inventory,
    seller_exchanges: [],
  };
}

export function mergeSandyIfMissing(store) {
  const hasSandy = store.tenants?.some((t) => t.id === SANDY_TENANT_ID);
  if (hasSandy) return store;

  const sandy = createSandyBundle();
  const sandyRoles = sandy.roles.filter(
    (r) => !store.roles?.some((existing) => existing.id === r.id)
  );

  return {
    ...store,
    tenants: [...(store.tenants || []), ...sandy.tenants],
    branches: [...(store.branches || []), ...sandy.branches],
    roles: [...(store.roles || []), ...sandyRoles],
    demo_users: [...(store.demo_users || []), ...sandy.demo_users],
    users_profiles: [...(store.users_profiles || []), ...sandy.users_profiles],
    categories: [...(store.categories || []), ...sandy.categories],
    presentations: [...(store.presentations || []), ...sandy.presentations],
    products: [...(store.products || []), ...sandy.products],
    inventory: [...(store.inventory || []), ...sandy.inventory],
    seller_exchanges: [...(store.seller_exchanges || []), ...(sandy.seller_exchanges || [])],
  };
}

export function mergeSandyBundle(base, sandy) {
  return {
    ...base,
    tenants: [...base.tenants, ...sandy.tenants],
    branches: [...base.branches, ...sandy.branches],
    roles: [...base.roles, ...sandy.roles],
    demo_users: [...base.demo_users, ...sandy.demo_users],
    users_profiles: [...base.users_profiles, ...sandy.users_profiles],
    categories: [...base.categories, ...sandy.categories],
    presentations: [...base.presentations, ...sandy.presentations],
    products: [...base.products, ...sandy.products],
    inventory: [...base.inventory, ...sandy.inventory],
    seller_exchanges: [...(base.seller_exchanges || []), ...(sandy.seller_exchanges || [])],
  };
}

const SANDY_KEEP_PRODUCT_IDS = new Set([
  "sd-prod-004",
  "sd-prod-005",
  "sd-prod-006",
  "sd-prod-007",
  "sd-prod-008",
  "sd-prod-009",
]);

/** Actualiza inventario Sandy desde inventario.xlsx en sesiones demo existentes */
export function migrateSandyExcelProducts(store) {
  const hasSandy = store.tenants?.some((t) => t.id === SANDY_TENANT_ID);
  if (!hasSandy) return store;

  const hasExcel = store.products?.some((p) => p.id?.startsWith("sd-excel-"));
  if (hasExcel) return store;

  const keptProducts = (store.products || []).filter(
    (p) =>
      p.tenant_id !== SANDY_TENANT_ID ||
      SANDY_KEEP_PRODUCT_IDS.has(p.id)
  );

  const removedIds = new Set(
    (store.products || [])
      .filter((p) => p.tenant_id === SANDY_TENANT_ID && !SANDY_KEEP_PRODUCT_IDS.has(p.id))
      .map((p) => p.id)
  );

  const keptInventory = (store.inventory || []).filter(
    (i) => !removedIds.has(i.product_id)
  );

  return {
    ...store,
    products: [...keptProducts, ...SANDY_EXCEL_PRODUCTS],
    inventory: [...keptInventory, ...SANDY_EXCEL_INVENTORY],
  };
}
