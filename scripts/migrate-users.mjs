/**
 * Migra usuarios Sandy a Supabase Auth + users_profiles.
 * Solo requiere SUPABASE_DB_PASSWORD (misma contraseña de postgres del proyecto).
 *
 * Uso:
 *   $env:SUPABASE_DB_PASSWORD='tu_password'; npm run migrate:users
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const USERS = [
  { email: "admin@posmariekay.com", password: "SandyAdmin123!", role: "Administradora" },
  { email: "maria@posmariekay.com", password: "Sandy123!", role: "Vendedora María" },
  { email: "laura@posmariekay.com", password: "Sandy123!", role: "Vendedora Laura" },
];

async function main() {
  if (!DB_PASSWORD) {
    console.error("❌ Falta SUPABASE_DB_PASSWORD.");
    console.error("   Supabase Dashboard → Settings → Database → Database password");
    console.error("   $env:SUPABASE_DB_PASSWORD='tu_password'; npm run migrate:users");
    process.exit(1);
  }

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    const { execSync } = await import("child_process");
    execSync("npm install pg --no-save", { cwd: ROOT, stdio: "inherit" });
    pg = (await import("pg")).default;
  }

  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
  const connectionString = `postgresql://postgres:${encodeURIComponent(DB_PASSWORD)}@db.${projectRef}.supabase.co:5432/postgres`;

  const sql = fs.readFileSync(path.join(ROOT, "supabase", "seed-users.sql"), "utf8");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

  console.log("=== Migrando usuarios Sandy a Supabase Auth ===\n");
  await client.connect();
  await client.query(sql);
  await client.end();

  console.log("✅ Usuarios migrados correctamente.\n");
  console.log("Inicie sesión con:");
  for (const u of USERS) {
    console.log(`  ${u.email} / ${u.password}  (${u.role})`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
