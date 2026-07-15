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
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  if (!DB_PASSWORD || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Faltan variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD y clave Supabase.");
    process.exit(1);
  }

  const pg = (await import("pg")).default;
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "fix-auth-users.sql"), "utf8");
  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(DB_PASSWORD)}@db.${projectRef}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Auth users fixed.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "admin@posmariekay.com",
    password: "SandyAdmin123!",
  });
  console.log(error ? `Login error: ${error.message}` : `Login OK: ${data.user.email}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
