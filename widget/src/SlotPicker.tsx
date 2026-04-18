// SlotPicker — shows available dates and time slots.
// Groups slots by month and date for clean browsing.

import { useState, useEffect } from 'react';
import type { Slot } from './App';

interface Props {
  apiUrl: string;
  onSelect: (slot: Slot) => void;
}

type GroupedSlots = Record<string, Slot[]>; // date → slots

export default function SlotPicker({ apiUrl, onSelect }: Props) {
  const [grouped, setGrouped]   = useState<GroupedSlots>({});
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    const from = toDateStr(new Date());
    const to   = toDateStr(addDays(new Date(), 90));

    fetch(`${apiUrl}/api/availability?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(data => {
        setGrouped(data.dates ?? {});
        const dates = Object.keys(data.dates ?? {});
        if (dates.length > 0) setActiveDate(dates[0]);
      })
      .catch(() => setError('Could not load availability. Please try again.'))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;

  const dates = Object.keys(grouped).sort();

  if (dates.length === 0) {
    return (
      <div style={styles.container}>
        <p style={styles.empty}>No availability at the moment. Please check back soon.</p>
      </div>
    );
  }

  // Group dates by month for navigation
  const byMonth: Record<string, string[]> = {};
  for (const d of dates) {
    const month = d.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(d);
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Choose a date &amp; time</h2>

      {Object.entries(byMonth).map(([month, monthDates]) => (
        <div key={month} style={styles.monthBlock}>
          <div style={styles.monthLabel}>{formatMonth(month)}</div>
          <div style={styles.dateGrid}>
            {monthDates.map(date => (
              <button
                key={date}
                style={{
                  ...styles.dateBtn,
                  ...(activeDate === date ? styles.dateBtnActive : {})
                }}
                onClick={() => setActiveDate(date)}
              >
                <span style={styles.dayName}>{formatDay(date)}</span>
                <span style={styles.dayNum}>{parseInt(date.slice(8), 10)}</span>
                <span style={styles.slotCount}>{grouped[date].length} slot{grouped[date].length !== 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {activeDate && grouped[activeDate] && (
        <div style={styles.slotSection}>
          <div style={styles.slotHeading}>{formatFullDate(activeDate)}</div>
          <div style={styles.slotGrid}>
            {grouped[activeDate].map(slot => (
              <button
                key={slot.id}
                style={styles.slotBtn}
                onClick={() => onSelect(slot)}
              >
                <span style={styles.slotTime}>{slot.label}</span>
                <span style={styles.slotPrice}>{formatPrice(slot.price_pence, slot.currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function formatMonth(m: string): string {
  return new Date(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function formatDay(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}
function formatFullDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}
function formatPrice(pence: number, currency: string): string {
  const symbols: Record<string, string> = { gbp: '£', usd: '$', eur: '€' };
  return `${symbols[currency.toLowerCase()] ?? ''}${(pence / 100).toFixed(2)}`;
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#888' }}>
      Loading availability…
    </div>
  );
}
function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '24px', color: '#b91c1c', background: '#fef2f2',
      borderRadius: '8px', margin: '16px 0' }}>
      {msg}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '0 auto', padding: '16px' },
  heading:   { fontSize: '20px', fontWeight: 600, marginBottom: '20px', color: '#111' },
  empty:     { color: '#666', padding: '24px 0' },
  monthBlock:  { marginBottom: '24px' },
  monthLabel:  { fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: '#888', marginBottom: '10px' },
  dateGrid:    { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  dateBtn:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 14px',
    border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', cursor: 'pointer',
    minWidth: '68px', transition: 'all 0.15s' },
  dateBtnActive: { borderColor: '#2563eb', background: '#eff6ff' },
  dayName:     { fontSize: '11px', color: '#888', marginBottom: '2px', textTransform: 'uppercase' },
  dayNum:      { fontSize: '20px', fontWeight: 700, color: '#111', lineHeight: 1 },
  slotCount:   { fontSize: '11px', color: '#2563eb', marginTop: '3px' },
  slotSection: { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f0f0f0' },
  slotHeading: { fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '12px' },
  slotGrid:    { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  slotBtn:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 20px',
    border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', cursor: 'pointer',
    transition: 'all 0.15s', minWidth: '100px' },
  slotTime:    { fontSize: '16px', fontWeight: 600, color: '#111' },
  slotPrice:   { fontSize: '13px', color: '#2563eb', marginTop: '4px' },
};
