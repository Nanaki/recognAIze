---
name: features
description: Capacités livrées du produit, par domaine
argument-hint: N/A
scope: all
---

# Capacités du produit

Catalogue des capacités livrées de recognAIze, condensé depuis les user stories. Détail des seuils : `docs/referentiel.md` ; détail des gates de fiabilité : `aidd_docs/memory/testing.md` ; décisions d'architecture : `ADR.md`.

## Chemin jury (mode profil, déterministe)

- Lancement en deux commandes (`npm ci && npm run build` puis `node dist/cli.js analyze <profil>`), mode profil détecté automatiquement (`--mode` force le mode dépôt), options `--out`, `--json`, `--as-of`. Codes de sortie : `0` analyse produite, `2` refus explicite (pièces minimales absentes), `3` environnement non supporté (Node < 20) ou usage invalide, `1` réservé aux bugs internes (DEC-001). Node < 20 refusé avant tout import ESM.
- Lecture tolérante de chaque pièce (`profile.json`, `git-activity.json`, `pull-requests.json`, `session.md`, `repo-context/`, `declaratif.md`) : pièce absente ou JSON illisible ⇒ champ inconnu + avertissement nommant le fichier et la cause, jamais d'exception (`{ok,data}|{ok:false,warning}` à la frontière `sources/*`). BOM et CRLF normalisés ; champs mal typés ignorés au niveau du champ (`.passthrough().partial()`) ; `pull-requests.json` accepte objet paginé, tableau vide ou doublons (dédupliqués par `number`) ; symlinks sortants ignorés, fichiers > 2 Mo ignorés, `code/` borné à 200 fichiers ; le disque fait foi sur `profile.json.available`.
- Référentiel unique (`referentiel.json`, schéma Zod strict) : axes, marches, chemins de preuve, sources, seuils. `checks list` échoue au démarrage si un seuil ou un chemin de preuve manque ; avertit si une marche du référentiel n'a aucun check.
- Juge générique (`core/judge.ts`) : convertit les Evidence en état par marche (priorité infirmé > prouvé > indice > compris > déclaré > inconnu), interpole une ligne de montée par axe (une marche « déclaré » est franchie par interpolation, jamais bloquante), retourne rang, fourchette et confiance. Confiance d'axe à 0 si aucun check n'a de source ; confiance globale = min des 4 axes officiels. Monotone : retirer une Evidence ne fait jamais monter le rang ponctuel.
- Taille/Intervention/Parallèle mesurés depuis `git-activity.json` (médiane par classes de taille avec règle de frontière, corrections après ouverture, dénominateur = PR mergées dans la fenêtre si disponible sinon total avec avertissement, parallélisme) — jamais de `NaN` : dénominateur nul ⇒ marche inconnue avec raison explicite.
- Harnais (axe H) depuis un inventaire tool-agnostique de `repo-context/` (identité, mémoire, règle, skill, agent, hook, deny-list, prompt ; comparaison de noms insensible à la casse) : seuil de spécificité (≥ 2 indices) pour qu'une identité compte comme spécifique, mémoire prouvée seulement avec `last_updated` dans la fenêtre, comportements prouvés dès qu'il existe des skills/agents même sans règle, un document décrivant une boucle non exécutée n'est jamais une preuve d'automatisation (H6), guardrails prouvés via `permissions.deny`.
- Digest déterministe de `session.md` (tours reconnus par alternance, structures `**Human**/**AI**` et `### Tour N`, normalisation BOM/CRLF/espaces insécables, troncature à 600 tokens pour un fichier énorme) : signaux de cadrage, tests d'abord, relecture ciblée, question de clarification, correction de contexte → indices seulement, jamais une preuve à eux seuls (une session ne prouve aucune marche).
- Miroir déclaré vs observé (`declaratif.md`, pack `core-declaratif`) : affiché, jamais pris en compte dans le calcul du rang — logique de rendu pure dans `report/html.ts`, `confiance_source = 0` sur tout le pack (DEC-004). L'indice négatif (déclaratif contredit l'absence de trace) est affiché dans le miroir mais n'a aucun effet sur la confiance ou le rang calculés — seulement sur l'affichage HTML, qui le dit explicitement au lecteur. Si une trace prouve la marche, le déclaratif est ignoré.
- Axe Ownership : calculé et affiché, ne participe jamais à la ligne de montée officielle ; peut seulement abaisser le rang affiché d'un cran au plus (jamais plus), avec mention explicite (DEC-003) ; un mode `ownership.blocking` existe pour le faire participer à la ligne de montée si besoin.
- `result.json` versionné (`schema_version`, `tool_version`, `referentiel_hash`, `node_version`, `as_of`, `warnings[]`, `evidence[]`, `verdicts[]`), Evidence triées par (axe, marche, source, check_id) par points de code, écriture atomique (tmp + rename), `--json` isole stdout du reste (une casse `EPIPE` ne produit pas `exit 1`), sujet assaini (slug ASCII + hash) avant tout chemin de sortie — jamais rien écrit hors de `--out`. Deux exécutions consécutives produisent des fichiers identiques hors horodatage.
- `report.html` autonome (aucun CDN, ouvrable en `file://`, ≤ 2 Mo, polices système, SVG inline) : titre honnête (fourchette avec point bas et sa cause, confiance), marche bloquante par axe avec raison chiffrée, carte par concept (état, chemins de preuve et leur statut, valeur observée à côté du seuil, Evidence citées, lien de fiche), section « ce qui manque pour trancher », contenu échappé (`<script>`/`</div>` neutralisés), aucun `undefined`/`null`/`NaN` visible, badge qualité, miroir déclaré/observé.
- `checks explain <marche>` : chemins de preuve, sources, seuils toujours affichés ; si un profil est fourni, valeur observée (citation chiffrée), état résolu et raison — réutilise le pipeline complet d'analyse (une marche peut être infirmée par une incohérence croisée à l'échelle de l'axe, pas seulement par ses propres chemins de preuve). Marche inconnue ⇒ message listant les marches valides, `exit 3`.

