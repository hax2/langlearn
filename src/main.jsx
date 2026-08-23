import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './gemlang/index.css';
import './shell/shell.css';
import Shell from './shell/Shell.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
