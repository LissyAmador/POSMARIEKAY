import { createChinoCellBundle, mergeBundles } from "./chino-cell-seed";
import { createSandyBundle, mergeSandyBundle } from "./sandy-seed";

export const DEMO_USER = {
  id: "d0000000-0000-4000-8000-000000000001",
  email: "superadmin@pos.demo",
  password: "SuperAdmin123!",
};

export const DEMO_USER_VENDEDOR = {
  id: "d0000000-0000-4000-8000-000000000002",
  email: "vendedor@pos.demo",
  password: "Vendedor123!",
};

export const DEMO_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
export const DEMO_BRANCH_ID = "b0000000-0000-4000-8000-000000000001";

export const ROLE_SUPER_ADMIN = "r0000000-0000-4000-8000-000000000001";
export const ROLE_ADMIN_ORG = "r0000000-0000-4000-8000-000000000002";
export const ROLE_VENDEDOR = "r0000000-0000-4000-8000-000000000003";

export const DEMO_ROLES = [
  {
    id: ROLE_SUPER_ADMIN,
    tenant_id: null,
    name: "Super Administrador",
    slug: "super_admin",
    permissions: ["*"],
    is_system: true,
  },
  {
    id: ROLE_ADMIN_ORG,
    tenant_id: DEMO_TENANT_ID,
    name: "Admin Organización",
    slug: "admin_org",
    permissions: [
      "admin.access",
      "admin.roles",
      "admin.permisos",
      "admin.usuarios",
      "pos.vender",
      "inventario.gestionar",
      "caja.gestionar",
      "creditos.gestionar",
      "recibos.gestionar",
      "reportes.ver",
    ],
    is_system: true,
  },
  {
    id: ROLE_VENDEDOR,
    tenant_id: DEMO_TENANT_ID,
    name: "Vendedor",
    slug: "vendedor",
    permissions: ["pos.vender", "reportes.ver"],
    is_system: true,
  },
];

export const DEMO_USERS = [
  {
    id: DEMO_USER.id,
    name: "Super Admin Demo",
    email: DEMO_USER.email,
    password: DEMO_USER.password,
    tenant_id: DEMO_TENANT_ID,
    branch_id: DEMO_BRANCH_ID,
    role_id: ROLE_SUPER_ADMIN,
    active: true,
  },
  {
    id: DEMO_USER_VENDEDOR.id,
    name: "Vendedor Demo",
    email: DEMO_USER_VENDEDOR.email,
    password: DEMO_USER_VENDEDOR.password,
    tenant_id: DEMO_TENANT_ID,
    branch_id: DEMO_BRANCH_ID,
    role_id: ROLE_VENDEDOR,
    active: true,
  },
];

export const DEMO_CATEGORIES = [
  { id: "cat-001", tenant_id: DEMO_TENANT_ID, name: "Bebidas" },
  { id: "cat-002", tenant_id: DEMO_TENANT_ID, name: "Alimentos" },
  { id: "cat-003", tenant_id: DEMO_TENANT_ID, name: "Snacks" },
];

export const DEMO_PRESENTATIONS = [
  { id: "pres-001", tenant_id: DEMO_TENANT_ID, name: "Unidad" },
  { id: "pres-002", tenant_id: DEMO_TENANT_ID, name: "Vaso" },
  { id: "pres-003", tenant_id: DEMO_TENANT_ID, name: "Botella" },
  { id: "pres-004", tenant_id: DEMO_TENANT_ID, name: "Pack" },
  { id: "pres-005", tenant_id: DEMO_TENANT_ID, name: "Lata" },
];

