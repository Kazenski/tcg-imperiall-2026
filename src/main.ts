import './styles.css';
import { iniciar } from './ui/app.ts';

// O boot é assíncrono: carrega o cartas-admin.json do GitHub
// Pages antes de montar o duelo. Sem top-level await (target
// es2020) — fire and catch.
iniciar().catch((e) => console.error('Falha ao iniciar:', e));
