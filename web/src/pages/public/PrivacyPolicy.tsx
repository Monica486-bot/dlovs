import { Link } from 'react-router-dom';
import { useT } from '../../i18n';

// Privacy policy: what DLOVS stores, why, who can see it, how long it is kept and how it is protected.
// Every statement here describes what the code does; update it when that changes.
interface Section {
  title: string;
  intro?: string;
  points: string[];
}

const CONTACT_EMAIL = 'm.ahol@alustudent.com';

const SECTIONS: Section[] = [
  {
    title: '1. Who we are',
    points: [
      'DLOVS (Digital Land Ownership Verification System) is a research prototype built by Monica Akoi Dau Ahol for a capstone project at African Leadership University, and approved by the ALU Research Ethics Committee (approval code SEPT26-BSE-002).',
      'DLOVS helps people check land ownership in Juba before they pay. It is not the government land registry, and its records are not legal proof of ownership.',
      'This policy covers the DLOVS website and the DLOVS Android app.',
    ],
  },
  {
    title: '2. What we collect',
    points: [
      'Your account: your full name, phone number, password and, if you give it, your national ID number.',
      'Landowner records entered by land officers: the owner\'s name, national ID, contact number and the type and reference of their ownership document.',
      'Parcels: GPS position, neighbourhood, size, status and ownership history.',
      'Documents you upload (PDF, JPG or PNG, up to 5 MB), disputes you flag, plots you report and transfer requests you make.',
      'An activity record: every officer action, and every time an ownership record is viewed, with the time and the parcel. If you are logged in, your account is recorded too. We do not store IP addresses.',
    ],
  },
  {
    title: '3. How we use your information',
    intro: 'We use your information only to run DLOVS:',
    points: [
      'To let anyone check who owns a plot before paying for it.',
      'To create your account, confirm your phone number and keep your account secure.',
      'To link your account to your land, after an officer checks your national ID card in person.',
      'To process transfers, documents, disputes and plot reports.',
      'To send you codes and alerts, for example when an officer acts on your land.',
      'To keep a permanent record of officer actions, so that land officials can be held accountable.',
      'We do not use your information for advertising, and we do not sell it.',
    ],
  },
  {
    title: '4. What anyone can see without an account',
    intro: 'To protect buyers, some information is public:',
    points: [
      'The registered owner\'s name, partly hidden (for example "Nyandeng K***"), and the ownership history, with past owners\' names hidden in the same way.',
      'Each parcel\'s location, size and status.',
      'Whether a parcel has disputes and verified documents, but not the documents themselves.',
      'Never public: owners\' full names, the list of all parcels an owner holds, national ID numbers, phone and contact numbers, document files and document references. Only land officers can search by an owner\'s name.',
    ],
  },
  {
    title: '5. Who else can see your information',
    points: [
      'Land officers and administrators can see full records, including national IDs and contact numbers, because they must check identities before registering or transferring land.',
      'A document can be opened only by land officers, administrators, the person who uploaded it and the verified owner of the parcel.',
      'Officers can see only their own activity record. Administrators can see everyone\'s, so that officer actions can be checked.',
    ],
  },
  {
    title: '6. Service providers',
    intro: 'DLOVS uses these services to run. They process information only to provide their service:',
    points: [
      'Twilio is set up to send our SMS codes and alerts. It would receive your phone number and the message text. During testing, codes are shown on screen instead of being sent.',
      'Expo delivers notifications to the phone app.',
      'Cloudinary stores uploaded documents, but receives only encrypted files.',
      'Render hosts our server and database in the United States, so your information is stored outside South Sudan. Netlify hosts this website.',
      'Google Fonts provides the text font, so your browser contacts Google when the page loads.',
    ],
  },
  {
    title: '7. How we protect it',
    points: [
      'Passwords are never stored as you type them. They are stored only as a bcrypt hash, which cannot be turned back into the password.',
      'SMS codes are stored only as hashes, expire after 10 to 30 minutes and stop working after 5 wrong tries.',
      'Documents are encrypted with AES-256-GCM before they are stored, so a stolen file cannot be read without the key.',
      'Logins are limited after repeated failures, and all traffic uses HTTPS.',
      'No single officer can complete a sensitive action alone: a transfer needs the owner\'s consent or a second officer, and an officer cannot approve documents for a parcel they registered.',
    ],
  },
  {
    title: '8. How long we keep it',
    points: [
      'The ownership history and the activity record are permanent. The database refuses any attempt to edit or delete them, even by administrators. This stops anyone, including officials, from quietly rewriting who owned a plot.',
      'Accounts, parcels, documents and reports are kept for as long as DLOVS runs. A deactivated account can no longer log in, but its details are kept.',
      'Used SMS codes are marked as used and kept only as hashes.',
      'This prototype does not yet delete old information automatically.',
    ],
  },
  {
    title: '9. Your location',
    points: [
      'When the phone app checks whether you are standing on a plot, the distance is calculated on your phone. Your position is not sent to us.',
      'When you use "Near me" search, your position is sent with that search so we can find nearby parcels. We do not save it in our database, but it may appear briefly in server logs.',
      'If you attach a GPS position when reporting an unregistered plot, that position is saved with your report.',
    ],
  },
  {
    title: '10. What is saved on your device',
    points: [
      'This website saves your login and your language choice in your browser. We do not use cookies.',
      'The phone app saves the last 50 records you viewed, so you can check them offline. They stay on your phone.',
    ],
  },
  {
    title: '11. Your rights and choices',
    points: [
      'You can check land without creating an account.',
      'Giving your national ID is optional. It is used only to link your account to your land after an officer checks your ID card in person.',
      'You can see your details on your Account page and correct your name there. To change a national ID, contact the land office.',
      'You can ask us what information we hold about you, ask for it to be corrected, or ask an administrator to deactivate your account.',
      'Full deletion of an account is not yet available, and the ownership history and activity record cannot be deleted (see section 8).',
      'You can contact us with any question or complaint about your information (see section 15).',
    ],
  },
  {
    title: '12. Age',
    points: [
      'DLOVS is intended for adults aged 18 and over. Please do not create an account for a child.',
    ],
  },
  {
    title: '13. Laws and standards we follow',
    points: [
      'South Sudan does not yet have a data protection law. DLOVS respects the right to privacy in Article 22 of the Transitional Constitution of South Sudan, and keeps personal information private in line with section 25 of the Right of Access to Information Act, 2013.',
      'We also follow the data protection principles of the African Union Convention on Cyber Security and Personal Data Protection and the EU General Data Protection Regulation as good practice.',
    ],
  },
  {
    title: '14. Changes to this policy',
    points: [
      'If we change how DLOVS uses your information, we will update this page and the date at the top.',
    ],
  },
  {
    title: '15. Contact us',
    points: [
      'For questions, requests or complaints about your information, contact Monica Akoi Dau Ahol, the developer of DLOVS, at {email}.',
    ],
  },
];

/** Privacy policy page, open to everyone and linked from the page footer and the sign-up form. */
export default function PrivacyPolicy() {
  const { t } = useT();
  return (
    <div>
      <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
      <section className="hero">
        <h1>{t('Privacy Policy')}</h1>
        <p>{t('How DLOVS collects, uses and protects your information.')}</p>
        <p className="muted">{t('Effective date: 20 November 2026')}</p>
      </section>
      <div className="card">
        <p>{t('This policy explains what information DLOVS collects, why we collect it, who can see it, how long we keep it and how we protect it. By creating an account, you agree to this policy.')}</p>
      </div>
      {SECTIONS.map((section) => (
        <div className="card" key={section.title}>
          <h3>{t(section.title)}</h3>
          {section.intro && <p>{t(section.intro)}</p>}
          <ul className="policy-list">
            {section.points.map((point) => <li key={point}>{t(point, { email: CONTACT_EMAIL })}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
