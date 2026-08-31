# Attribution

Les 6 profils (`perceval`, `bohort`, `leodagan`, `arthur`, `venec`, `lancelot`)
présents dans ce dossier proviennent du dépôt public :

- **Source** : [`ai-driven-dev/laivel-up`](https://github.com/ai-driven-dev/laivel-up)
- **Licence** : MIT (voir le `LICENSE` du dépôt source, vérifié — copyright
  « AI-Driven Dev contributors »)
- **SHA épinglé** : `b5e966164195db9f6a2656d9b7a8478123f4e5be`
- **Date de copie** : 2026-08-29 (`perceval`/`bohort`/`leodagan`/`arthur`, SHA
  `89b9e35208efdf1b523bdafbf8781be3a3db074a` à l'origine — vérifié
  BYTE-IDENTIQUE au SHA épinglé ci-dessus au moment de la mise à jour, aucune
  dérive) ; 2026-08-31 (`venec`/`lancelot`, ajoutés à ce SHA)

Seul le sous-dossier `profiles/{perceval,bohort,leodagan,arthur,venec,lancelot}`
du dépôt source a été copié tel quel, sans modification de contenu. Voir
`docs/references/laivel-up-profiles-README.md` pour la description de chaque
profil (niveau, pièces présentes/absentes) telle que documentée par le dépôt
source.

## Étalons vs profils aveugles

- `perceval` (red), `bohort` (blue), `leodagan` (green), `arthur` (copper) :
  des **étalons** — rang attendu documenté par le dépôt source, utilisé par
  `npm run eval` (`evals/expected.json`) pour la garantie « 4/4 rang exact ».
- `venec`, `lancelot` : le dépôt source les documente explicitement comme
  *« non donné »* (`profiles/README.md` du dépôt source) — AUCUN rang attendu
  n'existe, ni ici ni en amont. Jamais ajoutés à `evals/expected.json` : leur
  faire porter un rang inventé violerait la garantie « jamais halluciner un
  rang » de ce projet. Ils servent uniquement à observer le comportement de
  l'outil sur un profil réellement inconnu (le scénario jury), jamais à
  vérifier une valeur précise — voir `aidd_docs/memory/testing.md`.

Pour vérifier que ces fixtures n'ont pas dérivé du SHA épinglé, lancer
`scripts/fixtures-sync.sh` depuis la racine du dépôt.
