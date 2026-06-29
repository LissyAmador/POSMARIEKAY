export function normalizeProductName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim();
}

export function generateSku(name, existingProducts = []) {
  const normalized = normalizeProductName(name);
  const words = normalized.split(/\s+/).filter(Boolean);

  let prefix = words
    .map((word) => word.slice(0, 3).toUpperCase())
    .join("")
    .slice(0, 6);

  if (!prefix) {
    prefix = "PRD";
  }

  const matching = existingProducts.filter((product) =>
    product.sku?.startsWith(`${prefix}-`)
  );

  const sequence = matching.length + 1;
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function generateBarcode(existingProducts = []) {
  const used = new Set(
    existingProducts.map((product) => product.barcode).filter(Boolean)
  );

  let barcode = "";
  let attempts = 0;

  while (!barcode || used.has(barcode)) {
    const randomPart = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
      9,
      "0"
    );
    barcode = `740${randomPart}`;
    attempts += 1;
    if (attempts > 100) {
      barcode = `740${Date.now().toString().slice(-9)}`;
      break;
    }
  }

  return barcode;
}
