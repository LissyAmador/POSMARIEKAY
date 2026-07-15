import { ALL_PERMISSION_KEYS } from "./permissions";

const LEGACY_ROLE_PERMISSIONS = {
  admin_org: ALL_PERMISSION_KEYS.filter((k) => k !== "admin.organizaciones"),
  contabilidad: ["caja.gestionar", "reportes.ver", "recibos.gestionar"],
  vendedor: ["pos.vender", "reportes.ver"],
};

export function resolveRoleFromDb(profile) {
  const roleRow = profile?.roles;
  if (roleRow) {
    const perms = Array.isArray(roleRow.permissions)
      ? roleRow.permissions
      : JSON.parse(roleRow.permissions || "[]");
    const permissions = perms.includes("*") ? ALL_PERMISSION_KEYS : perms;
    return {
      id: roleRow.id,
      slug: roleRow.slug,
      name: roleRow.name,
      permissions,
    };
  }

  const slug = profile?.role || "vendedor";
  return {
    id: `legacy-${slug}`,
    slug,
    name:
      slug === "admin_org"
        ? "Admin Organización"
        : slug === "contabilidad"
          ? "Contabilidad"
          : "Vendedor",
    permissions: LEGACY_ROLE_PERMISSIONS[slug] || LEGACY_ROLE_PERMISSIONS.vendedor,
  };
}

export function enrichSupabaseProduct(product) {
  if (!product) return product;

  const category = product.categories || product.category;
  const presentation = product.presentations || product.presentation;
  const inventoryRows = Array.isArray(product.inventory)
    ? product.inventory
    : product.inventory
      ? [product.inventory]
      : [];
  const inv = inventoryRows[0];

  const { categories, presentations, inventory, ...rest } = product;

  return {
    ...rest,
    stock: inv?.stock ?? product.stock ?? 0,
    inventory: inventoryRows,
    category,
    presentation,
    category_name: category?.name || product.category_name || "Sin categoría",
    presentation_name: presentation?.name || product.presentation_name || "—",
  };
}

export function mapSupabaseProducts(data) {
  return (data || []).map(enrichSupabaseProduct);
}
