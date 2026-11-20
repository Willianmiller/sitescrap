// Helpers compartilhados por todas as fontes de leilão.

function clean(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// "R$ 55.100,00" -> { texto: "R$ 55.100,00", valor: 55100 }
function parseMoney(str) {
  if (!str) return { texto: '', valor: null };
  const m = String(str).replace(/\s+/g, '').match(/R\$\s*([\d.,]+)/i);
  if (!m) return { texto: clean(str), valor: null };
  const raw = m[1];
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let numStr = raw.replace(/\./g, '');
  if (hasComma) numStr = numStr.replace(',', '.');
  else if (!hasDot && hasComma) numStr = raw.replace(',', '.');
  const num = parseFloat(numStr);
  return { texto: 'R$ ' + raw, valor: isNaN(num) ? null : num };
}

// "187" / "187 m²" / "1.234,5" -> número (usa apenas o primeiro número do texto)
function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const found = String(v).match(/-?\d[\d.,]*/);
  if (!found) return null;
  let s = found[0];
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function titleCaseCity(s) {
  return String(s || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizeMatricula(m) {
  const digits = String(m || '').replace(/\D+/g, '');
  return digits.length >= 2 ? digits : '';
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Chave de identidade do imóvel: matrícula ou título+endereço+data normalizados.
// IMPORTANTE: a matrícula mantém a pontuação (só remove espaços e caixa), igual ao
// painel e à API — assim as chaves de exclusão já salvas continuam válidas.
function propertyKey(p) {
  if (p.matricula) return 'M|' + String(p.matricula).replace(/\s+/g, '').toLowerCase();
  return 'T|' + String(p.title || '').toLowerCase().trim() + '|' + String(p.endereco || '').toLowerCase().trim() + '|' + String(p.leilao_data || '');
}

function dateRank(dmy) {
  const m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

function isPast(dmy) {
  const t = dateRank(dmy);
  if (!t) return false;
  return t < Date.now() - 24 * 60 * 60 * 1000;
}

// Mantém um anúncio por imóvel. Prioridade: galeria (>=2 fotos) > nº de fotos > data mais próxima > maior avaliação > menor id.
function dedupeByProperty(arr) {
  const best = {};
  for (const p of arr) {
    const k = propertyKey(p);
    const cur = best[k];
    if (!cur) { best[k] = p; continue; }
    const rank = x => [
      (x.photos || []).length >= 2 ? 1 : 0,
      (x.photos || []).length,
      dateRank(x.leilao_data) ?? Number.MAX_SAFE_INTEGER,
      x.avaliacao || -1,
      -parseInt(x.listing_id, 10) || 0
    ];
    const a = rank(p), b = rank(cur);
    let win = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { win = a[i] > b[i]; break; }
    }
    if (win) best[k] = p;
  }
  return Object.values(best);
}

// Todo o estado do RJ (sem restringir à capital)
function isRJ(item) {
  const t = normalizeText([item.cidade, item.estado, item.endereco, item.title].join(' '));
  if (/\brj\b/.test(t)) return true;
  return t.includes('rio de janeiro');
}

// Verifica se URL é foto real (jpeg/png/webp) e não placeholder/PDF/SVG.
function isPhotoUrl(u) {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(u || '') &&
    !/\/icons\//i.test(u || '') &&
    !/semFoto|logo|\.svg|arrow|heart|location|anner/i.test(u || '');
}

module.exports = {
  clean,
  parseMoney,
  parseNumber,
  normalizeMatricula,
  normalizeText,
  titleCaseCity,
  propertyKey,
  dateRank,
  isPast,
  dedupeByProperty,
  isRJ,
  isPhotoUrl
};