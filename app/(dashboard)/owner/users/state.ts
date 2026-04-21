import type { AppRole } from '@/lib/auth/roles';

export type CreateStaffFormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  createdUser?: {
    fullName: string;
    email: string;
    role: AppRole;
  };
  fieldErrors?: Partial<Record<'full_name' | 'email' | 'password' | 'confirm_password' | 'role', string>>;
};

export const INITIAL_CREATE_STAFF_FORM_STATE: CreateStaffFormState = {
  status: 'idle',
};
