import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [phone_number, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(phone_number, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>DLOVS</h2>
        <p style={{ color: '#666', marginTop: -8, fontSize: '0.85rem' }}>
          Digital Land Ownership Verification System — Officer / Admin Portal
        </p>
        <label>
          Phone Number
          <input value={phone_number} onChange={(e) => setPhone(e.target.value)} placeholder="+211900000001" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" style={{ width: '100%', marginTop: 8 }}>
          Log In
        </button>
      </form>
    </div>
  );
}
