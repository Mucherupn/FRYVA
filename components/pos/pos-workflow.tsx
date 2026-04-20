'use client';

import { useMemo, useState, useTransition } from 'react';
import { finalizeSaleAction } from '@/app/(dashboard)/waiter/pos/actions';

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

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.item.selling_price, 0),
    [cart],
  );

  const addItem = (item: MenuItem) => {
    setCart((prev) => {
      const index = prev.findIndex((line) => line.item.id === item.id);
      if (index === -1) {
        return [...prev, { item, quantity: 1 }];
      }
      const next = [...prev];
      next[index] = { ...next[index], quantity: next[index].quantity + 1 };
      return next;
    });
  };

  const setQuantity = (itemId: number, quantity: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.item.id === itemId ? { ...line, quantity } : line))
        .filter((line) => line.quantity > 0),
    );
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

    if (cart.length === 0) {
      setError('Cart is empty. Add at least one item.');
      return;
    }

    if (paymentMethod === 'debt' && !debtorName.trim()) {
      setError('Debtor name is required for debt sales.');
      return;
    }

    startTransition(async () => {
      const result = await finalizeSaleAction({
        items: cart.map((line) => ({ menu_item_id: line.item.id, quantity: line.quantity })),
        payment_method: paymentMethod,
        note: saleNote || undefined,
        debtor_name: paymentMethod === 'debt' ? debtorName : undefined,
        debtor_phone: paymentMethod === 'debt' ? debtorPhone : undefined,
        debt_note: paymentMethod === 'debt' ? debtNote : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setFeedback(`Sale ${result.data.sale_number} completed successfully.`);
      clearSaleFields();
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-base font-semibold">Tap to add items</h2>
        {menuItems.length === 0 ? (
          <p className="rounded border border-dashed p-4 text-sm text-slate-500">No active menu items found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                className="rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-black"
              >
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-slate-500">{item.category_name}</p>
                <p className="mt-2 text-sm font-medium">{money(item.selling_price)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Cart summary</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-slate-500">Your cart is empty.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((line) => (
              <div key={line.item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded border p-3">
                <div>
                  <p className="text-sm font-semibold">{line.item.name}</p>
                  <p className="text-xs text-slate-500">{money(line.item.selling_price)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setQuantity(line.item.id, line.quantity - 1)} className="rounded border px-2">
                    -
                  </button>
                  <input
                    value={line.quantity}
                    onChange={(event) => setQuantity(line.item.id, Number(event.target.value) || 0)}
                    className="w-14 rounded border px-2 py-1 text-center text-sm"
                    inputMode="numeric"
                  />
                  <button type="button" onClick={() => setQuantity(line.item.id, line.quantity + 1)} className="rounded border px-2">
                    +
                  </button>
                  <button type="button" onClick={() => setQuantity(line.item.id, 0)} className="rounded border px-2 text-xs text-red-600">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></p>
          <p className="flex justify-between font-semibold"><span>Total</span><span>{money(subtotal)}</span></p>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">Checkout</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(['cash', 'mpesa', 'debt'] as const).map((method) => (
            <label key={method} className="flex items-center gap-2 rounded border p-3 text-sm capitalize">
              <input
                type="radio"
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
              />
              {method}
            </label>
          ))}
        </div>

        {paymentMethod === 'debt' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              placeholder="Debtor name (required)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              value={debtorPhone}
              onChange={(e) => setDebtorPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="rounded border px-3 py-2 text-sm"
            />
            <textarea
              value={debtNote}
              onChange={(e) => setDebtNote(e.target.value)}
              placeholder="Debt note (optional)"
              className="md:col-span-2 rounded border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
        ) : null}

        <textarea
          value={saleNote}
          onChange={(e) => setSaleNote(e.target.value)}
          placeholder="Sale note (optional)"
          className="w-full rounded border px-3 py-2 text-sm"
          rows={2}
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {feedback ? <p className="text-sm text-green-700">{feedback}</p> : null}

        <button
          type="button"
          onClick={checkout}
          disabled={isPending}
          className="w-full rounded bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? 'Finalizing sale...' : 'Finalize sale'}
        </button>
      </section>
    </div>
  );
}
