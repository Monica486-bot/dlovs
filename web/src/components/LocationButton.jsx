import { useState } from 'react';
import { useT } from '../i18n';

const THRESHOLD_METRES = 10;

// FR04: fills GPS fields from the device's location, and warns when the
// reported accuracy is worse than the 10 m threshold. On a desktop without
// GPS the browser estimates position from Wi-Fi, which is usually far less
// accurate — the warning makes that visible instead of silently saving it.
export default function LocationButton({ onLocate }) {
  const { t } = useT();
  const [state, setState] = useState({ status: 'idle' });

  function locate() {
    if (!navigator.geolocation) {
      setState({ status: 'error', message: t('This browser cannot provide a location.') });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onLocate({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        setState({ status: 'done', accuracy: coords.accuracy });
      },
      (err) => {
        setState({
          status: 'error',
          message: err.code === err.PERMISSION_DENIED
            ? t('Location permission denied.')
            : t('Could not get your location.'),
        });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  return (
    <div className="location-row">
      <button type="button" className="btn secondary" onClick={locate} disabled={state.status === 'locating'}>
        {state.status === 'locating' ? t('Getting location…') : t('Use my current location')}
      </button>
      {state.status === 'done' && (
        state.accuracy <= THRESHOLD_METRES ? (
          <span className="success-text">{t('GPS captured · {m} m', { m: Math.round(state.accuracy) })}</span>
        ) : (
          <span className="warning-text">
            {t('Low accuracy ({m} m)', { m: Math.round(state.accuracy) })}
          </span>
        )
      )}
      {state.status === 'error' && <span className="error-text">{state.message}</span>}
    </div>
  );
}
