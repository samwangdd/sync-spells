import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resolveInitialTheme, THEME_STORAGE_KEY } from './theme';
import './index.css';

// Apply the resolved theme before first paint to avoid a flash of the wrong theme.
const stored = localStorage.getItem(THEME_STORAGE_KEY);
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = resolveInitialTheme(stored, systemPrefersDark);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
