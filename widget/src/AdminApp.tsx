import { useState, useEffect, useCallback } from 'react';

const API_URL      = import.meta.env.VITE_API_URL;
const STORAGE_KEY  = 'admin_secret';

type Slot = {
  id: string; date: string; time: string; label: string;
  price_pence: number; currency: string; is_active: number;
  booked_by?: string; booked_email?: string; booking_status?: string;
};

type Booking = {
  id: string; client_name: string; client_email: string;
  date: string; label: string; status: string;
  amount_paid_pence: number; currency: string; created_at: string;
};

function useAdminSecret() {
  const [secret, setSecret] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const save = (s: string) => { localStorage.setItem(STORAGE_KEY, s); setSecret(s); };
  const logout = () => { localStorage.removeItem(STORAGE_KEY); setSecret(''); };
  return { secret, save, logout };
}

function adminHeaders(secret: string) {
  return { 'Content-Type': 'application/json', 'X-Admin-Secret': secret };
}

export default function AdminApp() {
  const { secret, save, logout } = useAdminSecret();
  const [tab, setTab] = useState<'slots' | 'bookings'>('slots');

  if (!secret) return <LoginScreen onLogin={save} />;

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <span style={s.logo}>Booking Admin</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TabBtn label="Slots"    active={tab === 'slots'}    onClick={() => setTab('slots')} />
          <TabBtn label="Bookings" active={tab === 'bookings'} onClick={() => setTab('bookings')} />
          <button onClick={logout} style={s.logoutBtn}>Sign out</button>
        </div>
      </div>
      <div style={s.content}>
        {tab === 'slots'    && <SlotsPanel    secret={secret} onAuthError={logout} />}
        {tab === 'bookings' && <BookingsPanel secret={secret} onAuthError={logout} />}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (s: string) => void }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  const attempt = async () => {
    if (!val.trim()) return;
    const res = await fetch(`${API_URL}/api/admin/bookings`, {
      headers: { 'X-Admin-Secret': val }
    });
    if (res.status === 401) { setErr('Wrong secret.'); return; }
    onLogin(val);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '16px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.1)', width: '300px' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Admin access</h2>
        <input
          type="password"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="Admin secret"
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: '1.5px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box' }}
          autoFocus
        />
        {err && <p style={{ color: '#b91c1c', fontSize: '13px', margin: '8px 0 0' }}>{err}</p>}
        <button onClick={attempt} style={{ ...s.primary, width: '100%', marginTop: '14px' }}>
          Enter
        </button>
      </div>
    </div>
  );
}

