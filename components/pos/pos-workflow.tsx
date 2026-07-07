'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { finalizeSaleAction } from '@/app/(dashboard)/waiter/pos/actions';
import { EmptyState } from '@/components/ui/fryva-ui';

type MenuItem = { id: number; name: string; selling_price: number; category_name: string };
type PaymentMethod = 'cash' | 'mpesa' | 'debt' | 'staff';
const STAFF_OPTIONS = ['Amo', 'Tallia', 'Eliza', 'Kanjaa', 'Others'] as const;

function money(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value); }

export function PosWorkflow({ menuItems }: { menuItems: MenuItem[] }) {
  const [cart, setCart] = useState<Array<{ item: MenuItem; quantity: number }>>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saleNote, setSaleNote] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [staffOption, setStaffOption] = useState<(typeof STAFF_OPTIONS)[number] | ''>('');
  const [staffName, setStaffName] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.item.selling_price, 0), [cart]);
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((item) => item.name.toLowerCase().includes(q) || item.category_name.toLowerCase().includes(q));
  }, [menuItems, search]);

  const addItem = (item: MenuItem) => {
    setCart((prev) => {
      const index = prev.findIndex((line) => line.item.id === item.id);
      if (index === -1) return [...prev, { item, quantity: 1 }];
      const next = [...prev]; next[index] = { ...next[index], quantity: next[index].quantity + 1 }; return next;
    });
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const setQuantity = (itemId: number, quantity: number) => setCart((prev) => prev.map((line) => (line.item.id === itemId ? { ...line, quantity } : line)).filter((line) => line.quantity > 0));
  const clearSaleFields = () => { setCart([]); setSaleNote(''); setDebtorName(''); setDebtorPhone(''); setDebtNote(''); setStaffOption(''); setStaffName(''); setStaffNote(''); setConfirming(false); };
  const validate = () => {
    if (cart.length === 0) return 'Cart is empty. Add at least one item.';
    if (paymentMethod === 'debt' && !debtorName.trim()) return 'Debtor name is required for debt sales.';
    if (paymentMethod === 'staff' && !staffOption) return 'Select the staff member for this meal.';
    return null;
  };
  const requestCheckout = () => { setError(null); setFeedback(null); const validation = validate(); if (validation) return setError(validation); setConfirming(true); };
  const checkout = () => {
    const validation = validate(); if (validation) { setConfirming(false); return setError(validation); }
    startTransition(async () => {
      const result = await finalizeSaleAction({
        items: cart.map((line) => ({ menu_item_id: line.item.id, quantity: line.quantity })), payment_method: paymentMethod, note: saleNote || undefined,
        debtor_name: paymentMethod === 'debt' ? debtorName : undefined, debtor_phone: paymentMethod === 'debt' ? debtorPhone : undefined, debt_note: paymentMethod === 'debt' ? debtNote : undefined,
        staff_option: paymentMethod === 'staff' ? staffOption || undefined : undefined, staff_name: paymentMethod === 'staff' ? staffName || undefined : undefined, staff_note: paymentMethod === 'staff' ? staffNote || undefined : undefined,
      });
      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setFeedback(`${paymentMethod === 'staff' ? 'Staff meal' : 'Sale'} ${result.data.sale_number} completed successfully.`); clearSaleFields();
    });
  };

  const paymentCopy = paymentMethod === 'cash' ? 'Payment: Cash received.' : paymentMethod === 'mpesa' ? 'Payment: Confirmed on Mpesa.' : paymentMethod === 'debt' ? `Debt customer: ${debtorName}.` : `Staff: ${staffOption === 'Others' ? (staffName || 'Others') : staffOption}.`;

  return <div className="pos-layout">
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 className="section-title">Menu items</h2><p className="section-subtitle">Search, tap, sell</p></div>
      <div style={{ position: 'sticky', top: 84, zIndex: 5, background: 'white', padding: '0 0 12px' }}>
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && visibleItems[0]) { e.preventDefault(); addItem(visibleItems[0]); } if (e.key === 'Escape') setSearch(''); }} placeholder="Search menu by item or category" className="input" aria-label="Search menu items" />
        {search ? <p className="section-subtitle" style={{ marginTop: 6 }}>{visibleItems.length} result{visibleItems.length === 1 ? '' : 's'} · Enter adds first result · Esc clears</p> : null}
      </div>
      {menuItems.length === 0 ? <EmptyState title="No active menu items" description="Activate menu items to start sales." /> : <div className="pos-menu-grid">
        {visibleItems.map((item) => <button key={item.id} type="button" onClick={() => addItem(item)} className="row-card" style={{ textAlign: 'left', cursor: 'pointer', minHeight: 112 }}><p style={{ margin: 0, fontWeight: 650 }}>{item.name}</p><p className="section-subtitle" style={{ marginTop: 2 }}>{item.category_name}</p><p style={{ margin: '8px 0 0', fontWeight: 700 }}>{money(item.selling_price)}</p></button>)}
      </div>}
    </section>
    <section className="panel" style={{ position: 'sticky', top: 96, alignSelf: 'start' }}>
      <h2 className="section-title">Cart & checkout</h2>
      {cart.length === 0 ? <EmptyState title="Cart is empty" description="Select items from the menu to start this sale." /> : <div className="list-stack">{cart.map((line) => <div key={line.item.id} className="row-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10 }}><div><p style={{ margin: 0, fontWeight: 600 }}>{line.item.name}</p><p className="section-subtitle" style={{ marginTop: 2 }}>{money(line.item.selling_price)} each</p></div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><button type="button" className="btn btn-secondary" onClick={() => setQuantity(line.item.id, line.quantity - 1)}>-</button><input value={line.quantity} onChange={(e) => setQuantity(line.item.id, Number(e.target.value) || 0)} className="input" style={{ width: 62, textAlign: 'center' }} inputMode="numeric" /><button type="button" className="btn btn-secondary" onClick={() => setQuantity(line.item.id, line.quantity + 1)}>+</button></div></div>)}</div>}
      <div className="row-card" style={{ marginTop: 12 }}><p style={{ display: 'flex', justifyContent: 'space-between', margin: 0 }}><span>Subtotal</span><strong>{money(subtotal)}</strong></p></div>
      <div className="list-stack pos-cart-actions" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>{(['cash', 'mpesa', 'debt', 'staff'] as const).map((method) => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`btn ${paymentMethod === method ? 'btn-primary' : 'btn-secondary'}`}>{method}</button>)}</div>
        {paymentMethod === 'debt' ? <><input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} placeholder="Debtor name" className="input" /><input value={debtorPhone} onChange={(e) => setDebtorPhone(e.target.value)} placeholder="Phone (optional)" className="input" /><textarea value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="Debt note" className="textarea" /></> : null}
        {paymentMethod === 'staff' ? <><select value={staffOption} onChange={(e) => setStaffOption(e.target.value as any)} className="select"><option value="">Select staff member</option>{STAFF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{staffOption === 'Others' ? <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff name / note (optional)" className="input" /> : null}<textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Staff meal note (optional)" className="textarea" /></> : null}
        <textarea value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="Sale note" className="textarea" />
        {error ? <p className="alert alert-error">{error}</p> : null}{feedback ? <p className="alert alert-success">{feedback}</p> : null}
        <button type="button" onClick={requestCheckout} disabled={isPending} className="btn btn-primary" style={{ width: '100%', minHeight: 48 }}>Review & confirm</button>
      </div>
    </section>
    {confirming ? <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><h2 className="section-title">{paymentMethod === 'staff' ? 'Confirm Staff Meal' : 'Confirm Sale'}</h2><p>{paymentMethod === 'staff' ? 'Confirm staff meal:' : 'Confirm you have sold:'}</p><ul>{cart.map((line) => <li key={line.item.id}>{line.quantity} {line.item.name}</li>)}</ul><p><strong>{paymentMethod === 'staff' ? 'Total value' : 'Total'}: {money(subtotal)}</strong></p><p>{paymentCopy}</p><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancel/Edit</button><button type="button" className="btn btn-primary" disabled={isPending} onClick={checkout}>{isPending ? 'Finalizing...' : 'Confirm'}</button></div></div></div> : null}
  </div>;
}
