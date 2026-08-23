import { useEffect, useRef, useState } from 'react';
import { FREE_MODULE_IDS, PRICING_PLANS } from '../config/monetization';
import './PricingModal.css';

const CheckIcon = () => <span className="pricing-check" aria-hidden="true">✓</span>;

export default function PricingModal({
  isOpen,
  isSignedIn,
  onClose,
  onSignIn,
  onCheckout,
}) {
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    closeButtonRef.current?.focus();
    const handleClose = () => {
      setError(null);
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) handleClose();
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled)'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onCheckout(selectedPlan);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open checkout.');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay pricing-overlay" onMouseDown={isSubmitting ? undefined : handleClose}>
      <div
        ref={dialogRef}
        className="pricing-modal glass-panel animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-title"
        aria-describedby="pricing-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="pricing-close"
          onClick={handleClose}
          disabled={isSubmitting}
          aria-label="Close pricing"
        >
          ×
        </button>

        <div className="pricing-heading">
          <span className="pricing-eyebrow">GemLang Pro</span>
          <h2 id="pricing-title">Keep your Spanish moving</h2>
          <p id="pricing-description">
            Unlock the complete course: every lesson, story, review, and future module.
          </p>
        </div>

        <div className="pricing-comparison">
          <div className="pricing-tier pricing-tier-free">
            <span className="pricing-tier-label">Free forever</span>
            <strong>€0</strong>
            <ul>
              <li><CheckIcon /> {FREE_MODULE_IDS.size} starter modules</li>
              <li><CheckIcon /> Listening and translation practice</li>
              <li><CheckIcon /> Progress saved on this device</li>
            </ul>
          </div>
          <div className="pricing-tier pricing-tier-pro">
            <span className="pricing-tier-label">Pro</span>
            <strong>Full course</strong>
            <ul>
              <li><CheckIcon /> All 64 modules</li>
              <li><CheckIcon /> Beginner through advanced</li>
              <li><CheckIcon /> Every future module included</li>
            </ul>
          </div>
        </div>

        {isSignedIn ? (
          <>
            <div className="pricing-plan-picker" role="radiogroup" aria-label="Billing period">
              {Object.values(PRICING_PLANS).map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedPlan === plan.id}
                  className={`pricing-plan ${selectedPlan === plan.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedPlan(plan.id)}
                  disabled={isSubmitting}
                >
                  <span className="pricing-plan-copy">
                    <span className="pricing-plan-name">
                      {plan.name}
                      {plan.badge && <span className="pricing-save-badge">{plan.badge}</span>}
                    </span>
                    {plan.monthlyEquivalent && (
                      <span className="pricing-equivalent">{plan.monthlyEquivalent}, billed yearly</span>
                    )}
                  </span>
                  <span className="pricing-plan-price">{plan.price}<small>{plan.cadence}</small></span>
                </button>
              ))}
            </div>

            {error && <p className="pricing-error" role="alert">{error}</p>}
            <button
              type="button"
              className="btn-primary pricing-upgrade"
              onClick={handleUpgrade}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Opening secure checkout…' : 'Unlock the full course'}
            </button>
            <p className="pricing-fine-print">
              Secure checkout. Cancel anytime. Price includes applicable VAT.
            </p>
          </>
        ) : (
          <div className="pricing-signin">
            <p>Create or sign in to your free account before upgrading.</p>
            <button type="button" className="btn-primary pricing-upgrade" onClick={onSignIn}>
              Continue to sign in
            </button>
            <button type="button" className="pricing-keep-free" onClick={handleClose}>
              Keep learning for free
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
