import { supabase } from "@/lib/customSupabaseClient";
import {
  initOfflineDb,
  getPendingActions,
  markActionDone,
  markActionFailed,
} from "@/lib/offlineDb";

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

export async function syncPendingActions() {
  const actions = await getPendingActions();
  if (!actions.length) return { synced: 0 };

  let synced = 0;

  for (const a of actions) {
    try {
      // SALES
      if (a.type === "sale:create") {
        const { branch_id, customer_name, total, payment_method, items } = a.payload;
        const { data: sale, error: saleError } = await supabase.from("sales").insert([{ branch_id, customer_name, total, payment_method }]).select().single();
        if (saleError) throw saleError;
        const saleItems = (items || []).map((it) => ({
          sale_id: sale.id,
          product_id: it.is_custom ? null : it.id,
          product_name: it.name,
          quantity: it.quantity,
          unit_price: it.price,
          is_custom: it.is_custom,
        }));
        await supabase.from("sale_items").insert(saleItems);
        const stockItems = (items || []).filter((i) => !i.is_custom);
        if (stockItems.length > 0) {
          await supabase.rpc("apply_sale_stock", { p_branch_id: branch_id, p_items: stockItems.map(i => ({ product_id: i.id, quantity: i.quantity })) });
        }
        await markActionDone(a.id); synced++; continue;
      }

      // CATEGORIES & PRODUCTS
      if (a.type === "category:create") {
        const { id, ...payload } = a.payload;
        const { data: created, error } = await supabase.from("categories").insert([payload]).select().single();
        if (error) throw error;
        if (isLocalId(id)) { await replaceIdInStore("categories", id, created.id); await replaceCategoryIdInProducts(id, created.id); }
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "category:update") {
        const { id, ...payload } = a.payload;
        if (!isLocalId(id)) await supabase.from("categories").update(payload).eq("id", id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "category:delete") {
        const { id } = a.payload;
        if (!isLocalId(id)) await supabase.from("categories").delete().eq("id", id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "product:create") {
        const { id, ...payload } = a.payload;
        const { data: created, error } = await supabase.from("products").insert([payload]).select().single();
        if (error) throw error;
        if (isLocalId(id)) await replaceIdInStore("products", id, created.id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "product:update") {
        const { id, ...payload } = a.payload;
        if (!isLocalId(id)) await supabase.from("products").update(payload).eq("id", id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "product:delete") {
        const { id } = a.payload;
        if (!isLocalId(id)) await supabase.from("products").delete().eq("id", id);
        await markActionDone(a.id); synced++; continue;
      }

      // ✅ ORDERS CORREGIDO: Manejo de IDs locales para evitar duplicados
      if (a.type === "order:create") {
        const { _local_id, id: local_id_prop, ...payload } = a.payload;
        const { data: created, error } = await supabase.from("orders").insert([payload]).select().single();
        if (error) throw error;
        const finalLocalId = _local_id || local_id_prop;
        if (finalLocalId && isLocalId(finalLocalId)) {
          await replaceIdInStore("orders", finalLocalId, created.id);
        }
        await markActionDone(a.id); synced++; continue;
      }

      if (a.type === "order:update") {
        const { id, patch } = a.payload;
        if (!isLocalId(id)) {
          const { error } = await supabase.from("orders").update(patch).eq("id", id);
          if (error) throw error;
        }
        await markActionDone(a.id); synced++; continue;
      }

      if (a.type === "order:delete") {
        const { id } = a.payload;
        if (!isLocalId(id)) {
          const { error } = await supabase.from("orders").delete().eq("id", id);
          if (error) throw error;
        }
        await markActionDone(a.id); synced++; continue;
      }

      // CAJA Y EGRESOS
      if (a.type === "cash_register:create") {
        const { _local_id, ...payload } = a.payload;
        const { data: created, error } = await supabase.from("cash_registers").insert([payload]).select().single();
        if (error) throw error;
        if (_local_id) await replaceIdInStore("cash_registers", _local_id, created.id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "cash_expense:create") {
        const { _local_id, ...payload } = a.payload;
        const { data: created, error } = await supabase.from("cash_expenses").insert([payload]).select().single();
        if (error) throw error;
        if (_local_id) await replaceIdInStore("cash_expenses", _local_id, created.id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "cash_expense:delete") {
        await supabase.from("cash_expenses").delete().eq("id", a.payload.id);
        await markActionDone(a.id); synced++; continue;
      }
      if (a.type === "expense:create") {
        await supabase.from("expenses").insert([a.payload]);
        await markActionDone(a.id); synced++; continue;
      }

      await markActionDone(a.id);
      synced++;
    } catch (err) {
      await markActionFailed(a.id, err);
    }
  }

  try {
    window.dispatchEvent(new CustomEvent("offline:sync-complete", { detail: { synced } }));
  } catch (e) { console.error(e); }

  return { synced };
}