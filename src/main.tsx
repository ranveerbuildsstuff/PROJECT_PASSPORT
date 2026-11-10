import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';
import App from './App';
import './index.css';

// Initialize theme from localStorage before render to prevent flash
try {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
} catch {
  // localStorage blocked or restricted
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
