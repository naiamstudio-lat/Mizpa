import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './styles/index.css';
// Own file, own `@media print` block. It is deliberately not folded into
// `index.css`: scoping a print stylesheet is a separate, reviewable concern from
// the app's screen palette, and the scoping rule is the part that has to be read
// carefully.
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);