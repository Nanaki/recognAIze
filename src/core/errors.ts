// Types d'erreur et mappage vers les codes de sortie (voir .claude/rules/fiabilite.md
// et la section « Hard constraints » de la spec verrouillée) :
//
//   0 = analyse produite, même avec avertissements.
//   1 = erreur interne — réservé aux défauts, jamais provoqué volontairement.
//   2 = refus explicite — le dossier ne contient que `profile.json` (ou aucune pièce
//       reconnue, ex. dépôt git vide).
//   3 = environnement non supporté ou usage invalide — Node < 20, chemin inexistant,
//       option inconnue, `--mode repo` (hors périmètre de ce run, US-022).
//
// `src/cli.ts` contient l'unique `try/catch` du programme ; ces classes existent pour
// que ce catch distingue explicitement un refus ou un mauvais usage d'un vrai bug,
// plutôt que de tout renvoyer sur le code 1 par défaut.

export const EXIT_SUCCESS = 0;
export const EXIT_INTERNAL_ERROR = 1;
export const EXIT_REFUSED = 2;
export const EXIT_USAGE = 3;

/**
 * Refus explicite (exit 2) : le dossier analysé ne fournit pas assez de pièces pour
 * produire une analyse (vide, ou réduit à `profile.json` seul / à un dépôt git vide).
 */
export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
}

/**
 * Environnement non supporté ou usage invalide (exit 3) : version de Node trop
 * ancienne, chemin inexistant, option ou valeur d'option inconnue, `--mode repo`.
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
