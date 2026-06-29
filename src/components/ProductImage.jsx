"use client";

export default function ProductImage({
  src,
  name,
  size = "md",
  className = "",
}) {
  const sizes = {
    sm: "h-10 w-10",
    md: "h-16 w-16",
    lg: "h-24 w-24",
    xl: "h-32 w-32",
  };

  const initial = (name || "?").charAt(0).toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "Producto"}
        className={`${sizes[size]} shrink-0 rounded-lg object-cover ring-1 ring-slate-200 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg font-bold text-indigo-600 ring-1 ring-indigo-200 ${className}`}
    >
      {initial}
    </div>
  );
}
