export const DEMO_USER = {
  id: "d0000000-0000-4000-8000-000000000001",
  email: "superadmin@pos.demo",
  password: "SuperAdmin123!",
};

export const DEMO_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
export const DEMO_BRANCH_ID = "b0000000-0000-4000-8000-000000000001";

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
      name: "Café Americano",
      sku: "CAF-001",
      barcode: "7501234567890",
      price: 45,
      cost: 15,
    },
    {
      id: "c0000000-0000-4000-8000-000000000002",
      tenant_id: DEMO_TENANT_ID,
      name: "Sandwich Jamón",
      sku: "SAN-001",
      barcode: "7501234567891",
      price: 65,
      cost: 28,
    },
    {
      id: "c0000000-0000-4000-8000-000000000003",
      tenant_id: DEMO_TENANT_ID,
      name: "Agua 600ml",
      sku: "AGU-001",
      barcode: "7501234567892",
      price: 18,
      cost: 6,
    },
    {
      id: "c0000000-0000-4000-8000-000000000004",
      tenant_id: DEMO_TENANT_ID,
      name: "Galletas Pack",
      sku: "GAL-001",
      barcode: "7501234567893",
      price: 32,
      cost: 14,
    },
    {
      id: "c0000000-0000-4000-8000-000000000005",
      tenant_id: DEMO_TENANT_ID,
      name: "Refresco 355ml",
      sku: "REF-001",
      barcode: "7501234567894",
      price: 25,
      cost: 10,
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
    status_credit: "pendiente",
    due_date: future.toISOString().split("T")[0],
    created_at: now.toISOString(),
  };

  return {
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
    users_profiles: [
      {
        id: "p0000000-0000-4000-8000-000000000001",
        user_id: DEMO_USER.id,
        tenant_id: DEMO_TENANT_ID,
        branch_id: DEMO_BRANCH_ID,
        role: "admin_org",
      },
    ],
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
  };
}
