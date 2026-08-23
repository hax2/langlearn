import { useEffect, useRef } from 'react';
import { LEGAL } from '../config/legal';
import './LegalModal.css';

const Contact = () => LEGAL.supportEmail
  ? <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
  : <span>the support address on your purchase receipt</span>;

const PrivacyPolicy = () => (
  <>
    <p><strong>Effective:</strong> {LEGAL.effectiveDate}</p>
    <p>
      {LEGAL.operatorName} is the controller of personal data used to provide GemLang. For privacy
      questions or requests, contact <Contact />.
    </p>
    <h3>Data we use</h3>
    <p>
      If you create an account, we process your email address, authentication identifiers, and basic
      security logs through Supabase. Lesson progress and preferences stay in your browser's local
      storage. If you subscribe, we store your plan, subscription status, and renewal dates; Lemon
      Squeezy processes your name, billing address, tax details, and payment method. GemLang never
      receives your full card number.
    </p>
    <h3>Why we use it</h3>
    <p>
      We use this data to provide your account and paid access, fulfil our contract with you, secure
      the service, prevent abuse, answer support requests, and meet legal accounting obligations.
      GemLang does not sell personal data or use advertising trackers.
    </p>
    <h3>Processors and transfers</h3>
    <p>
      Supabase provides authentication, database, and server functions. Lemon Squeezy acts as
      merchant of record for checkout, tax, invoices, and subscription management. These providers
      may process data outside your country using their published data-transfer safeguards.
    </p>
    <h3>Retention and your rights</h3>
    <p>
      Account data is kept while your account is active and then only as needed for security or legal
      obligations. Billing records are retained by Lemon Squeezy as required by tax and payment law.
      Depending on where you live, you may ask to access, correct, delete, restrict, or export your
      data, or object to certain processing. You may also complain to your local data-protection
      authority. Contact us to exercise these rights.
    </p>
    <h3>Local storage</h3>
    <p>
      GemLang uses browser storage only for authentication, progress, settings, onboarding, and other
      features you request. It does not set advertising or cross-site tracking cookies.
    </p>
  </>
);

const Terms = () => (
  <>
    <p><strong>Effective:</strong> {LEGAL.effectiveDate}</p>
    <p>
      These terms govern your use of GemLang, operated by {LEGAL.operatorName}. By using the service,
      you agree to these terms. Contact <Contact /> with questions.
    </p>
    <h3>The service</h3>
    <p>
      GemLang is a self-study language-learning tool. It does not promise a particular fluency level,
      exam result, or professional qualification. You are responsible for checking content before
      relying on it in a high-stakes setting.
    </p>
    <h3>Free and Pro access</h3>
    <p>
      Free access includes the starter modules shown in the app. GemLang Pro unlocks the complete
      course while your subscription remains valid. A subscription renews at the billing interval and
      price shown at checkout until you cancel it. Taxes are included where the checkout says so.
    </p>
    <h3>Billing, cancellation, and refunds</h3>
    <p>
      Lemon Squeezy is the merchant of record and handles payment, invoices, tax, and billing support.
      You can cancel from GemLang's Manage Billing link; access continues through the paid period.
      Refunds and any statutory withdrawal rights are handled under the terms shown at checkout and
      applicable consumer law. Cancellation stops future renewals and does not itself refund a past
      charge.
    </p>
    <h3>Acceptable use</h3>
    <p>
      You receive a personal, non-transferable right to use GemLang. Do not resell access, share paid
      accounts, scrape or redistribute course content, interfere with the service, or use it unlawfully.
      We may suspend access for material abuse, fraud, or security threats.
    </p>
    <h3>Availability and changes</h3>
    <p>
      We may improve, replace, or remove features and content. We aim to keep paid functionality
      available but cannot promise uninterrupted operation. Nothing in these terms excludes rights or
      remedies that cannot lawfully be excluded under the laws that apply to you.
    </p>
  </>
);

export default function LegalModal({ document, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!document) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, onClose]);

  if (!document) return null;
  const isPrivacy = document === 'privacy';

  return (
    <div className="modal-overlay legal-overlay" onMouseDown={onClose}>
      <article
        className="legal-modal glass-panel animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="legal-header">
          <h2 id="legal-title">{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h2>
          <button ref={closeRef} type="button" className="pricing-close legal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="legal-content">
          {isPrivacy ? <PrivacyPolicy /> : <Terms />}
        </div>
      </article>
    </div>
  );
}
