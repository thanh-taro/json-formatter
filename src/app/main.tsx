// MOD-App entry: mounts SCR-Formatter and starts MOD-Host.
import { render } from 'preact';
import './styles/index.css';
import { startTheme } from '../host';
import { Formatter } from './Formatter';

startTheme();
const root = document.getElementById('app');
if (root) render(<Formatter />, root);
