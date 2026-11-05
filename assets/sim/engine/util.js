// Utilitaires purs du moteur : aucune dépendance au DOM, testables sous Node.

/** Copie profonde d'un état sérialisable (l'état du simulateur l'est toujours). */
export const clone = (o) => JSON.parse(JSON.stringify(o));

/** Empreinte hexadécimale de 40 caractères, déterministe (forme d'un SHA-1, sans en être un). */
export function hash40(str) {
  let seed = 0x811c9dc5;
  let out = '';
  for (let round = 0; round < 5; round++) {
    let h = (seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    out += h.toString(16).padStart(8, '0');
    seed = h;
  }
  return out;
}

export const short = (sha) => (sha || '').slice(0, 7);

// ---- Dates du scénario (chaînes AAAA-MM-JJ, en UTC) ----
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function frDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MOIS[m - 1]} ${y}`;
}
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Format court à l'anglaise, comme dans l'interface GitLab (« Mar 09, 2026 »). */
export function enDate(iso) {
  if (!iso) return 'Never';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS_EN[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

// ---- Jetons d'entraînement ----
export const DEMO_PREFIX = 'DEMO-TOKEN-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Génère une valeur de jeton d'entraînement, toujours préfixée par DEMO-TOKEN-. */
export function makeTokenValue(rng = Math.random) {
  let s = '';
  for (let i = 0; i < 20; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return DEMO_PREFIX + s;
}

/** Une valeur a-t-elle la forme d'un jeton d'entraînement ? (ne dit pas s'il est valide) */
export const isDemoTokenShape = (v) => typeof v === 'string' && /^DEMO-TOKEN-[A-Za-z0-9]{1,40}$/.test(v.trim());

/**
 * Classe une saisie destinée à un champ de jeton, SANS jamais la conserver.
 * - 'demo'  : forme d'un jeton d'entraînement, peut être vérifiée par le moteur ;
 * - 'real'  : ressemble à un vrai jeton (glpat-, gldt-…) : à écarter immédiatement ;
 * - 'other' : toute autre valeur : à écarter.
 */
export function classifySecret(v) {
  if (typeof v !== 'string' || !v.trim()) return 'empty';
  const t = v.trim();
  if (isDemoTokenShape(t)) return 'demo';
  if (/^(gl[a-z]{2,4}-|ghp_|github_pat_|glpat)/i.test(t)) return 'real';
  return 'other';
}

/** Masque toute valeur sensible dans un texte destiné à l'affichage ou à l'historique. */
export function redact(text) {
  return String(text)
    .replace(/(https?:\/\/[^\s:@/]+):([^\s@/]+)@/g, '$1:••••••@')
    .replace(/\bDEMO-TOKEN-[A-Za-z0-9]+/g, 'DEMO-TOKEN-••••')
    .replace(/\b(gl[a-z]{2,4}-|ghp_|github_pat_)[A-Za-z0-9_\-]+/gi, '$1••••');
}

/** Découpe une ligne de commande façon shell (guillemets simples et doubles). */
export function shellSplit(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) { cur += line[++i]; }
      else cur += c;
    } else if (c === '"' || c === "'") { quote = c; has = true; }
    else if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } }
    else if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; }
    else { cur += c; has = true; }
  }
  if (quote) return { error: 'quote', args: out };
  if (has || cur) out.push(cur);
  return { args: out };
}

/** Chemins POSIX simplifiés. */
export function joinPath(base, rel) {
  if (!rel) return base;
  const parts = (rel.startsWith('/') ? rel : base + '/' + rel).split('/');
  const st = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') st.pop(); else st.push(p);
  }
  return '/' + st.join('/');
}
export const basename = (p) => p.replace(/\/+$/, '').split('/').pop();
export const dirname = (p) => p.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/';
export function tildify(p, home) {
  if (p === home) return '~';
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
}
