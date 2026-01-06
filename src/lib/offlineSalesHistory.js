import { initOfflineDb } from "@/lib/offlineDb";

export async function getLocalSalesForBranch(branchId) {
  const db = await initOfflineDb();
  const localSales = (await db.getAll("sales_local"))?.filter(s => s.branch_id === branchId) || [];

  // Para cada sale, traemos items
  const saleItemsStore = db.transaction("sale_items_local", "readonly").store;

  const enriched = [];
  for (const s of localSales) {
    const idx = saleItemsStore.index("sale_id");
    const items = await idx.getAll(s.id);

    enriched.push({
      ...s,
      // el historial espera sale.sale_items con { product_name, quantity, unit_price }
      sale_items: (items || []).map(it => ({
        product_id: it.product_id,
        product_name: it.name,
        quantity: it.quantity,
        unit_price: it.price,
      })),
      __local: true,
    });
  }

  return enriched;
}

/**
 * Merge:
 * - Si la venta es local (id empieza con local-), siempre entra
 * - Si hay ventas remotas, entran también
 * - Evitamos duplicados simples por id
 */
export function mergeSales(remoteSales = [], localSales = []) {
  const map = new Map();

  for (const s of remoteSales) map.set(s.id, { ...s, __local: false });
  for (const s of localSales) {
    if (!map.has(s.id)) map.set(s.id, s);
  }

  // orden: created_at desc (local y remoto)
  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return db - da;
  });
}
