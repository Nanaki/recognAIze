# Méthode

## Ce qu'on mesure, et pourquoi

recognAIze lit un dossier de profil (pièces optionnelles : `git-activity.json`,
`pull-requests.json`, `repo-context/`, `session.md`, mesures Sonar,
`declaratif.md`) et en déduit un rang sur la grille laivel-up (White → Gold).
Le différenciateur n'est pas la finesse du référentiel mais l'honnêteté sur
l'incertitude : chaque rang vient avec une fourchette (`bas`–`haut`), une
confiance, et la liste de ce qui manque pour trancher. Rien n'est deviné ;
une pièce absente ou illisible rend ses marches `inconnu`, jamais `absent`
par erreur ni cause de plantage.

## Les 5 axes

- **T — Taille** : la taille habituelle des features livrées avec l'IA (pas la
  plus grosse jamais faite).
- **H — Harness** : ce qui entoure le modèle — identité projet, mémoire
  vivante, comportements versionnés, guardrails, boucles, orchestration.
- **I — Intervention** : le moment où l'humain corrige — après coup, en
  cadrage amont, aux étapes clés, jamais.
- **P — Parallèle** : le nombre de chantiers menés de front.
- **O — Ownership** : ce que la personne comprend et garde en main — calculé
  et affiché, mais **non bloquant** (voir plus bas).

Chaque axe a 3 à 7 marches, chacune avec ses chemins de preuve, ses
contre-preuves et ses sources. Le rang final vient d'une ligne de montée : Red
exige T1/H1/I1/P1, Blue ajoute T2/H2/H3/I2, Green ajoute T3/H4/I3, Copper
ajoute P2/P3, Silver ajoute H5/H6/I4, Gold ajoute H7/I5. Détail complet des 24
marches, seuils exacts et sources : `docs/referentiel.md`.

## Le contrat `Evidence`

Chaque check produit des preuves élémentaires, jamais un rang directement :

```
Evidence { path_id, signal_id, source, valeur, polarite, force, confiance_source }
```

- `path_id` : le chemin de preuve visé (ex. `T2.p1`) ;
- `source` : `GA`/`RC`/`PR`/`SO`/`S`/`SU`/`DEC`, avec un poids fixe (`confiance_source`) —
  `SU` (« Setup ») porte un indice FAIBLE sur T2/I2 depuis
  un skill/agent déclaré spécifique, jamais une preuve ; hors de portée du
  binaire déterministe (voir `docs/referentiel.md` § Source SU) ;
- `polarite` : `preuve` ou `contre-preuve` ;
- `force` : `prouve` (trace récurrente) ou `indice` (isolé, jamais suffisant seul) ;
- `valeur` : la mesure observée, affichée à côté du seuil dans la fiche.

Le juge (`core/judge.ts`) transforme ces preuves en 6 états par marche
(`infirmé` > `prouvé` > `indice` > `compris` > `déclaré` > `inconnu` —
`compris` réservé à l'entretien, hors périmètre), puis en rang, fourchette et
confiance, sans jamais connaître un check directement.

## Ownership : affiché, non bloquant (DEC-003)

Ownership est calculé et affiché comme les autres axes (marches, prochaine
étape), mais il ne participe pas à la ligne de montée officielle. Le rang
reste décidé par T/H/I/P. Si Ownership est ≥ 2 rangs sous le rang des 4 axes
officiels, le rang affiché baisse d'un cran au plus, avec la raison mentionnée
explicitement — jamais silencieusement. Décision assumée : sur les 4 profils
étalons, Ownership n'était jamais décisif, donc jamais calibré ; un veto non
calibré n'aurait produit que des faux négatifs sur des profils inédits.
Réactivable en axe bloquant via `referentiel.json` (`ownership.blocking`).

## Hors périmètre

Aucun enrichissement par un modèle de langage, aucun mode entretien, aucun
mode « dépôt git réel » (recalcul depuis `git`/`gh`) : le chemin livré est
100 % déterministe et sans réseau, sur un dossier de profil déclaratif. Les
marches Silver/Gold les plus fines (H7, I5, O5, T4) sont détectées de façon
grossière ou laissées `inconnu` — aucune prétention à classer finement un
profil Silver ou Gold. Aucune détection de « code généré par IA » (non
fiable) ; seules les traces d'usage comptent. Le rang n'est jamais plafonné
par la qualité du code (badge informatif seulement).
