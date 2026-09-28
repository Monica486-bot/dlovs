import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div>
      <h2>Welcome, {user?.full_name}</h2>
      <div className="card">
        <p>
          DLOVS lets Land Officers register parcels, generate tamper-evident QR codes for
          ownership verification, and manage disputes — while giving citizens and the public
          instant, no-account-required verification of who owns a parcel.
        </p>
        <ul>
          <li><strong>Register Parcel</strong> — create a new parcel record and generate its QR code</li>
          <li><strong>Search / Verify</strong> — look up a parcel and view its ownership record, exactly as a Guest would after scanning the QR</li>
          <li><strong>Disputes</strong> — review and resolve boundary/ownership disputes flagged by citizens</li>
          <li><strong>Audit Log</strong> — every officer action is recorded for accountability</li>
        </ul>
      </div>
    </div>
  );
}
