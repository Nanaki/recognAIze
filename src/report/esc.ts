/**
 * Échappement HTML unique : `src/report/html.ts` fait passer TOUT contenu
 * recopié du profil analysé (déclaratif, extraits de session, `citation`
 * d'`Evidence`, identifiants de profil, avertissements…) par {@link esc} avant
 * interpolation dans le gabarit — jamais de regex locale redondante, jamais
 * d'interpolation directe.
 *
 * Une seule table couvre à la fois le texte HTML et les attributs
 * (`&<>"'`) : ce rapport n'injecte jamais de contenu de profil dans un attribut
 * `href=`/`on*=` (les rares attributs du gabarit sont des constantes
 * du code, jamais du contenu recopié), donc pas d'échappement d'URL distinct
 * à prévoir.
 */

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Échappe `&`, `<`, `>`, `"`, `'`. Point d'échappement UNIQUE de `report/` —
 * toute nouvelle section de `report/html.ts` doit y passer son contenu de
 * profil, jamais une implémentation locale.
 */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}
