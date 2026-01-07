import { supabase } from "@/lib/customSupabaseClient";
import {
  initOfflineDb,
  getPendingActions,
  markActionDone,
  markActionFailed,
} from "@/lib/offlineDb";

// Helpers
const isLocalId = (id) => typeof id === "string" && id.startsWith("local-");

async function replaceIdInStore(storeName, oldId, newId) {
  const db = await initOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const row = await tx.store.get(oldId);
  if (row) {
    await tx.store.delete(oldId);
    await tx.store.put({ ...row, id: newId });
  }
  await tx.done;
}

async function replaceCategoryIdInProducts(oldCategoryId, newCategoryId) {
  const db = await initOfflineDb();
  const tx = db.transaction("products", "readwrite");
  const all = await tx.store.getAll();
  for (const p of all) {
    if (p.category_id === oldCategoryId) {
      await tx.store.put({ ...p, category_id: newCategoryId });
    }
  }
  await tx.done;
}

/**
 * ✅ CLAVE: si creamos una fila remota (id real), todas las acciones pendientes
 * que apuntaban al id local (attendance:update/delete) deben pasar a apuntar al id real.
 */
async function replaceIdInPendingSync(oldId, newId) {
  const db = await initOfflineDb();

  // Todas las acciones pendientes
  const pending = await db.getAllFromIndex("pending_sync", "status", "pending");
  if (!pending?.length) return;

  const tx = db.transaction("pending_sync", "readwrite");

  for (const a of pending) {
    if (!a?.type?.startsWith("attendance:")) continue;

    const p = a.payload || {};
    if (p.id === oldId) {
      a.payload = { ...p, id: newId };
      await tx.store.put(a);
    }
  }

  await tx.done;
}

function cleanAttendancePayload(payload) {
  // Si viene con "employees" embebido desde el UI, lo sacamos
  const { employees, ...clean } = payload || {};
  return clean;
}

