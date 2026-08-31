# recognAIze

<!-- Dépôt privé pour l'instant : le badge ci-dessous ne s'affichera qu'une fois public. -->

[![CI](https://github.com/Nanaki/recognAIze/actions/workflows/ci.yml/badge.svg)](https://github.com/Nanaki/recognAIze/actions/workflows/ci.yml)

Outil CLI déterministe et sans réseau qui annonce le rang AI-Driven Development d'un profil de développeur sur la grille laivel-up (White → Gold), avec une fourchette et une confiance quand l'entrée ne suffit pas à trancher.

## Installation

Node ≥ 20.

```bash
npm ci --ignore-scripts
npm run build
```

`npm run build` génère `src/checks/index.ts`, compile `dist/` et copie `referentiel.json`.

## Utilisation

```bash
node dist/cli.js analyze <dossier-de-profil>
```

Exemple :

```bash
node dist/cli.js analyze fixtures/profiles/bohort
```

Exit `0`, silencieux sur `stdout` (silence = succès), écrit
`recognaize-cli-out/bohort-<hash>/{result.json,report.html}`.

- `report.html` : fiche complète, à ouvrir dans un navigateur (`file://` suffit, aucun serveur requis).
- `--json` : imprime uniquement `result.json` sur `stdout` (n'écrit alors pas `report.html`).
- `--out <dir>` : change le répertoire de sortie (défaut `./recognaize-cli-out`).

Analyser plusieurs profils : une commande par profil, ou une boucle bash simple —

```bash
for p in fixtures/profiles/*/; do
  node dist/cli.js analyze "$p"
done
```

### Codes de sortie

| Code | Signification |
| --- | --- |
| `0` | Analyse produite (même avec avertissements) — silencieux sur `stdout` sauf `--json`. |
| `2` | Refus explicite : le dossier ne contient que `profile.json` (ou est vide) ; la liste de ce qui manque est imprimée. |
| `3` | Environnement non supporté (Node < 20) ou usage invalide (chemin inexistant, option inconnue) — message en français. |
| `1` | Erreur interne — réservé aux défauts, jamais un chemin normal. |

## Ce que l'outil ne fait pas

Aucun enrichissement par un modèle de langage, aucun mode entretien, aucun
mode « dépôt git réel » (recalcul des agrégats depuis `git`/`gh`) **dans ce
binaire** : `node dist/cli.js` ne livre que le chemin déterministe sur un
dossier de profil déclaratif. Aucune clé d'API n'est lue par l'outil.

## Second chemin, agentique (comparatif, via Claude Code)

Un second chemin vers le même verdict coexiste dans ce dépôt, jamais un
remplacement du binaire ci-dessus : des sous-agents Claude Code (l'outil
`Agent` d'une session Claude Code — jamais un client API Anthropic
provisionné séparément, aucune clé n'est lue non plus par ce chemin)
extraient les mêmes signaux qu'un check déterministe lirait, puis les
soumettent au même juge (`judge()`, jamais dupliqué) pour comparaison.
**Aucune garantie de répétabilité** contrairement au binaire déterministe :
l'extraction est une lecture LLM, pas une fonction pure — relancer sur le
même profil peut changer un signal, la confiance, voire le rang affiché.

À utiliser depuis une session Claude Code ouverte sur ce dépôt (aucune clé
d'API, aucun terminal séparé) :

```
/recognaize-agentic <dossier-de-profil>
```

Écrit `recognaize-out-final/<profil>-<hash>/{verdict.json,meta.json,report-input.json,report.html}`
— jamais dans `recognaize-cli-out/`, jamais écrasé par un run du CLI seul.
`report.html` est rendu par le CLI lui-même (`node dist/cli.js export`,
même renderer que le chemin déterministe), avec un bandeau et une section
de comparaison en plus. `meta.json` porte le modèle utilisé et une
**estimation** (jamais une mesure — l'outil `Agent` ne renvoie pas l'usage
réel) de tokens et de coût, toujours accompagnée d'une note qui le dit.
Détail : `aidd_docs/memory/architecture.md` (§ Chemin agentique).

## Points de vérification (`checks list`)

`node dist/cli.js checks list` liste les points de vérification (checks)
enregistrés — un fichier par (marche × source), regroupés en packs :

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
ne produisent jamais d'`Evidence` ici — voir § Second chemin, agentique.

Détail par marche : `node dist/cli.js checks explain <marche>` (ex. `T2`), ou
la version documentée : `docs/referentiel.md`.

## Méthode et référentiel

- `docs/comprendre-le-verdict.md` : point d'entrée en langage simple et
  schémas Mermaid — les 5 axes, comment les deux chemins construisent un
  verdict. À lire en premier si vous connaissez le sujet (AI-Driven
  Development) mais pas ce projet.
- `METHOD.md` : une page — ce qu'on mesure, les 5 axes, le contrat `Evidence`,
  Ownership assumé non bloquant, hors périmètre.
- `docs/referentiel.md` : les 24 marches, chemins de preuve, contre-preuves,
  sources.
- `aidd_docs/INSTALL.md` : architecture technique complète.

## Fixtures

Les 6 profils sous `fixtures/profiles/` viennent du dépôt public MIT
[`ai-driven-dev/laivel-up`](https://github.com/ai-driven-dev/laivel-up).
Quatre sont des **étalons** au rang documenté (`perceval` red, `bohort`
blue, `leodagan` green, `arthur` copper) — utilisés par `npm run eval`
(« 4/4 rang exact »). Deux (`venec`, `lancelot`) n'ont aucun rang documenté
en amont : jamais ajoutés à `evals/expected.json` (inventer un rang
violerait la garantie « jamais halluciner » de ce projet) — ils servent à
observer le comportement de l'outil sur un profil réellement inconnu, le
scénario jury. Détail complet (licence, SHA épinglé, procédure de
vérification) : `fixtures/profiles/ATTRIBUTION.md`.
