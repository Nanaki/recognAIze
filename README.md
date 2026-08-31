# recognAIze

<!-- Dépôt : Nanaki/recognAIze, privé (passage en public reste une action humaine restante, voir docs/rendu.md). Le badge ci-dessous ne rendra donc rien pour un lecteur externe tant que le dépôt n'est pas public. -->

[![CI](https://github.com/Nanaki/recognAIze/actions/workflows/ci.yml/badge.svg)](https://github.com/Nanaki/recognAIze/actions/workflows/ci.yml)

Outil CLI déterministe et sans réseau qui annonce le rang AI-Driven Development d'un profil de développeur sur la grille laivel-up (White → Gold), avec une fourchette et une confiance quand l'entrée ne suffit pas à trancher.

## Quickstart

Ces deux lignes viennent d'une exécution réelle, sur un clone frais de ce dépôt, juste avant d'écrire cette section (pas recopiées de mémoire) :

```bash
npm ci --ignore-scripts && npm run build
node dist/cli.js analyze fixtures/profiles/bohort
```

`npm ci --ignore-scripts` a installé 138 paquets sans script de cycle de vie ;
`npm run build` a généré `src/checks/index.ts` (48 checks découverts), compilé
`dist/` et copié `referentiel.json`. La seconde commande se termine avec le
code de sortie `0`, sans rien imprimer sur `stdout` (silence = succès), et
écrit `recognaize-cli-out/bohort-<hash>/result.json` + `report.html` (ouvrable en
`file://`, sans serveur). Pour voir le détail : `report.html` (fiche complète,
lisible dans un navigateur) ou `--json` (imprime uniquement `result.json` sur
`stdout`).

### Lancer les 4 profils étalons d'un coup

Testé à l'instant (les 4 sortent avec le code `0`) :

```bash
for p in fixtures/profiles/*/; do
  node dist/cli.js analyze "$p"
done
```

Écrit un dossier par profil sous `recognaize-cli-out/` :
`arthur-<hash>/`, `bohort-<hash>/`, `leodagan-<hash>/`, `perceval-<hash>/` —
chacun avec son `result.json` + `report.html`.

## Ce que l'outil ne fait pas

Aucun enrichissement par un modèle de langage, aucun mode entretien, aucun
mode « dépôt git réel » (recalcul des agrégats depuis `git`/`gh`) **dans ce
binaire** : `node dist/cli.js` ne livre que le chemin déterministe sur un
dossier de profil déclaratif, explicitement hors périmètre, aucune clé d'API
n'est lue par l'outil.

## Codes de sortie

| Code | Signification |
| --- | --- |
| `0` | Analyse produite (même avec avertissements) — silencieux sur `stdout` sauf `--json`. |
| `2` | Refus explicite : le dossier ne contient que `profile.json` (ou est vide) ; la liste de ce qui manque est imprimée. |
| `3` | Environnement non supporté (Node < 20) ou usage invalide (chemin inexistant, option inconnue) — message en français. |
| `1` | Erreur interne — réservé aux défauts, jamais un chemin normal. |

## Second outil, agentique (`scripts/agentic/`, comparatif)

Un second outil coexiste dans ce dépôt, jamais un
remplacement du binaire ci-dessus : le même verdict, produit via des
sous-agents Claude Code (l'outil Agent d'une session Claude Code, jamais un
client API Anthropic provisionné séparément — aucune clé n'est lue non plus
par ce chemin) plutôt que des checks déterministes, pour comparer les deux
résultats. `scripts/agentic/judge-from-signals.ts` réutilise le même
`judge()` — la logique de jugement n'est jamais dupliquée, seule l'extraction
de signaux diffère. Calibré à un match exact sur les 5 axes des 4 étalons.
**Contrairement au binaire déterministe, ce chemin n'a aucune garantie de
répétabilité** : l'extraction est une lecture LLM, pas une fonction pure —
relancer le skill sur le même profil peut légitimement changer un signal, la
confiance, voire le rang affiché.
Formalisé en skill Claude Code : `.claude/skills/recognaize-agentic/`
(`/recognaize-agentic <profil>` ou en langage naturel, dans une session
Claude Code ouverte sur ce dépôt). Écrit un rapport final consolidé dans
`recognaize-out-final/<profil>/{verdict.json,meta.json,report.md}` — jamais dans
`recognaize-cli-out/`, jamais écrasé par un run du CLI seul. `meta.json` porte le
modèle utilisé et une **estimation** (jamais une mesure — l'outil `Agent` ne
renvoie pas l'usage réel à l'orchestrateur) de tokens et de coût, toujours
accompagnée d'une note qui le dit explicitement.
Détail : `aidd_docs/memory/architecture.md` (§ Chemin agentique).

### Lancer le skill agentique sur les 4 profils étalons

Pas un script shell : `/recognaize-agentic` est une commande Claude Code, à
taper telle quelle dans une session Claude Code ouverte sur ce dépôt (aucune
clé d'API, aucun terminal séparé) — une commande par profil, jamais une
boucle bash :

```
/recognaize-agentic fixtures/profiles/perceval
/recognaize-agentic fixtures/profiles/bohort
/recognaize-agentic fixtures/profiles/leodagan
/recognaize-agentic fixtures/profiles/arthur
```

Chacune écrit `recognaize-out-final/<profil>-<hash>/`. Calibré à un match exact
sur les 5 axes des 4 profils.

## Points de vérification (`checks list`)

Sortie réelle de `node dist/cli.js checks list` sur le binaire construit
ci-dessus (48 checks, 5 packs, aucun chemin de preuve sans check) :

<details>
<summary>48 checks enregistrés — cliquer pour déplier</summary>

```
Checks enregistrés : 48
  - H1.default | axe H | marche H1 | sources GA | pack core-git-activity | activé
  - H1.session | axe H | marche H1 | sources S | pack core-session | activé
  - H2.git-activity | axe H | marche H2 | sources GA | pack core-git-activity | activé
  - H2.repo-context | axe H | marche H2 | sources RC | pack core-repo-context | activé
  - H3.git-activity | axe H | marche H3 | sources GA | pack core-git-activity | activé
  - H3.repo-context | axe H | marche H3 | sources RC,GA | pack core-repo-context | activé
  - H4.git-activity | axe H | marche H4 | sources GA | pack core-git-activity | activé
  - H4.repo-context | axe H | marche H4 | sources RC | pack core-repo-context | activé
  - H5.git-activity | axe H | marche H5 | sources GA | pack core-git-activity | activé
  - H5.repo-context | axe H | marche H5 | sources RC | pack core-repo-context | activé
  - H6.repo-context | axe H | marche H6 | sources RC | pack core-repo-context | activé
  - H6.session | axe H | marche H6 | sources S | pack core-session | activé
  - H7.repo-context | axe H | marche H7 | sources RC | pack core-repo-context | activé
  - H7.session | axe H | marche H7 | sources S | pack core-session | activé
  - I1.default | axe I | marche I1 | sources GA | pack core-git-activity | activé
  - I2.git-activity | axe I | marche I2 | sources GA | pack core-git-activity | activé
  - I2.session | axe I | marche I2 | sources S | pack core-session | activé
  - I2.setup | axe I | marche I2 | sources SU | pack core-git-activity | activé
  - I3.git-activity | axe I | marche I3 | sources GA | pack core-git-activity | activé
  - I3.session | axe I | marche I3 | sources S | pack core-session | activé
  - I4.git-activity | axe I | marche I4 | sources GA | pack core-git-activity | activé
  - I4.pull-requests | axe I | marche I4 | sources PR,GA | pack core-git-activity | activé
  - I5.pull-requests | axe I | marche I5 | sources PR | pack core-git-activity | activé
  - O1.default | axe O | marche O1 | sources GA | pack core-git-activity | activé
  - O1.session | axe O | marche O1 | sources S | pack core-session | activé
  - O2.git-activity | axe O | marche O2 | sources GA | pack core-git-activity | activé
  - O2.session | axe O | marche O2 | sources S | pack core-session | activé
  - O2.sonar | axe O | marche O2 | sources SO | pack core-repo-context | activé
  - O3.pull-requests | axe O | marche O3 | sources PR | pack core-git-activity | activé
  - O3.repo-context | axe O | marche O3 | sources RC | pack core-repo-context | activé
  - O3.session | axe O | marche O3 | sources S | pack core-session | activé
  - O4.repo-context | axe O | marche O4 | sources RC | pack core-repo-context | activé
  - O4.session | axe O | marche O4 | sources S | pack core-session | activé
  - O5.repo-context | axe O | marche O5 | sources RC | pack core-repo-context | activé
  - P1.default | axe P | marche P1 | sources GA | pack core-git-activity | activé
  - P2.git-activity | axe P | marche P2 | sources GA,RC | pack core-git-activity | activé
  - P2.session | axe P | marche P2 | sources S | pack core-session | activé
  - P3.git-activity | axe P | marche P3 | sources GA | pack core-git-activity | activé
  - P3.pull-requests | axe P | marche P3 | sources PR | pack core-git-activity | activé
  - T1.default | axe T | marche T1 | sources GA | pack core-git-activity | activé
  - T2.git-activity | axe T | marche T2 | sources GA | pack core-git-activity | activé
  - T2.pull-requests | axe T | marche T2 | sources PR | pack core-git-activity | activé
  - T2.session | axe T | marche T2 | sources S | pack core-session | activé
  - T2.setup | axe T | marche T2 | sources SU | pack core-git-activity | activé
  - T3.git-activity | axe T | marche T3 | sources GA | pack core-git-activity | activé
  - T3.pull-requests | axe T | marche T3 | sources PR | pack core-git-activity | activé
  - T3.session | axe T | marche T3 | sources S | pack core-session | activé
  - T4.git-activity | axe T | marche T4 | sources GA | pack core-git-activity | activé

Avertissements — chemins de preuve sans check (0) :
  (aucun)
```

</details>

`T2.setup`/`I2.setup` (source `SU`) sont des NO-OP délibérés dans ce binaire :
ils existent pour que `T2.p4`/`I2.p3` (indice faible sur un skill/agent de
setup déclaré, jamais une preuve) ne soient pas orphelins du registre, mais
ne produisent jamais d'`Evidence` ici — voir § Second outil, agentique.

Détail par marche : `node dist/cli.js checks explain <marche>` (ex. `T2`), ou
la version documentée : `docs/referentiel.md`.

## Méthode et référentiel

- `docs/comprendre-le-verdict.md` : point d'entrée en langage simple et
  schémas Mermaid — les 5 axes, comment les deux outils construisent un
  verdict. À lire en premier si vous connaissez le sujet (AI-Driven
  Development) mais pas ce projet.
- `METHOD.md` : une page — ce qu'on mesure, les 5 axes, le contrat `Evidence`,
  Ownership assumé non bloquant, hors périmètre.
- `docs/referentiel.md` : les 24 marches, chemins de preuve, contre-preuves,
  sources.
- `aidd_docs/INSTALL.md` : architecture technique complète.

## Fixtures

Les 4 profils étalons (`perceval`, `bohort`, `leodagan`, `arthur`) sous
`fixtures/profiles/` viennent du dépôt public MIT
[`ai-driven-dev/laivel-up`](https://github.com/ai-driven-dev/laivel-up), SHA
épinglé `89b9e35208efdf1b523bdafbf8781be3a3db074a`. Détail complet (licence,
date de copie, procédure de vérification du SHA) : `fixtures/profiles/ATTRIBUTION.md`.

## Statut

Chemin jury complet livré : moteur de vérification, juge,
rapports `result.json`/`report.html`, tolérance aux profils incomplets ou
hostiles, `npm run eval` vert. Second outil agentique livré et calibré
(voir § Second outil, agentique). Poussé sur `Nanaki/recognAIze`
(privé), CI verte sur les 4 jambes (Node 20/22 × Ubuntu/macOS). Reste,
action humaine avant le rendu : rendre le dépôt public, tag `v1.0.0-rendu`
— détail dans `docs/rendu.md`.
