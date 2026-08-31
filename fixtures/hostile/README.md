# Fixture hostile

Dossier de profil volontairement hostile, utilisé par `test/sources/read.test.ts`
(Part 3, phase 1), par les blocs « cas hostiles » ajoutés phase 4 dans chaque
`test/sources/<source>.test.ts`, par `test/sources/contract-sweep.test.ts`, et
par le test e2e « profil hostile » de la phase 4
(`node dist/cli.js analyze fixtures/hostile` → exit 0, voir `test/e2e-jury.test.ts`).

État actuel (Part 3, phase 4) : couvre maintenant plusieurs pièces au-delà de
`code/`/`declaratif.md`/`profile.json` — `git-activity.json`,
`sonar-measures.json`, `session.md`, `repo-context/` — pour que le test e2e
exerce plusieurs adaptateurs, pas seulement la présence brute des pièces. La
Part 6 ajoutera d'autres cas hostiles (report.html, autres payloads) — ce
dossier grandira encore, il n'a pas vocation à rester figé ici.

## Contenu et cas couvert

- `profile.json` — précédé d'un BOM UTF-8 et en fin de ligne CRLF. Sert
  plusieurs rôles à la fois : (1) rend ce dossier reconnaissable comme un
  profil (mode détecté automatiquement) ; (2) fixture du cas « BOM + CRLF
  routinier » — doit être lu **normalement, sans avertissement** (ce n'est
  PAS un cas hostile pour `read.ts`, juste une variante d'encodage courante à
  absorber silencieusement) ; (3) `profile_id` contient un emoji
  (`hostile-fixture-🤖`), cas cité par le plan de la Part 3 (§ Files to
  create) ; (4) `available` déclare `pull-requests.json` PRÉSENT alors qu'il
  est ABSENT sur disque — incohérence volontaire, détectée et avertie par
  `profile.ts` (`available_incoherent`).
- `git-activity.json` — champs présents mais mal typés/hors bornes :
  `commits.ai_coauthored_ratio` en chaîne (`"0.91"`),
  `commits.message_convention_compliance` hors `[0;1]` (`1.5`),
  `pull_requests.total` négatif (`-3`), `pull_requests.size_distribution:
  null`, et un champ top-level inconnu — chacun devient « ce champ inconnu »,
  avec avertissement nommé, sans jamais faire planter `git-activity.ts`.
- `sonar-measures.json` — `coverage` non numérique, `bugs` non entier
  (`"3.5"`), `duplicated_lines_density` hors bornes (`"250"`, > 100 avant
  division) — chaque métrique devient inconnue, avertissement nommé,
  `sonar.ts` ne plante jamais.
- `session.md` — texte libre sans aucune ligne `**Locuteur**` isolée ni
  `### Tour N` : structure non reconnue, `session.ts` rend un digest vide +
  avertissement `no_recognized_turns`, jamais une exception.
- `declaratif.md` — texte UTF-8/LF ordinaire contenant un payload
  `<script>alert('xss')</script>` dans une valeur de champ déclaratif. Le
  fichier lui-même n'est pas hostile à lire (`read.ts` le lit sans
  avertissement) ; c'est son CONTENU qui servira aux futurs tests
  d'échappement HTML de `report.html` (Part 6, hors périmètre ici).
- `repo-context/AGENTS.md` — identity file minimal, pour que `repo-context.ts`
  ait au moins un artefact à inventorier même dans ce dossier hostile.
- `repo-context/node_modules/some-pkg/` — dossier recopié à un emplacement non
  reconnu de `repo-context/` : `repo-context.ts` ne fait jamais de parcours
  générique (seuls les emplacements connus du harness sont résolus), donc ce
  dossier n'est jamais visité — cas « node_modules/ recopié » cité par le plan
  de la Part 3.
- `code/huge-generated.txt` — 3 000 001 octets (`x` répété), dépasse le
  plafond de 2 Mo (`MAX_FILE_BYTES` dans `src/sources/read.ts`). Doit être
  ignoré avec un avertissement `{code:"file_too_large", file, cause}`, jamais
  lu en entier.
- `code/escape-link` — VRAI lien symbolique sur disque (`ln -s /tmp …`)
  pointant hors de `fixtures/hostile/`. Ne doit jamais être suivi ; doit
  produire un avertissement `{code:"symlink_escapes_root", file, cause}`.
- `code/hello.ts` — petit fichier texte légitime, pour que l'arborescence
  `code/` ne soit pas réduite à des cas hostiles.

## Volontairement absent de cette fixture

- Le cas « plafond de 200 fichiers texte atteint » n'est PAS reproduit ici
  (créer 200+ fichiers dans une fixture versionnée serait inutilement
  coûteux) — il est testé via un dossier temporaire généré dans
  `test/sources/read.test.ts` et `test/sources/repo-context.test.ts`.
- Les fichiers UTF-16 (avec et sans BOM) ne sont pas non plus dans cette
  fixture versionnée, pour la même raison — testés via des fichiers réels
  écrits dans un tmpdir par `test/sources/read.test.ts` et par les blocs « cas
  hostiles » de chaque `test/sources/<source>.test.ts`.
- `pull-requests.json` reste absent du disque (voir l'incohérence volontaire
  de `profile.json` ci-dessus) — un test de contrat dédié à
  `pull-requests.json` hostile existe déjà dans `test/sources/pull-requests.test.ts`
  (tmpdir généré), pas besoin de dupliquer cette pièce ici.
- Ce dossier n'est PAS la fixture hostile complète de la Part 6 (qui ajoutera
  encore d'autres cas, ex. pour `report.html`) — juste ce qu'il faut pour le
  gate de la Part 3 (« les 4 profils parsent », sam. 10h).
