// Catalogue des missions. Pour ajouter une mission : écrire son objet
// (voir missions.js ou diagnostics.js) et l'ajouter à CATALOG.
import { MAIN, m7 } from './missions.js';
import { MAIN_B, m7b } from './missions-b.js';
import { DIAGNOSTICS } from './diagnostics.js';

export const CATALOG = [...MAIN, ...MAIN_B, ...DIAGNOSTICS, m7, m7b];
export const byId = (id) => CATALOG.find((m) => m.id === id) || null;

/** Groupes affichés dans le menu des missions. */
export const GROUPS = [
  { id: 'A', title: 'Parcours A · Je démarre de zéro', items: MAIN.map((m) => m.id) },
  { id: 'B', title: 'Parcours B · J’ai déjà du travail dans mon pod', items: MAIN_B.map((m) => m.id) },
  { id: 'm6', title: '6 · Comprendre une erreur', items: DIAGNOSTICS.map((m) => m.id) },
  { id: 'autonome', title: '7 · Refaire seul', items: [m7.id, m7b.id] },
];

export const MODES = {
  guide: { label: 'Parcours guidé', short: 'Guidé', desc: 'Une consigne à la fois, expliquée.' },
  autonome: { label: 'Entraînement autonome', short: 'Autonome', desc: 'L’objectif reste visible ; les indications détaillées sont masquées.' },
  depannage: { label: 'Atelier de dépannage', short: 'Dépannage', desc: 'Une situation problématique : observer, identifier, agir.' },
};

/** Mode effectif d'une mission selon la préférence de l'apprenant. */
export function modeFor(mission, pref) {
  if (mission.mode === 'depannage') return 'depannage';
  if (mission.autonomousOnly) return 'autonome';
  return pref === 'autonome' ? 'autonome' : 'guide';
}