export function createInitialDemoData() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 5);
  const overdue = new Date(now);
  overdue.setDate(overdue.getDate() - 3);
  const future = new Date(now);
  future.setDate(future.getDate() + 7);

  const products = [
    {
      id: "c0000000-0000-4000-8000-000000000001",
      tenant_id: DEMO_TENANT_ID,
      category_id: "cat-001",
      presentation_id: "pres-002",
      name: "Café Americano",
      sku: "CAF-001",
      barcode: "7501234567890",
      price: 45,
      cost: 15,
      image_url: null,
    },
    {
      id: "c0000000-0000-4000-8000-000000000002",
      tenant_id: DEMO_TENANT_ID,
      category_id: "cat-002",
      presentation_id: "pres-001",
      name: "Sandwich Jamón",
      sku: "SAN-001",
      barcode: "7501234567891",
      price: 65,
      cost: 28,
      image_url: null,
    },
    {
      id: "c0000000-0000-4000-8000-000000000003",
      tenant_id: DEMO_TENANT_ID,
      category_id: "cat-001",
      presentation_id: "pres-003",
      name: "Agua 600ml",
      sku: "AGU-001",
      barcode: "7501234567892",
      price: 18,
      cost: 6,
      image_url: null,
    },
    {
      id: "c0000000-0000-4000-8000-000000000004",
      tenant_id: DEMO_TENANT_ID,
      category_id: "cat-003",
      presentation_id: "pres-004",
      name: "Galletas Pack",
      sku: "GAL-001",
      barcode: "7501234567893",
      price: 32,
      cost: 14,
      image_url: null,
    },
    {
      id: "c0000000-0000-4000-8000-000000000005",
      tenant_id: DEMO_TENANT_ID,
      category_id: "cat-001",
      presentation_id: "pres-005",
      name: "Refresco 355ml",
      sku: "REF-001",
      barcode: "7501234567894",
      price: 25,
      cost: 10,
      image_url: null,
    },
  ];

  const inventory = products.map((p) => ({
    id: `inv-${p.id}`,
    branch_id: DEMO_BRANCH_ID,
    product_id: p.id,
    stock: p.id.endsWith("0001") ? 100 : p.id.endsWith("0002") ? 50 : 80,
  }));

  const creditSaleOverdue = {
    id: "s0000000-0000-4000-8000-000000000001",
    branch_id: DEMO_BRANCH_ID,
    user_id: DEMO_USER.id,
    client_name: "María López",
    type: "credito",
    total: 130,
    status: "activa",
    status_credit: "pendiente",
    due_date: overdue.toISOString().split("T")[0],
    created_at: yesterday.toISOString(),
  };

  const creditSalePending = {
    id: "s0000000-0000-4000-8000-000000000002",
    branch_id: DEMO_BRANCH_ID,
    user_id: DEMO_USER.id,
    client_name: "Carlos Ruiz",
    type: "credito",
    total: 90,
    status: "activa",
    status_credit: "pendiente",
    due_date: future.toISOString().split("T")[0],
    created_at: now.toISOString(),
  };

  const base = {
    tenants: [
      {
        id: DEMO_TENANT_ID,
        name: "Organización Demo POS",
        created_at: now.toISOString(),
      },
    ],
    branches: [
      {
        id: DEMO_BRANCH_ID,
        tenant_id: DEMO_TENANT_ID,
        name: "Sucursal Principal",
        address: "Av. Principal #100, Ciudad Demo",
      },
    ],
    roles: DEMO_ROLES,
    demo_users: DEMO_USERS,
    users_profiles: [
      {
        id: "p0000000-0000-4000-8000-000000000001",
        user_id: DEMO_USER.id,
        tenant_id: DEMO_TENANT_ID,
        branch_id: DEMO_BRANCH_ID,
        role_id: ROLE_SUPER_ADMIN,
        role: "super_admin",
      },
      {
        id: "p0000000-0000-4000-8000-000000000002",
        user_id: DEMO_USER_VENDEDOR.id,
        tenant_id: DEMO_TENANT_ID,
        branch_id: DEMO_BRANCH_ID,
        role_id: ROLE_VENDEDOR,
        role: "vendedor",
      },
    ],
    categories: DEMO_CATEGORIES,
    presentations: DEMO_PRESENTATIONS,
    products,
    inventory,
    cash_registers: [],
    sales: [creditSaleOverdue, creditSalePending],
    sales_details: [
      {
        id: "sd-001",
        sale_id: creditSaleOverdue.id,
        product_id: products[0].id,
        quantity: 2,
        price: 45,
      },
      {
        id: "sd-002",
        sale_id: creditSaleOverdue.id,
        product_id: products[1].id,
        quantity: 1,
        price: 40,
      },
      {
        id: "sd-003",
        sale_id: creditSalePending.id,
        product_id: products[2].id,
        quantity: 5,
        price: 18,
      },
    ],
    credit_payments: [
      {
        id: "cp-001",
        sale_id: creditSaleOverdue.id,
        amount_paid: 20,
        created_at: yesterday.toISOString(),
      },
    ],
    technicians: [],
    repair_orders: [],
  };

  const chino = createChinoCellBundle(now);
  const withChino = mergeBundles(base, chino);
  const sandy = createSandyBundle(now);
  return mergeSandyBundle(withChino, sandy);
}
