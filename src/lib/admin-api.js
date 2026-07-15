import { isDemoMode } from "./demo-mode";
import { getDemoStore, updateDemoStore, uuid } from "./demo/store";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  groupPermissionsByModule,
} from "./permissions";
import { supabase } from "@/src/utils/supabase/client";

function isSuperAdmin(store, userId) {
  const profile = store.users_profiles.find((p) => p.user_id === userId);
  if (!profile) return false;
  const role = store.roles?.find((r) => r.id === profile.role_id);
  return role?.slug === "super_admin";
}

function resolveRole(store, profile) {
  const role = (store.roles || []).find((r) => r.id === profile.role_id);
  if (role) {
    const permissions =
      role.permissions?.includes("*") ? ALL_PERMISSION_KEYS : role.permissions || [];
    return { ...role, permissions };
  }
  if (profile.role === "admin_org") {
    return {
      id: "legacy-admin",
      slug: "admin_org",
      name: "Admin Organización",
      permissions: ALL_PERMISSION_KEYS.filter((k) => k !== "admin.organizaciones"),
    };
  }
  if (profile.role === "contabilidad") {
    return {
      id: "legacy-contabilidad",
      slug: "contabilidad",
      name: "Contabilidad",
      permissions: ["caja.gestionar", "reportes.ver", "recibos.gestionar"],
    };
  }
  return {
    id: "legacy-vendedor",
    slug: "vendedor",
    name: "Vendedor",
    permissions: ["pos.vender", "reportes.ver"],
  };
}

export async function getPermissionsCatalog() {
  return {
    data: PERMISSION_CATALOG,
    grouped: groupPermissionsByModule(),
    error: null,
  };
}

export async function getOrganizations() {
  if (isDemoMode()) {
    const store = getDemoStore();
    const orgs = store.tenants.map((tenant) => ({
      ...tenant,
      branches: store.branches.filter((b) => b.tenant_id === tenant.id),
      userCount: store.users_profiles.filter((p) => p.tenant_id === tenant.id).length,
    }));
    return { data: orgs, error: null };
  }

  const { data: tenants, error } = await supabase.from("tenants").select("*").order("name");
  if (error) return { data: [], error };

  const orgs = await Promise.all(
    (tenants || []).map(async (tenant) => {
      const [{ data: branches }, { count }] = await Promise.all([
        supabase.from("branches").select("*").eq("tenant_id", tenant.id).order("name"),
        supabase
          .from("users_profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
      ]);
      return { ...tenant, branches: branches || [], userCount: count || 0 };
    })
  );

  return { data: orgs, error: null };
}

export async function saveOrganization({ editing, name, branchName, address }) {
  if (!name?.trim()) return { error: { message: "Nombre de organización requerido." } };

  if (isDemoMode()) {
    if (editing) {
      updateDemoStore((data) => ({
        ...data,
        tenants: data.tenants.map((t) =>
          t.id === editing.id ? { ...t, name: name.trim() } : t
        ),
        branches: data.branches.map((b) =>
          b.tenant_id === editing.id && b.id === editing.mainBranchId
            ? { ...b, name: branchName?.trim() || b.name, address: address || b.address }
            : b
        ),
      }));
    } else {
      const tenantId = uuid();
      const branchId = uuid();
      updateDemoStore((data) => ({
        ...data,
        tenants: [
          ...data.tenants,
          { id: tenantId, name: name.trim(), created_at: new Date().toISOString() },
        ],
        branches: [
          ...data.branches,
          {
            id: branchId,
            tenant_id: tenantId,
            name: branchName?.trim() || "Sucursal Principal",
            address: address || "",
          },
        ],
        categories: [
          ...(data.categories || []),
          { id: uuid(), tenant_id: tenantId, name: "General" },
        ],
        presentations: [
          ...(data.presentations || []),
          { id: uuid(), tenant_id: tenantId, name: "Unidad" },
        ],
      }));
    }
    return { error: null };
  }

  if (editing) {
    const { error } = await supabase
      .from("tenants")
      .update({ name: name.trim() })
      .eq("id", editing.id);
    if (error) return { error };

    if (editing.mainBranchId) {
      return supabase
        .from("branches")
        .update({
          name: branchName?.trim() || editing.mainBranchName,
          address: address || "",
        })
        .eq("id", editing.mainBranchId);
    }
    return { error: null };
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({ name: name.trim() })
    .select()
    .single();
  if (tenantError) return { error: tenantError };

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .insert({
      tenant_id: tenant.id,
      name: branchName?.trim() || "Sucursal Principal",
      address: address || "",
    })
    .select()
    .single();
  if (branchError) return { error: branchError };

  await supabase.from("categories").insert({ tenant_id: tenant.id, name: "General" });
  await supabase.from("presentations").insert({ tenant_id: tenant.id, name: "Unidad" });

  return { data: { tenant, branch }, error: null };
}

export async function deleteOrganization(orgId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    if (store.tenants.length <= 1) {
      return { error: { message: "Debe existir al menos una organización." } };
    }
    const hasUsers = store.users_profiles.some((p) => p.tenant_id === orgId);
    if (hasUsers) {
      return { error: { message: "No se puede eliminar: tiene usuarios asignados." } };
    }
    updateDemoStore((data) => ({
      ...data,
      tenants: data.tenants.filter((t) => t.id !== orgId),
      branches: data.branches.filter((b) => b.tenant_id !== orgId),
      products: data.products.filter((p) => p.tenant_id !== orgId),
      categories: (data.categories || []).filter((c) => c.tenant_id !== orgId),
      presentations: (data.presentations || []).filter((p) => p.tenant_id !== orgId),
      roles: (data.roles || []).filter((r) => r.tenant_id !== orgId),
    }));
    return { error: null };
  }

  const { count } = await supabase
    .from("users_profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", orgId);
  if ((count || 0) > 0) {
    return { error: { message: "No se puede eliminar: tiene usuarios asignados." } };
  }

  return supabase.from("tenants").delete().eq("id", orgId);
}

export async function getRoles(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const roles = (store.roles || []).filter(
      (r) => r.tenant_id === null || r.tenant_id === tenantId
    );
    return { data: roles, error: null };
  }

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("name");

  return {
    data: (data || []).map((role) => ({
      ...role,
      permissions: Array.isArray(role.permissions)
        ? role.permissions
        : JSON.parse(role.permissions || "[]"),
    })),
    error,
  };
}

