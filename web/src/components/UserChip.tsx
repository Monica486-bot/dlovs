import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const ROLE_LABELS = { land_officer: 'Land Officer', administrator: 'Administrator', citizen: 'Citizen' };

// "Name · Role" with an initials avatar, as in the Figma header. Opens My Account.
export default function UserChip() {
  const { user } = useAuth();
  const { t } = useT();
  if (!user) return null;
  const initials = (user.full_name || '')
    .split(/\s+/)
    .filter((w) => w && w !== 'Officer')
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <Link to="/account" className="user-chip" title={t('My Account')}>
      <span className="user-name">{user.full_name} · {t(ROLE_LABELS[user.role] || user.role)}</span>
      <span className="avatar" aria-hidden="true">{initials}</span>
    </Link>
  );
}
