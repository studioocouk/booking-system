// SuccessPage — shown after Stripe redirects back.
// Stripe sends ?session_id= in the URL which we display as reference.

export default function SuccessPage() {
  const params    = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const ref       = sessionId ? sessionId.slice(-8).toUpperCase() : '—';

  return (
    <div style={styles.container}>
      <div style={styles.icon}>✓</div>
      <h2 style={styles.heading}>Booking confirmed!</h2>
      <p style={styles.body}>
        Thank you. Your booking is confirmed and a confirmation email is on its way to you.
      </p>
      {sessionId && (
        <div style={styles.ref}>
          <span style={styles.refLabel}>Reference</span>
          <span style={styles.refCode}>{ref}</span>
        </div>
      )}
      <p style={styles.note}>
        To cancel or make changes, please reply to your confirmation email.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'system-ui, sans-serif', maxWidth: '420px', margin: '0 auto',
    padding: '40px 16px', textAlign: 'center' },
  icon:      { width: '64px', height: '64px', background: '#dcfce7', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px',
    color: '#16a34a', margin: '0 auto 20px', lineHeight: '64px' },
  heading:   { fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '12px' },
  body:      { fontSize: '15px', color: '#555', lineHeight: 1.6 },
  ref:       { background: '#f8fafc', borderRadius: '10px', padding: '14px 20px',
    margin: '20px auto', display: 'inline-flex', flexDirection: 'column',
    alignItems: 'center', gap: '4px' },
  refLabel:  { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: '#888' },
  refCode:   { fontSize: '20px', fontWeight: 700, color: '#111', fontFamily: 'monospace' },
  note:      { fontSize: '13px', color: '#aaa', marginTop: '20px' },
};
