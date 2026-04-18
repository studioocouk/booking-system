// Booking Widget — entry point
// Renders inside an iframe on the Hostinger site.
// Routes: / (slot picker) → /checkout (form) → /success

import { useState, useEffect } from 'react';
import SlotPicker   from './SlotPicker';
import CheckoutForm from './CheckoutForm';
import SuccessPage  from './SuccessPage';

const API_URL = import.meta.env.VITE_API_URL; // set in .env / Pages env vars

export type Slot = {
  id: string;
  date: string;
  time: string;
  label: string;
  price_pence: number;
  currency: string;
};

export default function BookingWidget() {
  // Simple hash-based routing — works in iframes without server config
  const [route, setRoute]   = useState(window.location.hash || '#/');
  const [selected, setSelected] = useState<Slot | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = (path: string) => {
    window.location.hash = path;
  };

  // Success page — Stripe redirects here with ?session_id=
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (sessionId || route === '#/success') {
    return <SuccessPage />;
  }

  if (route === '#/checkout' && selected) {
    return (
      <CheckoutForm
        slot={selected}
        apiUrl={API_URL}
        onBack={() => { setSelected(null); goTo('#/'); }}
      />
    );
  }

  return (
    <SlotPicker
      apiUrl={API_URL}
      onSelect={(slot) => {
        setSelected(slot);
        goTo('#/checkout');
      }}
    />
  );
}
