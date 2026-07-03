"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getInventoryProducts,
  saveProduct,
  deleteProduct,
  getCategories,
  saveCategory,
  deleteCategory,
  getPresentations,
  savePresentation,
  deletePresentation,
} from "@/src/lib/pos-api";
import { generateSku, generateBarcode } from "@/src/lib/product-codes";
import { readImageAsDataUrl } from "@/src/lib/image-utils";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { useBranch } from "@/src/hooks/useBranchContext";
import { useCurrency } from "@/src/hooks/useCurrency";
import ProductImage from "@/src/components/ProductImage";
import {
  getCategoryAttributeSchema,
  getEmptyAttributes,
  validateCategoryAttributes,
  formatAttributesSummary,
  productMatchesSearch,
} from "@/src/lib/category-attributes";

const TABS = [
  { id: "productos", label: "Productos" },
  { id: "categorias", label: "Categorías" },
  { id: "presentaciones", label: "Presentaciones" },
];

const emptyProduct = {
  name: "",
  category_id: "",
  presentation_id: "",
  price: "",
  cost: "",
  stock: "",
  image_url: "",
  attributes: {},
};

export default function InventarioPage() {
  const { profile } = useUserProfile();
  const { activeBranch: branch } = useBranch();
  const { formatMoney, currency, setCurrency, currencies, currencyConfig } =
    useCurrency();

  const [tab, setTab] = useState("productos");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [previewCodes, setPreviewCodes] = useState({ sku: "", barcode: "" });
  const [catalogName, setCatalogName] = useState("");
  const [editingCatalog, setEditingCatalog] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  async function loadAll() {
    if (!profile?.tenant_id || !branch?.id) return;

    const [prodRes, catRes, presRes] = await Promise.all([
      getInventoryProducts(profile.tenant_id, branch.id),
      getCategories(profile.tenant_id),
      getPresentations(profile.tenant_id),
    ]);

    if (prodRes.error) setMessage({ type: "error", text: prodRes.error.message });
    else setProducts(prodRes.data || []);

    setCategories(catRes.data || []);
    setPresentations(presRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [profile?.tenant_id, branch?.id]);

  useEffect(() => {
    if (editing || !form.name.trim()) {
      setPreviewCodes({ sku: "", barcode: "" });
      return;
    }
    setPreviewCodes((prev) => ({
      sku: generateSku(form.name, products),
      barcode: prev.barcode || generateBarcode(products),
    }));
  }, [form.name, editing, products]);

  const groupedProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchesCategory =
        filterCategory === "all" || p.category_id === filterCategory;
      return matchesCategory && productMatchesSearch(p, search);
    });

    const groups = {};
    filtered.forEach((product) => {
      const key = product.category_name || "Sin categoría";
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });
    return groups;
  }, [products, filterCategory, search]);

  function openCreate() {
    setEditing(null);
    const catId = categories[0]?.id || "";
    const catName = categories.find((c) => c.id === catId)?.name || "";
    setForm({
      ...emptyProduct,
      category_id: catId,
      presentation_id: presentations[0]?.id || "",
      attributes: getEmptyAttributes(catName),
    });
    setPreviewCodes({ sku: "", barcode: "" });
    setShowForm(true);
  }

  function openEdit(product) {
    setEditing(product);
    setForm({
      name: product.name,
      category_id: product.category_id || "",
      presentation_id: product.presentation_id || "",
      price: String(product.price),
      cost: String(product.cost),
      stock: String(product.stock),
      image_url: product.image_url || "",
      attributes: product.attributes || {},
    });
    setPreviewCodes({ sku: product.sku || "", barcode: product.barcode || "" });
    setShowForm(true);
  }

  async function handleImageChange(e) {
    try {
      const dataUrl = await readImageAsDataUrl(e.target.files?.[0]);
      setForm((prev) => ({ ...prev, image_url: dataUrl }));
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    if (!form.category_id) {
      setMessage({ type: "error", text: "Seleccione una categoría." });
      return;
    }
    if (!form.presentation_id) {
      setMessage({ type: "error", text: "Seleccione una presentación." });
      return;
    }

    const categoryName = categories.find((c) => c.id === form.category_id)?.name;
    const attrCheck = validateCategoryAttributes(categoryName, form.attributes);
    if (!attrCheck.valid) {
      setMessage({ type: "error", text: attrCheck.message });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });

    const productData = {
      name: form.name.trim(),
      sku: editing ? editing.sku : previewCodes.sku || generateSku(form.name, products),
      barcode: editing
        ? editing.barcode
        : previewCodes.barcode || generateBarcode(products),
      category_id: form.category_id,
      presentation_id: form.presentation_id,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      image_url: form.image_url || null,
      currency,
      attributes: form.attributes || {},
    };
    const stock = parseInt(form.stock, 10) || 0;

    const { error } = await saveProduct({
      editing,
      tenantId: profile.tenant_id,
      branchId: branch.id,
      productData,
      stock,
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: editing ? "Producto actualizado." : "Producto creado." });
      setShowForm(false);
      await loadAll();
    }
    setSaving(false);
  }

  async function handleSaveCatalog(type) {
    if (!catalogName.trim()) return;
    setSaving(true);

    const fn = type === "category" ? saveCategory : savePresentation;
    const { error } = await fn({
      editing: editingCatalog,
      tenantId: profile.tenant_id,
      name: catalogName.trim(),
    });

    if (error) setMessage({ type: "error", text: error.message });
    else {
      setMessage({ type: "success", text: "Guardado correctamente." });
      setCatalogName("");
      setEditingCatalog(null);
      await loadAll();
    }
    setSaving(false);
  }

  async function handleDeleteCatalog(type, item) {
    if (!window.confirm(`¿Eliminar "${item.name}"?`)) return;
    const fn = type === "category" ? deleteCategory : deletePresentation;
    const { error } = await fn(item.id);
    if (error) setMessage({ type: "error", text: error.message });
    else {
      setMessage({ type: "success", text: "Eliminado." });
      await loadAll();
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="text-slate-500">
            Productos por categoría — {branch?.name}
          </p>
        </div>
        {tab === "productos" && (
          <button
            onClick={openCreate}
            disabled={categories.length === 0 || presentations.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            + Nuevo producto
          </button>
        )}
      </header>

      <div className="mb-6 flex gap-2 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message.text && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm ${
            message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {tab === "categorias" && (
        <CatalogPanel
          title="Categorías"
          items={categories}
          name={catalogName}
          setName={setCatalogName}
          editing={editingCatalog}
          setEditing={setEditingCatalog}
          onSave={() => handleSaveCatalog("category")}
          onDelete={(item) => handleDeleteCatalog("category", item)}
          saving={saving}
        />
      )}

      {tab === "presentaciones" && (
        <CatalogPanel
          title="Presentaciones"
          items={presentations}
          name={catalogName}
          setName={setCatalogName}
          editing={editingCatalog}
          setEditing={setEditingCatalog}
          onSave={() => handleSaveCatalog("presentation")}
          onDelete={(item) => handleDeleteCatalog("presentation", item)}
          saving={saving}
        />
      )}

      {tab === "productos" && (
        <>
          {(categories.length === 0 || presentations.length === 0) && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Cree al menos una categoría y una presentación antes de agregar productos.
            </div>
          )}

          {showForm && (
            <ProductForm
              form={form}
              setForm={setForm}
              editing={editing}
              previewCodes={previewCodes}
              categories={categories}
              presentations={presentations}
              currency={currency}
              setCurrency={setCurrency}
              currencies={currencies}
              currencyConfig={currencyConfig}
              branch={branch}
              saving={saving}
              onImageChange={handleImageChange}
              onSubmit={handleSaveProduct}
              onCancel={() => setShowForm(false)}
            />
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Buscar producto, SKU o atributos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setFilterCategory("all");
                setSearch("");
              }}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
            >
              Ver todo
            </button>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : Object.keys(groupedProducts).length === 0 ? (
            <div className="rounded-xl bg-white p-12 text-center text-slate-400 ring-1 ring-slate-200">
              No hay productos
            </div>
          ) : (
            Object.entries(groupedProducts).map(([categoryName, items]) => (
              <div key={categoryName} className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-indigo-900">
                  {categoryName}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({items.length})
                  </span>
                </h2>
                <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Presentación</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Precio venta</th>
                        <th className="px-4 py-3">Costo</th>
                        <th className="px-4 py-3">Atributos</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((product) => (
                        <tr key={product.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProductImage
                                src={product.image_url}
                                name={product.name}
                                size="sm"
                              />
                              <span className="font-medium text-slate-900">
                                {product.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {product.presentation_name}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {product.sku}
                          </td>
                          <td className="px-4 py-3">{formatMoney(product.price)}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {formatMoney(product.cost)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatAttributesSummary(product.category_name, product.attributes) || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                product.stock <= 5
                                  ? "bg-red-100 text-red-700"
                                  : product.stock <= 20
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {product.stock} uds
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openEdit(product)}
                              className="mr-2 text-indigo-600 hover:underline"
                            >
                              Editar
                            </button>
                            {profile?.role === "admin_org" && (
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`¿Eliminar "${product.name}"?`)) return;
                                  const { error } = await deleteProduct(product.id);
                                  if (error) setMessage({ type: "error", text: error.message });
                                  else await loadAll();
                                }}
                                className="text-red-600 hover:underline"
                              >
                                Eliminar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function CatalogPanel({
  title,
  items,
  name,
  setName,
  editing,
  setEditing,
  onSave,
  onDelete,
  saving,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">{editing ? `Editar ${title.slice(0, -1)}` : `Nueva ${title.slice(0, -1)}`}</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Nombre de ${title.toLowerCase().slice(0, -1)}`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {editing ? "Actualizar" : "Crear"}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setName("");
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">{title} registradas</h2>
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <span>{item.name}</span>
              <div>
                <button
                  onClick={() => {
                    setEditing(item);
                    setName(item.name);
                  }}
                  className="mr-2 text-indigo-600 text-sm hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="text-red-600 text-sm hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProductForm({
  form,
  setForm,
  editing,
  previewCodes,
  categories,
  presentations,
  currency,
  setCurrency,
  currencies,
  currencyConfig,
  branch,
  saving,
  onImageChange,
  onSubmit,
  onCancel,
}) {
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const attributeSchema = getCategoryAttributeSchema(selectedCategory?.name);

  function handleCategoryChange(categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    setForm({
      ...form,
      category_id: categoryId,
      attributes: getEmptyAttributes(cat?.name),
    });
  }

  function setAttribute(key, value) {
    setForm((prev) => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }));
  }

  return (
    <div className="mb-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-lg font-semibold">
        {editing ? "Editar producto" : "Nuevo producto"}
      </h2>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Nombre *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Ej. Jugo de Naranja"
          />
        </div>

        {!editing && form.name.trim() && (
          <div className="sm:col-span-2 rounded-lg bg-indigo-50 px-4 py-3 text-sm">
            <p className="font-semibold text-indigo-700">Códigos automáticos</p>
            <p>SKU: <span className="font-mono">{previewCodes.sku}</span></p>
            <p>Barras: <span className="font-mono">{previewCodes.barcode}</span></p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Categoría *</label>
          <select
            required
            value={form.category_id}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Seleccionar...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Presentación *</label>
          <select
            required
            value={form.presentation_id}
            onChange={(e) => setForm({ ...form, presentation_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Seleccionar...</option>
            {presentations.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Imagen del producto</label>
          <div className="flex items-center gap-4">
            <ProductImage src={form.image_url} name={form.name} size="lg" />
            <input
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className="text-sm text-slate-600"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Moneda</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {Object.values(currencies).map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Precio de venta ({currencyConfig.symbol})</label>
          <input type="number" min="0" step="0.01" required value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Precio de costo ({currencyConfig.symbol})</label>
          <input type="number" min="0" step="0.01" required value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        {attributeSchema.length > 0 && (
          <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-indigo-800">
              Atributos — {selectedCategory?.name}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {attributeSchema.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium">
                    {field.label}{field.required ? " *" : ""}
                  </label>
                  {field.type === "select" ? (
                    <select
                      required={field.required}
                      value={form.attributes?.[field.key] || ""}
                      onChange={(e) => setAttribute(field.key, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="">Seleccionar...</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === "date" ? "date" : "text"}
                      required={field.required}
                      value={form.attributes?.[field.key] || ""}
                      onChange={(e) => setAttribute(field.key, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Stock ({branch?.name})</label>
          <input type="number" min="0" required value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
