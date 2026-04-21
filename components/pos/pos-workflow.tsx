'use client';

import { useMemo, useState, useTransition } from 'react';
import { finalizeSaleAction } from '@/app/(dashboard)/waiter/pos/actions';
import { EmptyState } from '@/components/ui/fryva-ui';

type MenuItem = {
  id: number;
  name: string;
  selling_price: number;
  category_name: string;
};

type PosWorkflowProps = {
  menuItems: MenuItem[];
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export function PosWorkflow({ menuItems }: PosWorkflowProps) {
  const [cart, setCart] = useState<Array<{ item: MenuItem; quantity: number }>>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'debt'>('cash');
  const [saleNote, setSaleNote] = useState('');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.item.selling_price, 0), [cart]);

  const addItem = (item: MenuItem) => {
    setCart((prev) => {
      const index = prev.findIndex((line) => line.item.id === item.id);
      if (index === -1) return [...prev, { item, quantity: 1 }];
      const next = [...prev];
      next[index] = { ...next[index], quantity: next[index].quantity + 1 };
      return next;
    });
  };

  const setQuantity = (itemId: number, quantity: number) => {
    setCart((prev) => prev.map((line) => (line.item.id === itemId ? { ...line, quantity } : line)).filter((line) => line.quantity > 0));
  };

  const clearSaleFields = () => {
    setCart([]);
    setSaleNote('');
    setDebtorName('');
    setDebtorPhone('');
    setDebtNote('');
  };

  const checkout = () => {
    setError(null);
    setFeedback(null);

    if (cart.length === 0) return setError('Cart is empty. Add at least one item.');
    if (paymentMethod === 'debt' && !debtorName.trim()) return setError('Debtor name is required for debt sales.');

    startTransition(async () => {
      const result = await finalizeSaleAction({
        items: cart.map((line) => ({ menu_item_id: line.item.id, quantity: line.quantity })),
        payment_method: paymentMethod,
        note: saleNote || undefined,
        debtor_name: paymentMethod === 'debt' ? debtorName : undefined,
        debtor_phone: paymentMethod === 'debt' ? debtorPhone : undefined,
        debt_note: paymentMethod === 'debt' ? debtNote : undefined,
      });

      if (!result.ok) return setError(result.error ?? 'Request failed.');

      setFeedback(`Sale ${result.data.sale_number} completed successfully.`);
      clearSaleFields();
    });
  };

  return (
    <div className="pos-layout">
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="section-title">Menu items</h2>
          <p className="section-subtitle">Tap to add quickly</p>
        </div>
        {menuItems.length === 0 ? (
          <EmptyState title="No active menu items" description="Activate menu items to start sales." />
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {menuItems.map((item) => (
              <button key={item.id} type="button" onClick={() => addItem(item)} className="row-card" style={{ textAlign: 'left', cursor: 'pointer' }}>
                <p style={{ margin: 0, fontWeight: 650 }}>{item.name}</p>
                <p className="section-subtitle" style={{ marginTop: 2 }}>{item.category_name}</p>
                <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{money(item.selling_price)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Cart & checkout</h2>
        {cart.length === 0 ? <EmptyState title="Cart is empty" description="Select items from the menu to start this sale." /> : (
          <div className="list-stack">
            {cart.map((line) => (
              <div key={line.item.id} className="row-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{line.item.name}</p>
                  <p className="section-subtitle" style={{ marginTop: 2 }}>{money(line.item.selling_price)} each</p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setQuantity(line.item.id, line.quantity - 1)}>-</button>
                  <input value={line.quantity} onChange={(e) => setQuantity(line.item.id, Number(e.target.value) || 0)} className="input" style={{ width: 62, textAlign: 'center' }} inputMode="numeric" />
                  <button type="button" className="btn btn-secondary" onClick={() => setQuantity(line.item.id, line.quantity + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="row-card" style={{ marginTop: 12 }}>
          <p style={{ display: 'flex', justifyContent: 'space-between', margin: 0 }}><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
        </div>

        <div className="list-stack" style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(['cash', 'mpesa', 'debt'] as const).map((method) => (
              <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`btn ${paymentMethod === method ? 'btn-primary' : 'btn-secondary'}`}>
                {method}
              </button>
            ))}
          </div>

          {paymentMethod === 'debt' ? (
            <>
              <input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} placeholder="Debtor name" className="input" />
              <input value={debtorPhone} onChange={(e) => setDebtorPhone(e.target.value)} placeholder="Phone (optional)" className="input" />
              <textarea value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="Debt note" className="textarea" />
            </>
          ) : null}

          <textarea value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="Sale note" className="textarea" />
          {error ? <p className="alert alert-error">{error}</p> : null}
          {feedback ? <p className="alert alert-success">{feedback}</p> : null}
          <button type="button" onClick={checkout} disabled={isPending} className="btn btn-primary" style={{ width: '100%' }}>
            {isPending ? 'Finalizing sale...' : 'Finalize sale'}
          </button>
        </div>
      </section>
    </div>
  );
}
