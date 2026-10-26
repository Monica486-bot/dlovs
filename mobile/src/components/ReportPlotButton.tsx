import { router } from 'expo-router';
import { Button } from './ui';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// FR13: offer to report a plot that isn't in the register
export default function ReportPlotButton() {
  const { user } = useAuth();
  const { t } = useT();
  if (user && user.role !== 'citizen') return null;
  return (
    <Button
      title={t('Report This Plot to a Land Officer')}
      onPress={() => (user
        ? router.push('/report-plot')
        : router.push({ pathname: '/login', params: { returnTo: '/report-plot' } }))}
    />
  );
}
