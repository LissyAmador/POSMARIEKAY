export function triggerNativePrint(format) {
  document.body.classList.add("printing-receipt", `print-format-${format}`);

  const cleanup = () => {
    document.body.classList.remove(
      "printing-receipt",
      "print-format-thermal",
      "print-format-half-letter"
    );
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  requestAnimationFrame(() => {
    window.print();
  });
}

export function getDigitalReceiptPath(saleId) {
  return `/recibo/${saleId}`;
}
