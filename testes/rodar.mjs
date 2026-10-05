/**
 * Runner dos testes.
 *
 * O `src/` usa imports sem extensao (padrao do Vite/bundler), que o Node
 * nao resolve nativamente mesmo com type-stripping ligado. Em vez de sujar o
 * codigo-fonte com `.ts` nos imports, empacotamos o arquivo de teste com o
 * esbuild que ja vem junto com o Vite e rodamos o bundle.
 *
 *   node testes/rodar.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = join(raiz, 'testes/duelo.test.ts');

const dir = mkdtempSync(join(tmpdir(), 'tcg-imperiall-teste-'));
const saida = join(dir, 'duelo.mjs');
let codigo = 1;

try {
  await build({
    entryPoints: [entrada],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: saida,
    // O type-stripping do Node e quem remove os tipos; o esbuild so resolve
    // os imports. `external: node:*` mantem os builtins intactos.
    external: ['node:*'],
    logLevel: 'warning',
  });

  // O arquivo de teste chama `process.exit(1)` quando algo falha.
  const proc = spawnSync(process.execPath, [saida], { stdio: 'inherit' });
  codigo = proc.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// `process.exit` dentro do `finally` nao roda: a flag precisa sair daqui.
process.exit(codigo);
