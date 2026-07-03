export const PERMISSION_CATALOG = [
  { key: "admin.access", name: "Acceder a administración", module: "Administración" },
  { key: "admin.organizaciones", name: "Gestionar organizaciones", module: "Administración" },
  { key: "admin.roles", name: "Gestionar roles", module: "Administración" },
  { key: "admin.permisos", name: "Ver permisos del sistema", module: "Administración" },
  { key: "admin.usuarios", name: "Gestionar usuarios", module: "Administración" },
  { key: "pos.vender", name: "Procesar ventas (POS)", module: "POS" },
  { key: "inventario.gestionar", name: "Gestionar inventario", module: "Inventario" },
  { key: "caja.gestionar", name: "Abrir/cerrar caja", module: "Caja" },
  { key: "creditos.gestionar", name: "Gestionar créditos", module: "Créditos" },
  { key: "recibos.gestionar", name: "Ver y anular recibos", module: "Recibos" },
  { key: "reportes.ver", name: "Ver reportes de ventas", module: "Reportes" },
  {
    key: "servicio_tecnico.gestionar",
    name: "Gestionar servicio técnico",
    module: "Servicio Técnico",
  },
  {
    key: "intercambios.gestionar",
    name: "Intercambios entre vendedoras",
    module: "Intercambios",
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export function groupPermissionsByModule(permissions = PERMISSION_CATALOG) {
  return permissions.reduce((groups, perm) => {
    if (!groups[perm.module]) groups[perm.module] = [];
    groups[perm.module].push(perm);
    return groups;
  }, {});
}

export function hasPermission(userPermissions, key) {
  if (!userPermissions?.length) return false;
  if (userPermissions.includes("*")) return true;
  return userPermissions.includes(key);
}
