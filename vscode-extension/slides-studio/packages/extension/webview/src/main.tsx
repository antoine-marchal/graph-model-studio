import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
const mode = root.dataset.mode === 'masters' ? 'masters' : 'editor';
createRoot(root).render(<App mode={mode} />);
