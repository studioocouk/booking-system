// widget/src/main.tsx
import { StrictMode } from 'react';
import { createRoot }  from 'react-dom/client';
import BookingWidget   from './App';
import AdminApp        from './AdminApp';

// Route to admin panel if path starts with /admin
const isAdmin = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? <AdminApp /> : <BookingWidget />}
  </StrictMode>
);
