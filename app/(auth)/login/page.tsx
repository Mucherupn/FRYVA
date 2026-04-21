import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #fff 0%, #fef2f2 42%, #f8fafc 100%)', display: 'grid', placeItems: 'center', padding: '16px' }}>
      <div style={{ width: 'min(960px, 100%)', display: 'grid', gap: '16px', gridTemplateColumns: '1.1fr 1fr' }}>
        <section className="panel" style={{ background: '#111111', color: '#f8fafc', borderColor: '#1f2937' }}>
          <p className="brand-tag" style={{ color: '#f87171' }}>Fryva</p>
          <h1 style={{ fontSize: '2rem', margin: '8px 0 12px', lineHeight: 1.2 }}>Run service, stock, and cash with confidence.</h1>
          <p style={{ color: '#cbd5e1', marginBottom: 0 }}>Premium hospitality operations platform for owner, waiter, and chef workflows.</p>
        </section>
        <LoginForm />
      </div>
    </div>
  );
}
