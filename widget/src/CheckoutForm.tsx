// CheckoutForm — collects name + email, then redirects to Stripe Checkout.
// No card data is handled here — Stripe does that on their hosted page.

import { useState } from 'react';
import type { Slot } from './App';

interface Props {
  slot:   Slot;
  apiUrl: string;
  onBack: () => void;
}

export default function CheckoutForm({ slot, apiUrl, onBack }: Props) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const price = formatPrice(slot.price_pence, slot.currency);
  const date  = formatDate(slot.date);

  const handleSubmit = async () => {
    setError('');

    if (name.trim().length < 2)  { setError('Please enter your full name.'); return; }
    if (!isValidEmail(email))    { setError('Please enter a valid email address.'); return; }

    setLoading(true);

    try {
      const res  = await fetch(`${apiUrl}/api/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          slot_id:      slot.id,
          client_name:  name.trim(),
          client_email: email.toLowerCase().trim(),
        }),
      });

      const data = await res.json() as { checkout_url?: string; error?: string };

      if (!res.ok || !data.checkout_url) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // Redirect to Stripe Hosted Checkout
window.open(data.checkout_url, '_top');

    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Booking summary */}
      <div style={styles.summary}>
        <div style={styles.summaryLabel}>Your booking</div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryKey}>Date</span>
          <span style={styles.summaryVal}>{date}</span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryKey}>Time</span>
          <span style={styles.summaryVal}>{slot.label}</span>
        </div>
        <div style={styles.summaryRow}>
          <span style={styles.summaryKey}>Total</span>
          <span style={{ ...styles.summaryVal, fontWeight: 700, color: '#111' }}>{price}</span>
        </div>
      </div>

      {/* Form */}
      <div style={styles.form}>
        <label style={styles.label}>
          Full name
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jane Smith"
            style={styles.input}
            autoComplete="name"
          />
        </label>

        <label style={styles.label}>
          Email address
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={styles.input}
            autoComplete="email"
          />
        </label>

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...styles.primaryBtn, ...(loading ? styles.btnDisabled : {}) }}
        >
          {loading ? 'Redirecting to payment…' : `Pay ${price} securely`}
        </button>

        <button onClick={onBack} style={styles.backBtn} disabled={loading}>
          ← Back to dates
        </button>

        <p style={styles.secureNote}>
          Payment is handled securely by Stripe. Your card details never touch this site.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatPrice(pence: number, currency: string): string {
  const symbols: Record<string, string> = { gbp: '£', usd: '$', eur: '€' };
  return `${symbols[currency.toLowerCase()] ?? ''}${(pence / 100).toFixed(2)}`;
}
function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container:   { fontFamily: 'system-ui, sans-serif', maxWidth: '440px', margin: '0 auto', padding: '16px' },
  summary:     { background: '#f8fafc', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' },
  summaryLabel:{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: '#888', marginBottom: '10px' },
  summaryRow:  { display: 'flex', justifyContent: 'space-between', padding: '5px 0',
    borderBottom: '1px solid #eee' },
  summaryKey:  { color: '#666', fontSize: '14px' },
  summaryVal:  { color: '#333', fontSize: '14px', fontWeight: 500 },
  form:        { display: 'flex', flexDirection: 'column', gap: '14px' },
  label:       { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px',
    fontWeight: 500, color: '#333' },
  input:       { padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px',
    fontSize: '15px', outline: 'none', transition: 'border 0.15s' },
  error:       { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
    padding: '10px 14px', color: '#b91c1c', fontSize: '14px' },
  primaryBtn:  { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px',
    padding: '14px 20px', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.15s' },
  btnDisabled: { background: '#93c5fd', cursor: 'not-allowed' },
  backBtn:     { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
    fontSize: '14px', textAlign: 'left', padding: '4px 0' },
  secureNote:  { fontSize: '12px', color: '#aaa', margin: '4px 0 0', textAlign: 'center' },
};