export async function syncPendingActions() {
  const actions = await getPendingActions();
  if (!actions.length) return { synced: 0 };

  let synced = 0;

  for (const a of actions) {
    try {
      // -------------------------
      // ATTENDANCE (JORNADAS)
      // -------------------------
      if (a.type === "attendance:create") {
        const payload = cleanAttendancePayload(a.payload);
        const { id, ...insertRow } = payload;

        const { data: created, error } = await supabase
          .from("attendance_logs")
          .insert([insertRow])
          .select()
          .single();

        if (error) throw error;

        // ✅ Si generaste ID local:
        // 1) reemplazar en IDB attendance_logs
        // 2) IMPORTANTÍSIMO: reemplazar en la cola pending_sync (updates/deletes que apunten al id local)
        if (isLocalId(id)) {
          await replaceIdInStore("attendance_logs", id, created.id);
          await replaceIdInPendingSync(id, created.id);
        }

        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "attendance:update") {
        const payload = cleanAttendancePayload(a.payload);
        const { id, ...patch } = payload;

        // Si sigue siendo local acá, NO lo marcamos como done.
        // Lo dejamos pendiente porque significa que todavía no se resolvió el create -> id real.
        if (isLocalId(id)) {
          // lo saltamos (queda pending) para que en el próximo sync se ejecute con id real
          continue;
        }

        const { error } = await supabase
          .from("attendance_logs")
          .update(patch)
          .eq("id", id);

        if (error) throw error;

        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "attendance:delete") {
        const { id } = a.payload || {};

        if (!id) {
          await markActionDone(a.id);
          synced++;
          continue;
        }

        // Igual que update: si todavía es local, lo dejamos pending (no lo tiramos).
        if (isLocalId(id)) {
          continue;
        }

        const { error } = await supabase.from("attendance_logs").delete().eq("id", id);
        if (error) throw error;

        // Limpieza local opcional
        try {
          const db = await initOfflineDb();
          await db.delete("attendance_logs", id);
        } catch (_) {}

        await markActionDone(a.id);
        synced++;
        continue;
      }

      // -------------------------
      // SALES
      // -------------------------
      if (a.type === "sale:create") {
        const { branch_id, customer_name, total, payment_method, items, localSaleId } = a.payload;

        const { data: sale, error: saleError } = await supabase
          .from("sales")
          .insert([{ branch_id, customer_name, total, payment_method }])
          .select()
          .single();

        if (saleError) throw saleError;

        const saleItems = (items || []).map((it) => ({
          sale_id: sale.id,
          product_id: it.is_custom ? null : it.id,
          product_name: it.name,
          quantity: it.quantity,
          unit_price: it.price,
          is_custom: it.is_custom,
        }));

        const { error: itemsError } = await supabase.from("sale_items").insert(saleItems);
        if (itemsError) throw itemsError;

        const db = await initOfflineDb();
        if (localSaleId) {
          const tx = db.transaction(["sales_local", "sale_items_local"], "readwrite");
          await tx.objectStore("sales_local").delete(localSaleId);

          const itemStore = tx.objectStore("sale_items_local");
          const index = itemStore.index("sale_id");
          const itemKeys = await index.getAllKeys(localSaleId);
          for (const key of itemKeys) {
            await itemStore.delete(key);
          }
          await tx.done;
        }

        await markActionDone(a.id);
        synced++;
        continue;
      }

      // -------------------------
      // CATEGORIES
      // -------------------------
      if (a.type === "category:create") {
        const { id, ...payload } = a.payload;

        const { data: created, error } = await supabase
          .from("categories")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;

        if (isLocalId(id)) {
          await replaceIdInStore("categories", id, created.id);
          await replaceCategoryIdInProducts(id, created.id);
        }

        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "category:update") {
        const { id, ...payload } = a.payload;
        if (isLocalId(id)) {
          await markActionDone(a.id);
          synced++;
          continue;
        }
        const { error } = await supabase.from("categories").update(payload).eq("id", id);
        if (error) throw error;
        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "category:delete") {
        const { id } = a.payload;
        if (isLocalId(id)) {
          await markActionDone(a.id);
          synced++;
          continue;
        }
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) throw error;
        await markActionDone(a.id);
        synced++;
        continue;
      }

      // -------------------------
      // PRODUCTS
      // -------------------------
      if (a.type === "product:create") {
        const { id, ...payload } = a.payload;
        const { data: created, error } = await supabase
          .from("products")
          .insert([payload])
          .select()
          .single();
        if (error) throw error;

        if (isLocalId(id)) {
          await replaceIdInStore("products", id, created.id);
        }
        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "product:update") {
        const { id, ...payload } = a.payload;
        if (isLocalId(id)) {
          await markActionDone(a.id);
          synced++;
          continue;
        }
        const { error } = await supabase.from("products").update(payload).eq("id", id);
        if (error) throw error;
        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "product:delete") {
        const { id } = a.payload;
        if (isLocalId(id)) {
          await markActionDone(a.id);
          synced++;
          continue;
        }
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
        await markActionDone(a.id);
        synced++;
        continue;
      }

      // -------------------------
      // ORDERS
      // -------------------------
      if (a.type === "order:create") {
        const payload = a.payload;
        const { error } = await supabase.from("orders").insert([payload]);
        if (error) throw error;

        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "order:update") {
        const { id, patch } = a.payload;
        const { error } = await supabase.from("orders").update(patch).eq("id", id);
        if (error) throw error;

        await markActionDone(a.id);
        synced++;
        continue;
      }

      if (a.type === "order:delete") {
        const { id } = a.payload;
        const { error } = await supabase.from("orders").delete().eq("id", id);
        if (error) throw error;

        await markActionDone(a.id);
        synced++;
        continue;
      }

      // -------------------------
      // DEFAULT
      // -------------------------
      await markActionDone(a.id);
      synced++;
    } catch (err) {
      await markActionFailed(a.id, err);
    }
  }

  // evento global
  try {
    window.dispatchEvent(new CustomEvent("offline:sync-complete", { detail: { synced } }));
  } catch (e) {
    console.error("Error dispatching sync event", e);
  }

  return { synced };
}