export async function saveRole({ editing, tenantId, name, permissions, slug }) {
  if (!name?.trim()) return { error: { message: "Nombre del rol requerido." } };
  if (!permissions?.length) {
    return { error: { message: "Seleccione al menos un permiso." } };
  }

  if (isDemoMode()) {
    const roleSlug =
      slug ||
      name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

    if (editing) {
      if (editing.is_system) {
        return { error: { message: "Los roles del sistema no se pueden editar." } };
      }
      updateDemoStore((data) => ({
        ...data,
        roles: data.roles.map((r) =>
          r.id === editing.id
            ? { ...r, name: name.trim(), slug: roleSlug, permissions }
            : r
        ),
      }));
    } else {
      updateDemoStore((data) => ({
        ...data,
        roles: [
          ...(data.roles || []),
          {
            id: uuid(),
            tenant_id: tenantId,
            name: name.trim(),
            slug: roleSlug,
            permissions,
            is_system: false,
          },
        ],
      }));
    }
    return { error: null };
  }

  const roleSlug =
    slug ||
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

  if (editing) {
    if (editing.is_system) {
      return { error: { message: "Los roles del sistema no se pueden editar." } };
    }
    return supabase
      .from("roles")
      .update({ name: name.trim(), slug: roleSlug, permissions })
      .eq("id", editing.id);
  }

  return supabase.from("roles").insert({
    tenant_id: tenantId,
    name: name.trim(),
    slug: roleSlug,
    permissions,
    is_system: false,
  });
}

export async function deleteRole(roleId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const role = store.roles?.find((r) => r.id === roleId);
    if (!role) return { error: { message: "Rol no encontrado." } };
    if (role.is_system) {
      return { error: { message: "No se puede eliminar un rol del sistema." } };
    }
    const inUse = store.users_profiles.some((p) => p.role_id === roleId);
    if (inUse) {
      return { error: { message: "El rol está asignado a usuarios." } };
    }
    updateDemoStore((data) => ({
      ...data,
      roles: data.roles.filter((r) => r.id !== roleId),
    }));
    return { error: null };
  }

  const { data: role } = await supabase.from("roles").select("*").eq("id", roleId).maybeSingle();
  if (!role) return { error: { message: "Rol no encontrado." } };
  if (role.is_system) {
    return { error: { message: "No se puede eliminar un rol del sistema." } };
  }

  const { count } = await supabase
    .from("users_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if ((count || 0) > 0) {
    return { error: { message: "El rol está asignado a usuarios." } };
  }

  return supabase.from("roles").delete().eq("id", roleId);
}

