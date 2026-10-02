import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const ROLES = ['citizen', 'land_officer', 'administrator'];
const EMPTY_FORM = { full_name: '', phone_number: '', password: '', role: 'land_officer', national_id: '' };

// FR21 administrator dashboard: accounts, roles, password resets (FR20 for
// staff), deactivating fraudulent parcels. Every action is audit-logged.
export default function Admin() {
  const { user: me } = useAuth();
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [parcelId, setParcelId] = useState('');
  const [resetting, setResetting] = useState(null);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      setError(errorMessage(err, t('Failed to load users')));
    }
  }, [t]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function run(action, message) {
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
      loadUsers();
    } catch (err) {
      setError(errorMessage(err, t('Request failed')));
    }
  }

  const roleName = (r) => t(r.replace('_', ' '));

  function createUser(e) {
    e.preventDefault();
    run(async () => {
      await api.post('/admin/users', form);
      setForm(EMPTY_FORM);
    }, t('Created {role} account for {name}', { role: roleName(form.role), name: form.full_name }));
  }

  function changeRole(u, role) {
    if (!window.confirm(t("Change {name}'s role to {role}?", { name: u.full_name, role: roleName(role) }))) return;
    run(() => api.put(`/admin/users/${u.user_id}/role`, { role }), t('Role updated'));
  }

  function toggleActive(u) {
    const question = u.is_active ? t('Deactivate {name}?', { name: u.full_name }) : t('Reactivate {name}?', { name: u.full_name });
    if (!window.confirm(question)) return;
    run(() => api.put(`/admin/users/${u.user_id}/${u.is_active ? 'deactivate' : 'reactivate'}`), u.is_active ? t('User deactivated') : t('User reactivated'));
  }

  function resetPassword(e) {
    e.preventDefault();
    const target = resetting;
    run(async () => {
      await api.put(`/admin/users/${target.user_id}/password`, { new_password: tempPassword });
      setResetting(null);
      setTempPassword('');
    }, t('Password reset for {name}. Give them the temporary password in person and ask them to change it under My Account.', { name: target.full_name }));
  }

  function deactivateParcel(e) {
    e.preventDefault();
    if (!window.confirm(t('Deactivate parcel #{id} as fraudulent? Everyone who checks it will be told not to proceed with any sale.', { id: parcelId }))) return;
    run(async () => {
      await api.put(`/admin/parcels/${parcelId}/deactivate`);
      setParcelId('');
    }, t('Parcel #{id} deactivated', { id: parcelId }));
  }

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  return (
    <div>
      <h2>{t('Administrator Panel')}</h2>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <div className="card">
        <h3>{t('Create Staff Account')}</h3>
        <form onSubmit={createUser} className="form-grid">
          <label>{t('Full Name')}<input {...field('full_name')} required /></label>
          <label>{t('Phone Number')}<input {...field('phone_number')} placeholder="+211900000000" required dir="ltr" /></label>
          <label>{t('Temporary Password')}<input type="password" minLength={6} {...field('password')} required /></label>
          <label>
            {t('Role')}
            <select {...field('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
            </select>
          </label>
          <label>{t('National ID (optional)')}<input {...field('national_id')} /></label>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn" type="submit">{t('Create Account')}</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>{t('Deactivate Fraudulent Parcel')}</h3>
        <form onSubmit={deactivateParcel} className="inline-form">
          <input value={parcelId} onChange={(e) => setParcelId(e.target.value.replace(/\D/g, ''))} placeholder={t('Parcel ID')} inputMode="numeric" required />
          <button className="btn danger" type="submit">{t('Deactivate')}</button>
        </form>
      </div>

      <div className="card">
        <h3>{t('User Accounts')}</h3>
        {resetting && (
          <form onSubmit={resetPassword} className="notice warning">
            <p style={{ marginTop: 0 }}>{t('Set a temporary password for {name}:', { name: resetting.full_name })}</p>
            <div className="inline-form">
              <input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} minLength={6} required aria-label={t('Temporary Password')} />
              <button className="btn" type="submit">{t('Reset Password')}</button>
              <button className="btn secondary" type="button" onClick={() => setResetting(null)}>{t('Cancel')}</button>
            </div>
          </form>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>{t('ID')}</th><th>{t('Name')}</th><th>{t('Phone')}</th><th>{t('National ID')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.user_id === me?.user_id;
                return (
                  <tr key={u.user_id}>
                    <td>#{u.user_id}</td>
                    <td>{u.full_name}</td>
                    <td dir="ltr">{u.phone_number}</td>
                    <td>{u.national_id || '—'}</td>
                    <td>
                      <select value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)} aria-label={t('Role')}>
                        {ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
                      </select>
                    </td>
                    <td>{u.is_active ? t('active') : t('deactivated')}</td>
                    <td className="cell-actions">
                      {!isMe && u.role !== 'citizen' && (
                        <button className="btn secondary" onClick={() => { setResetting(u); setTempPassword(''); }}>{t('Reset Password')}</button>
                      )}
                      {!isMe && (
                        <button className={`btn ${u.is_active ? 'danger' : 'secondary'}`} onClick={() => toggleActive(u)}>
                          {u.is_active ? t('Deactivate') : t('Reactivate')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
