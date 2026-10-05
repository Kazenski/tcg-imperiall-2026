/**
 * Recorta as capturas de tela do jogo em pedaços menores para o
 * tutorial. Só serve para gerar as imagens de `public/docs/`.
 *
 *   node scripts/recortar.mjs
 *
 * Precisa de uma captura "_board-limpo.png" (a mesa inteira, sem a
 * seta) em `public/docs/`; para as imagens que precisam da seta,
 * aponte BASE_CAPTURA para a captura com a seta:
 *
 *   BASE_CAPTURA=_board-full.png SO_PEDACOS=09-seta-ataque.png node scripts/recortar.mjs
 *
 * Os "_board-*.png" são insumo e estão no .gitignore; os pedaços
 * que vão para o site é que ficam versionados.
 *
 * Não é parte do build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { join } from 'node:path';

/* ---------- PNG: decodifica, recorta, recodifica ---------- */

function lerPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let off = 8;
  const idat = [];
  let largura = 0;
  let altura = 0;
  let profundidade = 8;
  let cor = 6;
  while (off < buf.length) {
    const tamanho = buf.readUInt32BE(off);
    const tipo = buf.toString('ascii', off + 4, off + 8);
    const dados = buf.subarray(off + 8, off + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      profundidade = dados[8];
      cor = dados[9];
    } else if (tipo === 'IDAT') idat.push(dados);
    else if (tipo === 'IEND') break;
    off += 12 + tamanho;
  }
  if (profundidade !== 8) throw new Error('só 8 bits por canal');
  const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[cor];
  if (!canais) throw new Error(`tipo de cor ${cor} não suportado`);
  const cru = inflateSync(Buffer.concat(idat));
  const passo = largura * canais;
  const pixels = Buffer.alloc(altura * passo);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (passo + 1)];
    const linha = cru.subarray(y * (passo + 1) + 1, y * (passo + 1) + 1 + passo);
    const ant = y > 0 ? pixels.subarray((y - 1) * passo, y * passo) : null;
    const dst = pixels.subarray(y * passo, (y + 1) * passo);
    for (let x = 0; x < passo; x++) {
      const a = x >= canais ? dst[x - canais] : 0;
      const b = ant ? ant[x] : 0;
      const c = ant && x >= canais ? ant[x - canais] : 0;
      let v = linha[x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      dst[x] = v & 0xff;
    }
  }
  return { largura, altura, canais, pixels };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(tipo, dados) {
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(dados.length, 0);
  cab.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), dados])), 0);
  return Buffer.concat([cab, dados, crc]);
}

function escreverPng(caminho, { largura, altura, canais, pixels }) {
  const passo = largura * canais;
  const cru = Buffer.alloc(altura * (passo + 1));
  for (let y = 0; y < altura; y++) {
    cru[y * (passo + 1)] = 0; // filtro none
    pixels.copy(cru, y * (passo + 1) + 1, y * passo, (y + 1) * passo);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = canais === 4 ? 6 : 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(cru, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(caminho, png);
}

function recortar(origem, { x, y, largura, altura }) {
  const img = lerPng(readFileSync(origem));
  const X = Math.max(0, Math.min(x, img.largura - 1));
  const Y = Math.max(0, Math.min(y, img.altura - 1));
  const L = Math.max(1, Math.min(largura, img.largura - X));
  const A = Math.max(1, Math.min(altura, img.altura - Y));
  const passo = img.largura * img.canais;
  const pixels = Buffer.alloc(L * A * img.canais);
  for (let linha = 0; linha < A; linha++) {
    img.pixels.copy(
      pixels,
      linha * L * img.canais,
      (Y + linha) * passo + X * img.canais,
      (Y + linha) * passo + (X + L) * img.canais,
    );
  }
  return { largura: L, altura: A, canais: img.canais, pixels };
}

/* ---------- os pedaços do tutorial ---------- */

// `BASE_CAPTURA` escolhe a captura de origem e `SO_PEDACOS` filtra
// quais saídas gerar (ex.: só as que precisam da seta).
const BASE = 'public/docs';
const FULL = join(BASE, process.env.BASE_CAPTURA ?? '_board-limpo.png');
const SO = (process.env.SO_PEDACOS ?? '').split(',').filter(Boolean);

const PEDACOS = [
  ['01-hud.png', { x: 8, y: 8, largura: 736, altura: 130 }],
  ['02-log-regras.png', { x: 8, y: 142, largura: 736, altura: 218 }],
  ['03-fases.png', { x: 8, y: 672, largura: 736, altura: 80 }],
  ['04-campo-inimigo.png', { x: 8, y: 356, largura: 736, altura: 312 }],
  ['05-pilha-cheia.png', { x: 30, y: 775, largura: 132, altura: 452 }],
  ['06-pilha-3.png', { x: 152, y: 945, largura: 120, altura: 282 }],
  ['07-mao.png', { x: 8, y: 1233, largura: 736, altura: 222 }],
  ['08-detalhes.png', { x: 8, y: 1463, largura: 736, altura: 380 }],
  ['09-seta-ataque.png', { x: 8, y: 8, largura: 736, altura: 1225 }],
  ['10-board-completo.png', { x: 0, y: 0, largura: 744, altura: 1850 }],
];

for (const [nome, caixa] of PEDACOS) {
  if (SO.length > 0 && !SO.includes(nome)) continue;
  const img = recortar(FULL, caixa);
  escreverPng(join(BASE, nome), img);
  console.log(`${nome}  ${img.largura}x${img.altura}`);
}