export async function getAdminUsers(tenantId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const users = (store.demo_users || [])
      .filter((u) => !tenantId || u.tenant_id === tenantId)
      .map((user) => {
        const profile = store.users_profiles.find((p) => p.user_id === user.id);
        const role = store.roles?.find((r) => r.id === profile?.role_id);
        const tenant = store.tenants.find((t) => t.id === user.tenant_id);
        const branch = store.branches.find((b) => b.id === user.branch_id);
        return { ...user, profile, role, tenant, branch, password: undefined };
      });
    return { data: users, error: null };
  }

  const { data: profiles, error } = await supabase
    .from("users_profiles")
    .select("*, roles(*), tenants(*), branches(*)")
    .eq("tenant_id", tenantId);

  if (error) return { data: [], error };

  return {
    data: (profiles || []).map((profile) => ({
      id: profile.user_id,
      name: profile.display_name,
      email: null,
      tenant_id: profile.tenant_id,
      branch_id: profile.branch_id,
      role_id: profile.role_id,
      active: profile.active,
      profile,
      role: profile.roles,
      tenant: profile.tenants,
      branch: profile.branches,
    })),
    error: null,
  };
}

export async function saveAdminUser({
  editing,
  name,
  email,
  password,
  tenantId,
  branchId,
  roleId,
  active = true,
}) {
  if (!name?.trim() || !email?.trim()) {
    return { error: { message: "Nombre y correo son requeridos." } };
  }
  if (!tenantId || !branchId || !roleId) {
    return { error: { message: "Organización, sucursal y rol son requeridos." } };
  }
  if (!editing && !password?.trim()) {
    return { error: { message: "Contraseña requerida para usuario nuevo." } };
  }

  if (isDemoMode()) {
    const store = getDemoStore();
    const emailExists = store.demo_users.some(
      (u) => u.email === email.trim().toLowerCase() && u.id !== editing?.id
    );
    if (emailExists) {
      return { error: { message: "El correo ya está registrado." } };
    }

    const role = store.roles.find((r) => r.id === roleId);
    const roleSlug = role?.slug || "vendedor";

    if (editing) {
      updateDemoStore((data) => ({
        ...data,
        demo_users: data.demo_users.map((u) =>
          u.id === editing.id
            ? {
                ...u,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password: password?.trim() ? password : u.password,
                tenant_id: tenantId,
                branch_id: branchId,
                role_id: roleId,
                active,
              }
            : u
        ),
        users_profiles: data.users_profiles.map((p) =>
          p.user_id === editing.id
            ? {
                ...p,
                tenant_id: tenantId,
                branch_id: branchId,
                role_id: roleId,
                role: roleSlug,
              }
            : p
        ),
      }));
    } else {
      const userId = uuid();
      updateDemoStore((data) => ({
        ...data,
        demo_users: [
          ...(data.demo_users || []),
          {
            id: userId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: password.trim(),
            tenant_id: tenantId,
            branch_id: branchId,
            role_id: roleId,
            active,
          },
        ],
        users_profiles: [
          ...data.users_profiles,
          {
            id: uuid(),
            user_id: userId,
            tenant_id: tenantId,
            branch_id: branchId,
            role_id: roleId,
            role: roleSlug,
          },
        ],
      }));
    }
    return { error: null };
  }

  const { data: role } = await supabase.from("roles").select("slug").eq("id", roleId).single();
  const roleSlug = role?.slug || "vendedor";

  if (editing) {
    const { error } = await supabase
      .from("users_profiles")
      .update({
        tenant_id: tenantId,
        branch_id: branchId,
        role_id: roleId,
        role: roleSlug,
        display_name: name.trim(),
        active,
      })
      .eq("user_id", editing.id);

    if (error) return { error };

    if (password?.trim()) {
      return {
        error: {
          message:
            "Para cambiar contraseña use el panel de Supabase Auth o solicite al usuario restablecerla.",
        },
      };
    }
    return { error: null };
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: password.trim(),
    options: { data: { display_name: name.trim() } },
  });

  if (signUpError) return { error: signUpError };
  const userId = signUpData?.user?.id;
  if (!userId) {
    return { error: { message: "No se pudo crear el usuario en Auth." } };
  }

  return supabase.from("users_profiles").insert({
    user_id: userId,
    tenant_id: tenantId,
    branch_id: branchId,
    role_id: roleId,
    role: roleSlug,
    display_name: name.trim(),
    active,
  });
}

export async function deleteAdminUser(userId) {
  if (isDemoMode()) {
    const store = getDemoStore();
    const user = store.demo_users?.find((u) => u.id === userId);
    if (user?.email === "superadmin@pos.demo") {
      return { error: { message: "No se puede eliminar el superadministrador." } };
    }
    updateDemoStore((data) => ({
      ...data,
      demo_users: data.demo_users.filter((u) => u.id !== userId),
      users_profiles: data.users_profiles.filter((p) => p.user_id !== userId),
    }));
    return { error: null };
  }

  return supabase
    .from("users_profiles")
    .update({ active: false })
    .eq("user_id", userId);
}

export function getUserPermissionsFromStore(userId) {
  const store = getDemoStore();
  const profile = store.users_profiles.find((p) => p.user_id === userId);
  if (!profile) return [];
  const role = resolveRole(store, profile);
  return role.permissions;
}

export { resolveRole, isSuperAdmin };
