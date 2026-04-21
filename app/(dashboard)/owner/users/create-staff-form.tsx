'use client';

import { useActionState, useMemo, useState } from 'react';
import { APP_ROLES } from '@/lib/auth/roles';
import { createUserAction, INITIAL_CREATE_STAFF_FORM_STATE } from './actions';

const FIELD_NAMES = ['full_name', 'email', 'password', 'confirm_password', 'role'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

export function CreateStaffForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, INITIAL_CREATE_STAFF_FORM_STATE);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<FieldName>>(new Set());

  const visibleFieldErrors = useMemo(() => {
    if (!state.fieldErrors) {
      return undefined;
    }

    const next: Partial<Record<FieldName, string>> = {};
    for (const fieldName of FIELD_NAMES) {
      if (!editedFields.has(fieldName) && state.fieldErrors[fieldName]) {
        next[fieldName] = state.fieldErrors[fieldName];
      }
    }

    return next;
  }, [editedFields, state.fieldErrors]);

  const handleFieldInput = (fieldName: FieldName) => {
    setEditedFields((current) => {
      if (current.has(fieldName)) {
        return current;
      }

      const next = new Set(current);
      next.add(fieldName);
      return next;
    });
  };

  const isError = state.status === 'error';
  const isSuccess = state.status === 'success';

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2" onSubmit={() => setEditedFields(new Set())}>
      <div>
        <input name="full_name" required placeholder="Full name" className="w-full rounded border px-3 py-2" onInput={() => handleFieldInput('full_name')} />
        {visibleFieldErrors?.full_name ? <p className="mt-1 text-xs text-red-600">{visibleFieldErrors.full_name}</p> : null}
      </div>

      <div>
        <input name="email" required type="email" placeholder="Email" className="w-full rounded border px-3 py-2" onInput={() => handleFieldInput('email')} />
        {visibleFieldErrors?.email ? <p className="mt-1 text-xs text-red-600">{visibleFieldErrors.email}</p> : null}
      </div>

      <div>
        <div className="flex gap-2">
          <input
            name="password"
            required
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            className="w-full rounded border px-3 py-2"
            onInput={() => handleFieldInput('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="rounded border px-3 py-2 text-xs"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {visibleFieldErrors?.password ? <p className="mt-1 text-xs text-red-600">{visibleFieldErrors.password}</p> : null}
      </div>

      <div>
        <div className="flex gap-2">
          <input
            name="confirm_password"
            required
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            className="w-full rounded border px-3 py-2"
            onInput={() => handleFieldInput('confirm_password')}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((value) => !value)}
            className="rounded border px-3 py-2 text-xs"
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {visibleFieldErrors?.confirm_password ? (
          <p className="mt-1 text-xs text-red-600">{visibleFieldErrors.confirm_password}</p>
        ) : null}
      </div>

      <div>
        <select name="role" defaultValue="waiter" className="w-full rounded border px-3 py-2" onInput={() => handleFieldInput('role')}>
          {APP_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        {visibleFieldErrors?.role ? <p className="mt-1 text-xs text-red-600">{visibleFieldErrors.role}</p> : null}
      </div>

      <div className="md:col-span-2">
        <button
          disabled={isPending}
          className="rounded bg-black px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Creating...' : 'Create Staff Account'}
        </button>
      </div>

      {isError && state.message ? <p className="md:col-span-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p> : null}

      {isSuccess && state.createdUser ? (
        <div className="md:col-span-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <p className="font-semibold">Staff account created.</p>
          <p>Full name: {state.createdUser.fullName}</p>
          <p>Email: {state.createdUser.email}</p>
          <p>Role: {state.createdUser.role}</p>
        </div>
      ) : null}
    </form>
  );
}
