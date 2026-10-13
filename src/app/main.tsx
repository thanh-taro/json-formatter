// MOD-App entry: mounts SCR-Formatter and starts MOD-Host.
import { render } from 'preact';
import './styles/index.css';
import { startHost } from '../host';
import { startOffline } from '../host/offline';
import { Formatter } from './Formatter';

const root = document.getElementById('app');
if (root) render(<Formatter />, root);
// Implements: F-008.R1, F-008.R5 — after the first render, so the ready signal follows it.
startHost();
// Implements: F-011.R1 — offline support registers after the first render (ADR-0012).
startOffline();
