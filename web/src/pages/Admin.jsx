import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

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

  const roleName = (r) => t({ citizen: 'Citizen', land_officer: 'Land Officer', administrator: 'Administrator' }[r]);

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
    }, t('Password reset for {name}.', { name: target.full_name }));
  }

  function deactivateParcel(e) {
    e.preventDefault();
    if (!window.confirm(t('Deactivate parcel #{id} as fraudulent?', { id: parcelId }))) return;
    run(async () => {
      await api.put(`/admin/parcels/${parcelId}/deactivate`);
      setParcelId('');
    }, t('Parcel #{id} deactivated', { id: parcelId }));
  }

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  return (
    <div>
      <h2>{t('User Accounts')}</h2>
      <p className="page-subtitle">{t('All citizens and land officers registered on DLOVS')}</p>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <div className="stat-grid">
        <div className="stat"><span className="stat-value">{users.length}</span><span className="stat-label">{t('Total Users')}</span></div>
        <div className="stat"><span className="stat-value">{users.filter((u) => u.role === 'land_officer').length}</span><span className="stat-label">{t('Land Officers')}</span></div>
        <div className="stat"><span className="stat-value">{users.filter((u) => u.role === 'citizen').length}</span><span className="stat-label">{t('Citizens')}</span></div>
        <div className="stat stat-danger"><span className="stat-value">{users.filter((u) => !u.is_active).length}</span><span className="stat-label">{t('Suspended')}</span></div>
      </div>

      <div className="card">
        {resetting && (
          <form onSubmit={resetPassword} className="notice info">
            <span>{t('Set a temporary password for {name}:', { name: resetting.full_name })}</span>
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
              <tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Phone')}</th><th>{t('National ID')}</th><th>{t('Status')}</th><th>{t('Joined')}</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.user_id === me?.user_id;
                return (
                  <tr key={u.user_id}>
                    <td>{u.full_name}</td>
                    <td>
                      <select value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)} aria-label={t('Role')} style={{ marginTop: 0, minWidth: 140 }}>
                        {ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}
                      </select>
                    </td>
                    <td dir="ltr">{u.phone_number}</td>
                    <td>{u.national_id || '—'}</td>
                    <td><StatusBadge status={u.is_active ? 'active' : 'deactivated'} label={u.is_active ? t('Active') : t('Suspended')} /></td>
                    <td className="nowrap">{formatDate(u.created_at)}</td>
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
      <div className="card">
        <h3>{t('Create Staff Account')}</h3>
        <form onSubmit={createUser} className="form-grid">
          <label>{t('Full Name')}<input {...field('full_name')} required /></label>
          <label>{t('Phone Number')}<input {...field('phone_number')} required dir="ltr" /></label>
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
        <form onSubmit={deactivateParcel} className="form-grid">
          <label>{t('Parcel ID')}<input value={parcelId} onChange={(e) => setParcelId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" required /></label>
          <div style={{ alignSelf: 'end', marginBottom: 14 }}>
            <button className="btn danger" type="submit">{t('Deactivate')}</button>
          </div>
        </form>
      </div>

    </div>
  );
}