## Fiabilité

Gates détaillées dans `aidd_docs/memory/testing.md` : e2e sur le binaire construit (`node dist/cli.js`), `npm run eval` (4/4 rang exact avec Ownership on/off, fixtures négatives, ablation, hold-out ≥ 3 mutants, garde anti-littéral, anti-richesse, `path_id` orphelins), property tests du juge (monotonie, invariance par permutation, idempotence, rang prouvé ≤ ponctuel ≤ haut de fourchette, rabais Ownership ≤ 1), invariants runtime (avertissement en CLI, échec en test), fuzzer 200 mutants (`exit ∈ {0, 2}`), contract tests par source, dépôt gelé sans secret (gitleaks sur tout l'historique avant rendu).

## Livrables jury

- README (lancement en deux lignes vérifiées sur clone frais, sortie `checks list`, ce que l'outil ne fait pas, codes de sortie), `METHOD.md` (une page : ce qui est mesuré et pourquoi, 5 axes, contrat Evidence, Ownership assumé non bloquant, hors périmètre), `docs/referentiel.md` (24 marches avec chemins de preuve, contre-preuves, sources), `docs/comprendre-le-verdict.md` (point d'entrée en langage simple, schémas).
- Prochaine marche par axe : `src/referentiel/concepts.json` porte une description et un lien vers une fiche de cours publique pour chaque marche (jamais de copie de contenu) ; le rapport affiche la prochaine marche à franchir par axe avec ce qui manque, ou « au sommet de cet axe » au niveau maximal.

## Second outil, agentique (comparatif, jamais un remplacement)

Détaillé dans le README (§ Second outil, agentique) et `aidd_docs/memory/architecture.md` : sous-agents Claude Code par axe qui extraient des signaux (jamais un jugement), pont déterministe qui réutilise le même `judge()` que le chemin CLI, rapport final consolidé dans `recognaize-out-final/`. Aucune garantie de répétabilité run-à-run (extraction LLM, pas une fonction pure) — à la différence du chemin déterministe.

## Hors périmètre de `node dist/cli.js`

Explicitement hors binaire (README § Ce que l'outil ne fait pas) : mode dépôt git réel (recalcul des agrégats depuis `git`/`gh`), lecture des sessions Claude Code (`~/.claude/projects`, JSONL), enrichissement de l'analyse par un modèle de langage, entretien texte de montée de rang. Ni livrés ni testés dans ce binaire, donc non prétendus (DEC-001 : toute capacité non couverte par un test ou une eval est retirée avant le rendu).