function SlotsPanel({ secret, onAuthError }: { secret: string; onAuthError: () => void }) {
  const [slots, setSlots]     = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState('');
  const [newDate,  setNewDate]  = useState('');
  const [newTimes, setNewTimes] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [adding,   setAdding]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API_URL}/api/admin/slots`, {
      headers: adminHeaders(secret)
    });
    if (res.status === 401) { onAuthError(); return; }
    const data = await res.json() as { slots: Slot[] };
    setSlots(data.slots ?? []);
    setLoading(false);
  }, [secret, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (slot: Slot) => {
    await fetch(`${API_URL}/api/admin/slots/${encodeURIComponent(slot.id)}`, {
      method:  'PUT',
      headers: adminHeaders(secret),
      body:    JSON.stringify({ is_active: slot.is_active ? 0 : 1 })
    });
    load();
  };

  const deleteSlot = async (slot: Slot) => {
    if (!confirm(`Delete slot ${slot.label} on ${slot.date}? This cannot be undone.`)) return;
    const res = await fetch(`${API_URL}/api/admin/slots/${encodeURIComponent(slot.id)}`, {
      method: 'DELETE', headers: adminHeaders(secret)
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { alert(data.error ?? 'Could not delete slot.'); return; }
    setMsg('Slot deleted.');
    load();
  };

  const cancelBooking = async (slot: Slot) => {
    if (!confirm(
      `Cancel the booking for ${slot.booked_by} on ${slot.date} at ${slot.label}?\n\nA cancellation email will be sent to ${slot.booked_email}.`
    )) return;

    const res = await fetch(
      `${API_URL}/api/admin/slots/${encodeURIComponent(slot.id)}/cancel`,
      { method: 'POST', headers: adminHeaders(secret) }
    );
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) { alert(data.error ?? 'Could not cancel booking.'); return; }
    setMsg(`Booking cancelled and email sent to ${slot.booked_email}.`);
    load();
  };

  const addSlots = async () => {
    if (!newDate || !newTimes || !newPrice) {
      setMsg('Please fill in date, times and price.'); return;
    }
    const price = Math.round(parseFloat(newPrice) * 100);
    if (isNaN(price) || price <= 0) { setMsg('Invalid price.'); return; }

    const times   = newTimes.split(',').map(t => t.trim()).filter(Boolean);
    const payload = times.map(time => ({
      date: newDate, time, price_pence: price, currency: 'gbp',
    }));

    setAdding(true);
    const res  = await fetch(`${API_URL}/api/admin/slots`, {
      method: 'POST', headers: adminHeaders(secret), body: JSON.stringify(payload)
    });
    const data = await res.json() as { created: string[]; errors: unknown[] };
    setMsg(`Created ${data.created.length} slot(s).${data.errors.length ? ' Some errors occurred.' : ''}`);
    setNewDate(''); setNewTimes(''); setNewPrice('');
    setAdding(false);
    load();
  };

  const byDate: Record<string, Slot[]> = {};
  for (const slot of slots) {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot);
  }

  return (
    <div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Add slots</h3>
        <div style={s.row}>
          <div style={s.field}>
            <label style={s.label}>Date</label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={s.input} />
          </div>
          <div style={{ ...s.field, flex: 2 }}>
            <label style={s.label}>Times (comma-separated, 24h)</label>
            <input type="text" value={newTimes} onChange={e => setNewTimes(e.target.value)}
              placeholder="09:00, 10:00, 11:00, 14:00" style={s.input} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Price (£)</label>
            <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)}
              placeholder="75.00" step="0.01" min="0" style={s.input} />
          </div>
          <button onClick={addSlots} disabled={adding} style={{ ...s.primary, alignSelf: 'flex-end' }}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {msg && <p style={{ color: '#2563eb', fontSize: '13px', margin: '8px 0 0' }}>{msg}</p>}
      </div>

      {loading ? <p style={s.muted}>Loading…</p> : (
        Object.entries(byDate).sort().map(([date, daySlots]) => (
          <div key={date} style={s.card}>
            <div style={s.dateHeader}>{formatDate(date)}</div>
            <div style={s.slotList}>
              {daySlots.map(slot => (
                <div key={slot.id} style={{
                  ...s.slotRow,
                  opacity: slot.is_active ? 1 : 0.5,
                  background: slot.booking_status === 'confirmed' ? '#f0fdf4'
                            : slot.booking_status === 'cancelled'  ? '#fef2f2'
                            : '#fff'
                }}>
                  <span style={s.slotLabel}>{slot.label}</span>
                  <span style={s.slotPrice}>£{(slot.price_pence / 100).toFixed(2)}</span>

                  {slot.booking_status === 'confirmed' ? (
                    <>
                      <span style={s.bookedBadge}>Booked — {slot.booked_by}</span>
                      <button onClick={() => cancelBooking(slot)} style={s.cancelBtn}>
                        Cancel booking
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => toggleActive(slot)} style={s.smallBtn}>
                        {slot.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteSlot(slot)} style={s.dangerSmallBtn}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function BookingsPanel({ secret, onAuthError }: { secret: string; onAuthError: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('confirmed');

  useEffect(() => {
    setLoading(true);
    const url = `${API_URL}/api/admin/bookings${filter ? `?status=${filter}` : ''}`;
    fetch(url, { headers: adminHeaders(secret) })
      .then(res => {
        if (res.status === 401) { onAuthError(); return res; }
        return res;
      })
      .then(res => res.json() as Promise<{ bookings: Booking[] }>)
      .then(data => setBookings(data.bookings ?? []))
      .finally(() => setLoading(false));
  }, [secret, onAuthError, filter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: 'pending',   label: 'Pending' },
          { value: '',          label: 'All' },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            style={{ ...s.smallBtn,
              background: filter === f.value ? '#2563eb' : undefined,
              color:      filter === f.value ? '#fff'    : undefined }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <p style={s.muted}>Loading…</p> : bookings.length === 0 ? (
        <p style={s.muted}>No bookings found.</p>
      ) : (
        <div style={s.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                {['Date', 'Time', 'Client', 'Email', 'Paid', 'Status', 'Booked at'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={s.td}>{formatDate(b.date)}</td>
                  <td style={s.td}>{b.label}</td>
                  <td style={s.td}>{b.client_name}</td>
                  <td style={s.td}>
                    <a href={`mailto:${b.client_email}`} style={{ color: '#2563eb' }}>
                      {b.client_email}
                    </a>
                  </td>
                  <td style={s.td}>£{(b.amount_paid_pence / 100).toFixed(2)}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.badge,
                      background: b.status === 'confirmed' ? '#dcfce7'
                                : b.status === 'cancelled'  ? '#fee2e2'
                                : '#fef9c3',
                      color:      b.status === 'confirmed' ? '#166534'
                                : b.status === 'cancelled'  ? '#b91c1c'
                                : '#854d0e'
                    }}>{b.status}</span>
                  </td>
                  <td style={s.td}>{new Date(b.created_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      fontWeight: active ? 600 : 400, fontSize: '14px',
      background: active ? '#2563eb' : 'transparent',
      color: active ? '#fff' : '#555'
    }}>{label}</button>
  );
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
}

const s: Record<string, React.CSSProperties> = {
  page:     { fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f8fafc' },
  topbar:   { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 10 },
  logo:     { fontWeight: 700, fontSize: '16px' },
  content:  { maxWidth: '900px', margin: '0 auto', padding: '24px 16px' },
  card:     { background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardTitle:{ fontSize: '15px', fontWeight: 600, margin: '0 0 14px' },
  row:      { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' },
  field:    { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' },
  label:    { fontSize: '12px', fontWeight: 600, color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:    { padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px',
    fontSize: '14px', outline: 'none' },
  primary:  { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '9px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap' },
  smallBtn: { background: '#f1f5f9', border: 'none', borderRadius: '6px',
    padding: '5px 10px', fontSize: '12px', cursor: 'pointer' },
  dangerSmallBtn: { background: '#fee2e2', border: 'none', borderRadius: '6px',
    padding: '5px 10px', fontSize: '12px', cursor: 'pointer', color: '#b91c1c' },
  cancelBtn:{ background: '#fff3cd', border: 'none', borderRadius: '6px',
    padding: '5px 10px', fontSize: '12px', cursor: 'pointer', color: '#92400e', fontWeight: 500 },
  logoutBtn:{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '13px' },
  dateHeader:{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: '#111' },
  slotList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  slotRow:  { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
    border: '1px solid #f0f0f0', borderRadius: '8px', flexWrap: 'wrap' },
  slotLabel:{ fontWeight: 600, fontSize: '14px', minWidth: '80px' },
  slotPrice:{ color: '#2563eb', fontSize: '13px', flex: 1 },
  bookedBadge:{ background: '#dcfce7', color: '#166534', padding: '3px 8px',
    borderRadius: '6px', fontSize: '12px', fontWeight: 500 },
  muted:    { color: '#888', fontSize: '14px' },
  th:       { textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 600,
    color: '#888', textTransform: 'uppercase' },
  td:       { padding: '10px 10px', fontSize: '13px', color: '#333' },
  badge:    { padding: '2px 8px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 },
};
