import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id \"root\" not found');
}

const root = createRoot(rootElement);

// In development, keep StrictMode to surface potential issues.
// In production, render without StrictMode to avoid double-invoking
// components/effects, which can add extra work on initial load and hurt LCP.
if (import.meta.env.MODE === 'development') {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  root.render(<App />);
}
