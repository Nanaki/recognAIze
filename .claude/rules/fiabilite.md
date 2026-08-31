# Fiabilité (DEC-001)

- Toute fonctionnalité livrée est couverte par un test ou une eval ; sinon elle est retirée avant le rendu.
- `npm run eval` (4/4 rang exact + ablation + déterminisme) doit être vert avant tout commit qui touche `core/`, `checks/` ou `referentiel.json`.
- Un profil incomplet ou illisible ne fait jamais planter l'outil : pièce illisible = absente + avertissement ; analyseur en erreur = checks inconnus + avertissement ; exit 1 réservé aux erreurs internes.
- Même entrée → même `result.json` hors horodatage : tri stable des Evidence, aucune dépendance à l'ordre du système de fichiers.
- Ne jamais afficher un rang sans sa fourchette et sa confiance ; l'inconnu ne prouve jamais rien.
- `core/` n'importe jamais `checks/` ; les seuils vivent dans `referentiel.json`, jamais en littéraux dans les checks.
- Aucune exception ne traverse une frontière : `sources/*` → `{ok,data}|{ok:false,warning}`, `runCheck` → `Evidence[]|{unknown,warning}` ; unique `try/catch` dans `cli.ts`. Exit 1 = bug.
- Zéro `Intl` / `toLocaleString` ; tri par points de code ; `.sort()` après tout `readdir` ; inventaire insensible à la casse.
- Jamais `Date.now()` dans le calcul : date de référence `as_of` dérivée des données ou passée en option.
- NaN / Infinity / division par zéro ⇒ inconnu explicite, jamais `null` silencieux ; entrées Zod en `.passthrough().partial()`, tolérance au niveau du champ ; `referentiel.json` seul en strict.
- Écritures atomiques (tmp + rename) ; `--json` ⇒ stdout JSON seul, tout le reste sur stderr ; `profile_id` assaini avant tout chemin.
- Un test e2e lance le binaire construit (`node dist/cli.js`) sur clone frais ; CI Node 20/22 sans secret est la gate de vérité.

## Test de fonctionnement réel (DEC-005)
- Tout changement touchant `src/report/**`, `src/cli.ts` (sortie), `src/referentiel/concepts.json` ou `docs/referentiel.md` : ouvrir `report.html` dans un vrai navigateur (serveur statique local, jamais `file://`) pour au moins un profil complet, un à trous, un indéterminé ; cliquer réellement sur les liens interactifs ; juger la lisibilité — en plus de `aidd-dev:05-review`, jamais à sa place.
- Toute propriété mécanique découverte à cette occasion (lien qui doit résoudre, absence de undefined/null/NaN, absence d'erreur console) devient immédiatement un test permanent dans `test/report.*.test.ts` — jamais une vérification manuelle répétée.
