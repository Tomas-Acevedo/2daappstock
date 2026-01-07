import { openDB } from "idb";

const DB_NAME = "gestify_offline_db";
const DB_VERSION = 4; // ✅ Subimos versión para crear employees + attendance_logs

export async function initOfflineDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains("products"))
        db.createObjectStore("products", { keyPath: "id" });

      if (!db.objectStoreNames.contains("categories"))
        db.createObjectStore("categories", { keyPath: "id" });

      if (!db.objectStoreNames.contains("payment_methods"))
        db.createObjectStore("payment_methods", { keyPath: "id" });

      if (!db.objectStoreNames.contains("branches"))
        db.createObjectStore("branches", { keyPath: "id" });

      if (!db.objectStoreNames.contains("orders"))
        db.createObjectStore("orders", { keyPath: "id" });

      if (!db.objectStoreNames.contains("sales_local"))
        db.createObjectStore("sales_local", { keyPath: "id" });

      if (!db.objectStoreNames.contains("sale_items_local")) {
        const st = db.createObjectStore("sale_items_local", { keyPath: "id", autoIncrement: true });
        st.createIndex("sale_id", "sale_id");
      }

      if (!db.objectStoreNames.contains("pending_sync")) {
        const st = db.createObjectStore("pending_sync", { keyPath: "id", autoIncrement: true });
        st.createIndex("status", "status");
        st.createIndex("created_at", "created_at");
      }

      if (!db.objectStoreNames.contains("branch_config"))
        db.createObjectStore("branch_config", { keyPath: "id" });

      if (!db.objectStoreNames.contains("cash_registers")) {
        const st = db.createObjectStore("cash_registers", { keyPath: "id" });
        st.createIndex("branch_id", "branch_id");
      }

      if (!db.objectStoreNames.contains("cash_expenses")) {
        const st = db.createObjectStore("cash_expenses", { keyPath: "id" });
        st.createIndex("branch_id", "branch_id");
      }

      if (!db.objectStoreNames.contains("sales_cache")) {
        const st = db.createObjectStore("sales_cache", { keyPath: "id" });
        st.createIndex("branch_id", "branch_id");
      }

      if (!db.objectStoreNames.contains("sale_items_cache")) {
        const st = db.createObjectStore("sale_items_cache", { keyPath: "id", autoIncrement: true });
        st.createIndex("sale_id", "sale_id");
      }

      // ✅ NUEVO: Employees (para Jornadas offline)
      if (!db.objectStoreNames.contains("employees")) {
        const st = db.createObjectStore("employees", { keyPath: "id" });
        st.createIndex("branch_id", "branch_id");
      } else {
        // Por si existía sin índice
        const st = db.transaction?.objectStore?.("employees"); // no siempre disponible acá, por eso abajo no dependemos
        // (no hacemos nada en upgrade si ya existe; la mayoría de casos va a entrar por "create")
      }

      // ✅ NUEVO: Attendance logs (para Jornadas offline)
      if (!db.objectStoreNames.contains("attendance_logs")) {
        const st = db.createObjectStore("attendance_logs", { keyPath: "id" });
        st.createIndex("branch_id", "branch_id");
        st.createIndex("date", "date");
        st.createIndex("employee_id", "employee_id");
      }
    },
  });
}

// ---------- Cache helpers ----------
async function putMany(storeName, rows) {
  const db = await initOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  for (const r of rows) tx.store.put(r);
  await tx.done;
}

export async function cacheProducts(rows) { return putMany("products", rows || []); }
export async function cacheCategories(rows) { return putMany("categories", rows || []); }
export async function cachePaymentMethods(rows) { return putMany("payment_methods", rows || []); }
export async function cacheBranches(rows) { return putMany("branches", rows || []); }

// ✅ NUEVO: cacheEmployees (lo usa JornadasPage)
export async function cacheEmployees(rows) {
  return putMany("employees", rows || []);
}

// ✅ NUEVO: cacheAttendance (lo usa JornadasPage)  ✅ ESTE ERA EL ERROR
export async function cacheAttendance(rows) {
  return putMany("attendance_logs", rows || []);
}

// Cache Orders mejorado: Reemplazo total para evitar "fantasmas"
export async function cacheOrders(rows) {
  const db = await initOfflineDb();
  const tx = db.transaction("orders", "readwrite");
  await tx.store.clear();
  for (const r of (rows || [])) tx.store.put(r);
  await tx.done;
}

export async function cacheBranchConfig(row) {
  const db = await initOfflineDb();
  await db.put("branch_config", row);
}

export async function getBranchConfigOffline(branchId) {
  const db = await initOfflineDb();
  return db.get("branch_config", branchId);
}

export async function upsertLocalCashRegister(row) {
  const db = await initOfflineDb();
  await db.put("cash_registers", row);
}

export async function upsertLocalCashExpense(row) {
  const db = await initOfflineDb();
  await db.put("cash_expenses", row);
}

export async function deleteLocalCashExpense(id) {
  const db = await initOfflineDb();
  await db.delete("cash_expenses", id);
}

// ✅ CORRECCIÓN: Cache de ítems usando add para autoincremento
export async function cacheSalesAndItems(salesRows) {
  const db = await initOfflineDb();
  const txS = db.transaction("sales_cache", "readwrite");
  const txI = db.transaction("sale_items_cache", "readwrite");

  for (const s of (salesRows || [])) {
    const { sale_items, ...sale } = s;
    await txS.store.put(sale);

    if (sale_items) {
      for (const it of sale_items) {
        const { id, ...itemData } = it; // Descartamos ID real para el autoincrement
        await txI.store.add({ ...itemData, sale_id: sale.id });
      }
    }
  }

  await txS.done;
  await txI.done;
}

