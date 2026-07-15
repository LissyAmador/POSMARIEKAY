/**
 * Aplica el esquema y datos iniciales en Supabase.
 *
 * Requiere SUPABASE_DB_PASSWORD en el entorno (contraseña de postgres del proyecto).
 * Opcional: SUPABASE_SERVICE_ROLE_KEY para crear usuarios sin confirmación de email.
 *
 * Uso:
 *   SUPABASE_DB_PASSWORD=tu_password node scripts/apply-supabase-setup.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnvFile(filename) {
  const filePath = path.join(ROOT, filename);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

const SANDY_USERS = [
  {
    email: "admin@posmariekay.com",
    password: "SandyAdmin123!",
    displayName: "Sandy — Administradora",
    branchId: "b0000000-0000-4000-8000-000000000010",
    roleId: "e0000000-0000-4000-8000-000000000020",
    roleSlug: "admin_org",
  },
  {
    email: "maria@posmariekay.com",
    password: "Sandy123!",
    displayName: "María González — Vendedora",
    branchId: "b0000000-0000-4000-8000-000000000010",
    roleId: "e0000000-0000-4000-8000-000000000021",
    roleSlug: "vendedor",
  },
  {
    email: "laura@posmariekay.com",
    password: "Sandy123!",
    displayName: "Laura Méndez — Vendedora",
    branchId: "b0000000-0000-4000-8000-000000000011",
    roleId: "e0000000-0000-4000-8000-000000000021",
    roleSlug: "vendedor",
  },
];

function readSql(name) {
  return fs.readFileSync(path.join(ROOT, "supabase", name), "utf8");
}

async function applySqlWithPg() {
  if (!DB_PASSWORD) {
    console.log("\n⚠️  SUPABASE_DB_PASSWORD no configurada.");
    console.log("   Obtén la contraseña en: Supabase Dashboard → Settings → Database");
    console.log("   Luego ejecuta:");
    console.log("   $env:SUPABASE_DB_PASSWORD='tu_password'; node scripts/apply-supabase-setup.mjs\n");
    return false;
  }

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    console.log("Instalando pg...");
    const { execSync } = await import("child_process");
    execSync("npm install pg --no-save", { cwd: ROOT, stdio: "inherit" });
    pg = (await import("pg")).default;
  }

  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
  const connectionString = `postgresql://postgres:${encodeURIComponent(DB_PASSWORD)}@db.${projectRef}.supabase.co:5432/postgres`;

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const files = ["schema.sql", "extensions.sql", "seed-sandy.sql"];
  for (const file of files) {
    console.log(`Ejecutando ${file}...`);
    const sql = readSql(file);
    await client.query(sql);
    console.log(`✓ ${file}`);
  }

  await client.end();
  return true;
}

async function createAuthUsers() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const user of SANDY_USERS) {
    console.log(`Configurando usuario ${user.email}...`);

    let userId = null;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { display_name: user.displayName },
      });
      if (error && !error.message?.includes("already")) {
        console.warn(`  Auth admin: ${error.message}`);
      } else {
        userId = data?.user?.id;
      }
    }

    if (!userId) {
      const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password,
        options: { data: { display_name: user.displayName } },
      });
      if (error && !error.message?.includes("already")) {
        console.warn(`  SignUp: ${error.message}`);
      } else {
        userId = data?.user?.id;
      }
    }

    if (!userId) {
      const { data: listData } = await supabase.auth.admin.listUsers();
      const found = listData?.users?.find((u) => u.email === user.email);
      userId = found?.id;
    }

    if (!userId) {
      console.warn(`  No se pudo obtener ID para ${user.email}. Créalo manualmente en Auth.`);
      continue;
    }

    const { error: linkError } = await supabase.rpc("link_sandy_user", {
      p_user_id: userId,
      p_email: user.email,
      p_display_name: user.displayName,
      p_branch_id: user.branchId,
      p_role_id: user.roleId,
      p_role_slug: user.roleSlug,
    });

    if (linkError) {
      console.warn(`  link_sandy_user: ${linkError.message}`);
    } else {
      console.log(`✓ ${user.email} vinculado`);
    }
  }
}

async function main() {
  console.log("=== Setup Supabase POS Marie Kay ===\n");
  console.log(`Proyecto: ${SUPABASE_URL}\n`);

  const applied = await applySqlWithPg();
  if (!applied) {
    console.log("Copia y ejecuta manualmente en SQL Editor (en orden):");
    console.log("  1. supabase/schema.sql");
    console.log("  2. supabase/extensions.sql");
    console.log("  3. supabase/seed-sandy.sql");
    return;
  }

  await createAuthUsers();

  console.log("\n✅ Setup completado.");
  console.log("Inicia sesión con:");
  console.log("  admin@posmariekay.com / SandyAdmin123!");
  console.log("  maria@posmariekay.com / Sandy123!");
  console.log("  laura@posmariekay.com / Sandy123!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
