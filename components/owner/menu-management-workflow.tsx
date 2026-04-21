'use client';

import { useState, useTransition } from 'react';
import { createMenuItemAction, deleteMenuItemAction, updateMenuItemAction } from '@/app/(dashboard)/owner/menu/actions';

type MenuItemRow = {
  id: number;
  name: string;
  selling_price: number;
  category_name: string | null;
  active: boolean;
  available: boolean;
  stock_tracked: boolean;
  item_type: 'kitchen_prepared' | 'resale';
  sort_order: number;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export function MenuManagementWorkflow({ items }: { items: MenuItemRow[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createForm, setCreateForm] = useState({
    name: '',
    category_name: '',
    selling_price: '',
    sort_order: '',
    stock_tracked: false,
    item_type: 'kitchen_prepared' as 'kitchen_prepared' | 'resale',
    active: true,
    available: true,
  });

  const [drafts, setDrafts] = useState<Record<number, Omit<MenuItemRow, 'id'>>>(() => (
    Object.fromEntries(
      items.map((item) => [item.id, {
        name: item.name,
        selling_price: item.selling_price,
        category_name: item.category_name,
        active: item.active,
        available: item.available,
        stock_tracked: item.stock_tracked,
        item_type: item.item_type,
        sort_order: item.sort_order,
      }]),
    ) as Record<number, Omit<MenuItemRow, 'id'>>
  ));

  const setDraft = <K extends keyof Omit<MenuItemRow, 'id'>>(id: number, field: K, value: Omit<MenuItemRow, 'id'>[K]) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const createItem = () => {
    setError(null); setFeedback(null);
    startTransition(async () => {
      const result = await createMenuItemAction({
        ...createForm,
        selling_price: Number(createForm.selling_price),
        sort_order: Number(createForm.sort_order || 0),
      });

      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setFeedback('Menu item created successfully.');
      setCreateForm((prev) => ({ ...prev, name: '', selling_price: '', sort_order: '', category_name: '' }));
    });
  };

  const saveItem = (id: number) => {
    setError(null); setFeedback(null);
    startTransition(async () => {
      const row = drafts[id];
      const result = await updateMenuItemAction({
        id,
        ...row,
        selling_price: Number(row.selling_price),
        sort_order: Number(row.sort_order || 0),
        category_name: row.category_name ?? undefined,
      });
      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setFeedback('Menu item updated.');
      setEditingId(null);
    });
  };

  const removeItem = (id: number) => {
    setError(null); setFeedback(null);
    startTransition(async () => {
      const result = await deleteMenuItemAction(id);
      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setFeedback(result.archived ? 'Item has history and was archived (inactive/unavailable).' : 'Item deleted.');
    });
  };

  return (
    <>
      <section className="panel">
        <h2 className="section-title">Add menu item</h2>
        <div className="form-grid">
          <div className="form-col-4"><input className="input" placeholder="Name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} /></div>
          <div className="form-col-3"><input className="input" placeholder="Price" value={createForm.selling_price} onChange={(e) => setCreateForm({ ...createForm, selling_price: e.target.value })} /></div>
          <div className="form-col-3"><input className="input" placeholder="Category" value={createForm.category_name} onChange={(e) => setCreateForm({ ...createForm, category_name: e.target.value })} /></div>
          <div className="form-col-2"><input className="input" placeholder="Sort" value={createForm.sort_order} onChange={(e) => setCreateForm({ ...createForm, sort_order: e.target.value })} /></div>
          <div className="form-col-3"><select className="select" value={createForm.item_type} onChange={(e) => setCreateForm({ ...createForm, item_type: e.target.value as 'kitchen_prepared' | 'resale' })}><option value="kitchen_prepared">Kitchen prepared</option><option value="resale">Resale</option></select></div>
          <div className="form-col-3"><label className="section-subtitle"><input type="checkbox" checked={createForm.stock_tracked} onChange={(e) => setCreateForm({ ...createForm, stock_tracked: e.target.checked })} /> Stock tracked</label></div>
          <div className="form-col-3"><label className="section-subtitle"><input type="checkbox" checked={createForm.active} onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })} /> Active</label></div>
          <div className="form-col-3"><label className="section-subtitle"><input type="checkbox" checked={createForm.available} onChange={(e) => setCreateForm({ ...createForm, available: e.target.checked })} /> Available now</label></div>
        </div>
        <button type="button" className="btn btn-primary" onClick={createItem} disabled={isPending} style={{ marginTop: 10 }}>{isPending ? 'Saving...' : 'Create item'}</button>
      </section>

      <section className="panel">
        <h2 className="section-title">Menu items</h2>
        <div className="table-shell" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Category</th><th className="money">Price</th><th>Type</th><th>Status</th><th className="money">Sort</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const draft = drafts[item.id];
                return (
                  <tr key={item.id}>
                    <td>{isEditing ? <input className="input" value={draft.name} onChange={(e) => setDraft(item.id, 'name', e.target.value)} /> : item.name}</td>
                    <td>{isEditing ? <input className="input" value={draft.category_name ?? ''} onChange={(e) => setDraft(item.id, 'category_name', e.target.value || null)} /> : (item.category_name ?? 'Uncategorized')}</td>
                    <td className="money">{isEditing ? <input className="input" value={draft.selling_price} onChange={(e) => setDraft(item.id, 'selling_price', Number(e.target.value) || 0)} /> : money(item.selling_price)}</td>
                    <td>{isEditing ? <select className="select" value={draft.item_type} onChange={(e) => setDraft(item.id, 'item_type', e.target.value as 'kitchen_prepared' | 'resale')}><option value="kitchen_prepared">Kitchen</option><option value="resale">Resale</option></select> : item.item_type}</td>
                    <td>
                      {isEditing ? (
                        <div className="list-stack">
                          <label className="section-subtitle"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft(item.id, 'active', e.target.checked)} /> Active</label>
                          <label className="section-subtitle"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft(item.id, 'available', e.target.checked)} /> Available</label>
                          <label className="section-subtitle"><input type="checkbox" checked={draft.stock_tracked} onChange={(e) => setDraft(item.id, 'stock_tracked', e.target.checked)} /> Stock tracked</label>
                        </div>
                      ) : `${item.active ? 'Active' : 'Inactive'} / ${item.available ? 'Available' : 'Unavailable'}`}
                    </td>
                    <td className="money">{isEditing ? <input className="input" value={draft.sort_order} onChange={(e) => setDraft(item.id, 'sort_order', Number(e.target.value) || 0)} /> : item.sort_order}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {isEditing ? <button className="btn btn-primary" disabled={isPending} onClick={() => saveItem(item.id)}>Save</button> : <button className="btn btn-secondary" onClick={() => setEditingId(item.id)}>Edit</button>}
                        {isEditing ? <button className="btn btn-secondary" onClick={() => setEditingId(null)}>Cancel</button> : null}
                        <button className="btn btn-secondary" disabled={isPending} onClick={() => removeItem(item.id)}>Delete/Archive</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error ? <p className="alert alert-error" style={{ marginTop: 10 }}>{error}</p> : null}
        {feedback ? <p className="alert alert-success" style={{ marginTop: 10 }}>{feedback}</p> : null}
      </section>
    </>
  );
}
