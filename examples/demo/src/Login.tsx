import { useState, type FormEvent } from 'react';
import { navigate } from './router';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError('E-posta veya parola hatalı');
      return;
    }
    navigate('/account');
  }

  return (
    <section aria-labelledby="login-title">
      <h2 id="login-title">Giriş</h2>
      <form className="login" onSubmit={submit}>
        <label htmlFor="email">E-posta</label>
        <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Parola</label>
        <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Giriş yap</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
