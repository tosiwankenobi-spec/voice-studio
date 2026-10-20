export type Pronunciation = { term: string; say_as: string };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** One pass: longest terms first; replacement spellings never cascade. */
export function applyPronunciations(text: string, entries: Pronunciation[]) {
  const terms = entries.filter(e => e.term.trim()).sort((a, b) => b.term.length - a.term.length);
  if (!terms.length) return text;
  const lookup = new Map(terms.map(e => [e.term.toLowerCase(), e.say_as]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.map(e => escape(e.term)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return text.replace(re, match => lookup.get(match.toLowerCase()) ?? match);
}
const common = new Set('I A The This That These Those We You He She It They My Our Your Hello Welcome Today Tomorrow Yesterday When Where What Why How In On At To From For And But Or So If Is Are Was Were Have Has Be With Thanks Thank Next First Last Now Here There Please Let Good Great New One Two Three'.toLowerCase().split(' '));
export function pronunciationSuggestions(text: string, entries: Pronunciation[]) {
  const known = new Set(entries.map(e => e.term.toLowerCase()));
  return [...new Set(text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [])].filter(t => !common.has(t.toLowerCase()) && !known.has(t.toLowerCase())).slice(0, 5);
}