export async function getCashDayOffline({ branchId, date }) {
  const db = await initOfflineDb();
  const isMatch = (isoStr) => (isoStr || "").slice(0, 10) === date;

  const registers = (await db.getAllFromIndex("cash_registers", "branch_id", branchId))
    .filter(r => isMatch(r.created_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const expenses = (await db.getAllFromIndex("cash_expenses", "branch_id", branchId))
    .filter(e => isMatch(e.created_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const localSales = (await db.getAll("sales_local"))
    .filter(s => s.branch_id === branchId && isMatch(s.created_at));

  const cachedSales = (await db.getAllFromIndex("sales_cache", "branch_id", branchId))
    .filter(s => isMatch(s.created_at));

  const allSales = [...localSales, ...cachedSales]
    .filter(s => String(s.payment_method || "").toLowerCase().includes("efectivo"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const finalSales = [];
  for (const s of allSales) {
    const itemsLocal = await db.getAllFromIndex("sale_items_local", "sale_id", s.id);
    const itemsCache = await db.getAllFromIndex("sale_items_cache", "sale_id", s.id);
    finalSales.push({ ...s, sale_items: [...itemsLocal, ...itemsCache] });
  }

  return { register: registers[0] || null, expenses, cashSales: finalSales };
}

export async function getAll(storeName) {
  const db = await initOfflineDb();
  return db.getAll(storeName);
}

export async function getProductsByBranch(branchId) {
  const all = await getAll("products");
  return all.filter(p => p.branch_id === branchId);
}

export async function getCategoriesByBranch(branchId) {
  const all = await getAll("categories");
  return all.filter(c => c.branch_id === branchId);
}

export async function getPaymentMethodsByBranch(branchId) {
  const all = await getAll("payment_methods");
  return all.filter(m => m.branch_id === branchId && m.is_active);
}

export async function getBranchById(branchId) {
  const db = await initOfflineDb();
  return db.get("branches", branchId);
}

export async function upsertLocalOrder(order) {
  const db = await initOfflineDb();
  await db.put("orders", order);
}

export async function deleteLocalOrder(orderId) {
  const db = await initOfflineDb();
  await db.delete("orders", orderId);
}

function includesCI(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function inDateRange(orderDateIso, start, end) {
  if (!start && !end) return true;
  const d = String(orderDateIso || "").slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export async function getOrdersOffline({
  branchId,
  currentPage = 1,
  itemsPerPage = 15,
  searchTerm = "",
  dateFilter = { start: "", end: "" },
}) {
  let all = await getAll("orders");
  all = (all || []).filter(o => o.branch_id === branchId);

  if (searchTerm) {
    all = all.filter(o => includesCI(o.client_name, searchTerm) || includesCI(o.notes, searchTerm));
  }

  all = all.filter(o => inDateRange(o.order_date, dateFilter?.start, dateFilter?.end));

  all.sort((a, b) => {
    const ad = String(a.order_date || "");
    const bd = String(b.order_date || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  const totalCount = all.length;
  const from = (currentPage - 1) * itemsPerPage;
  const pageRows = all.slice(from, from + itemsPerPage);

  return { rows: pageRows, totalCount };
}

export async function computeOrdersSummaryOffline({ branchId, dateFilter = { start: "", end: "" } }) {
  let all = await getAll("orders");
  all = (all || []).filter(o => o.branch_id === branchId && inDateRange(o.order_date, dateFilter?.start, dateFilter?.end));

  const pendingARS = all.filter(o => o.currency === "ARS").reduce((acc, o) => acc + Number(o.pending_amount || 0), 0);
  const pendingUSD = all.filter(o => o.currency === "USD").reduce((acc, o) => acc + Number(o.pending_amount || 0), 0);

  return { pendingARS, pendingUSD };
}

export async function decrementLocalStock(items) {
  const db = await initOfflineDb();
  const tx = db.transaction("products", "readwrite");

  for (const it of items) {
    const p = await tx.store.get(it.product_id);
    if (p) {
      p.stock = Math.max(0, Number(p.stock || 0) - Number(it.quantity || 0));
      tx.store.put(p);
    }
  }

  await tx.done;
}

export async function saveLocalSale(sale, saleItems) {
  const db = await initOfflineDb();

  const tx1 = db.transaction("sales_local", "readwrite");
  await tx1.store.put(sale);
  await tx1.done;

  const tx2 = db.transaction("sale_items_local", "readwrite");
  for (const it of saleItems) await tx2.store.add(it);
  await tx2.done;
}

export async function enqueueAction(action) {
  const db = await initOfflineDb();

  const payload = {
    ...action,
    status: "pending",
    created_at: new Date().toISOString(),
    tries: 0,
    last_error: null,
  };

  await db.add("pending_sync", payload);
}

export async function getPendingCount() {
  const db = await initOfflineDb();
  const all = await db.getAllFromIndex("pending_sync", "status", "pending");
  return all.length;
}

export async function getPendingActions() {
  const db = await initOfflineDb();
  const all = await db.getAllFromIndex("pending_sync", "status", "pending");
  return all.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}

export async function markActionDone(id) {
  const db = await initOfflineDb();
  const row = await db.get("pending_sync", id);
  if (!row) return;

  row.status = "done";
  row.done_at = new Date().toISOString();

  await db.put("pending_sync", row);
}

export async function markActionFailed(id, err) {
  const db = await initOfflineDb();
  const row = await db.get("pending_sync", id);
  if (!row) return;

  row.tries = Number(row.tries || 0) + 1;
  row.last_error = String(err?.message || err || "Unknown error");

  await db.put("pending_sync", row);
}
