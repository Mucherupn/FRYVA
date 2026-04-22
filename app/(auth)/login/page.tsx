import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="auth-shell"> 
      <div className="auth-layout"> 
        <section className="panel auth-brand"> 
          <p className="brand-tag" style={{ color: '#f87171' }}>Fryva</p>
          <h1 style={{ fontSize: 'clamp(1.6rem, 7vw, 2rem)', margin: '8px 0 12px', lineHeight: 1.2 }}>Run service, stock, and cash with confidence.</h1>
          <p style={{ color: '#cbd5e1', marginBottom: 0 }}>Premium hospitality operations platform for owner, waiter, and chef workflows.</p>
        </section>
        <LoginForm />
      </div>
    </div>
  );
}
