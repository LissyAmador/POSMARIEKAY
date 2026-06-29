import { createInitialDemoData } from "./seed";

const STORAGE_KEY = "pos-demo-data";

function readStore() {
  if (typeof window === "undefined") return createInitialDemoData();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = createInitialDemoData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw);
}

function writeStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetDemoStore() {
  const initial = createInitialDemoData();
  writeStore(initial);
  return initial;
}

export function getDemoStore() {
  return readStore();
}

export function updateDemoStore(updater) {
  const data = readStore();
  const next = typeof updater === "function" ? updater(data) : updater;
  writeStore(next);
  return next;
}

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
