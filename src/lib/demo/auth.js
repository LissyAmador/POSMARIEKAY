import { DEMO_USER } from "./seed";

const SESSION_KEY = "pos-demo-session";
const listeners = new Set();

function readSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function writeSession(session) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  listeners.forEach((cb) => cb("SIGNED_IN", session ? { user: session.user } : null));
}

export function demoGetSession() {
  const session = readSession();
  return { data: { session } };
}

export function demoGetUser() {
  const session = readSession();
  return { data: { user: session?.user ?? null } };
}

export function demoSignIn({ email, password }) {
  if (email !== DEMO_USER.email || password !== DEMO_USER.password) {
    return { error: { message: "Credenciales inválidas. Use superadmin@pos.demo / SuperAdmin123!" } };
  }

  const session = {
    user: { id: DEMO_USER.id, email: DEMO_USER.email },
    access_token: "demo-token",
  };
  writeSession(session);
  return { error: null };
}

export function demoSignOut() {
  writeSession(null);
  return { error: null };
}

export function demoOnAuthStateChange(callback) {
  listeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => listeners.delete(callback),
      },
    },
  };
}
