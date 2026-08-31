# Script vidéo — recognAIze (≤ 2 min, muet, sous-titré)

> ⚠️ **Statut : scénario écrit, vidéo NON enregistrée.** Cette session est un
> agent de codage sans caméra, micro ni capacité d'enregistrement d'écran —
> elle ne peut produire aucun fichier vidéo. Ce document fixe le scénario
> exact (plans, commandes, sorties réelles, cartons) pour qu'un humain
> l'enregistre en suivant les répliques mot pour mot, sans improviser. Voir
> `docs/rendu.md` pour le suivi de cette tâche restante avant le rendu du
> lundi 31 août 2026, 12h.

## Règles de tournage

- **Aucun son requis** : chaque plan porte un carton ou un sous-titre en
  français qui rend la scène compréhensible seule.
- **Budget total : 112 s** (marge de 8 s sous le plafond de 120 s imposé par
  le spec — cases « Livraison », hard constraints).
- **3 scènes, dans cet ordre exact** : (1) profil complet, (2) profil à trous
  et sa fourchette, (3) refus. C'est l'ordre du plan Part 7, Phase 2.
- Toutes les commandes et sorties ci-dessous ont été **exécutées réellement**
  sur le binaire construit par `npm run build` à la racine du dépôt, le
  2026-08-29 — aucune n'est recopiée de mémoire ni inventée. Le hash de
  dossier de sortie (`-befa156f`, `-2f075576`, `-6f2ed844`) est déterministe
  pour un chemin donné mais dépend du chemin absolu du clone : à l'écran, ce
  qui compte est le nom lisible du profil (`arthur-...`), pas le suffixe
  exact.
- Enregistrement recommandé : terminal + navigateur en plein écran,
  résolution 1920×1080, police de terminal ≥ 16 px pour rester lisible en
  sous-titre.

---

## Scène 1 — Profil complet (`arthur`) — 0:00 → 0:45 (45 s)

| # | Timecode | Action / commande | Sortie réelle attendue | Carton / sous-titre (FR) |
|---|---|---|---|---|
| 1.1 | 0:00–0:05 (5 s) | Carton titre plein écran, pas de terminal encore visible | — | **« recognAIze — quel rang AI-Driven Development pour ce profil ? Déterministe, sans clé API, sans réseau. »** |
| 1.2 | 0:05–0:12 (7 s) | Terminal, taper : `node dist/cli.js analyze fixtures/profiles/arthur` | (rien ne s'affiche encore — la commande est en train d'être tapée puis validée) | **« Un profil complet : toutes les pièces sont présentes dans le dossier. »** |
| 1.3 | 0:12–0:18 (6 s) | Valider la commande, laisser le terminal au repos | Aucune sortie sur `stdout` ; le terminal revient au prompt ; `echo $?` → `0` | **« Silence = succès (code de sortie 0). Le résultat est écrit sur disque : `result.json` + `report.html`. »** |
| 1.4 | 0:18–0:26 (8 s) | Ouvrir `recognaize-cli-out/arthur-<hash>/report.html` dans un navigateur (`file://`, aucun serveur) — cadrer l'en-tête | En-tête réel observé : `<h1>copper</h1>` / `Fourchette : copper – copper` / `Confiance globale : 0.6` | **« Rang : copper. Fourchette resserrée sur un seul rang = confiance haute (0,6). »** |
| 1.5 | 0:26–0:37 (11 s) | Défiler jusqu'à la section axe H (Harness), cadrer l'encart « marche bloquante » | Texte réel observé : `Marche bloquante : H6` — `Raison chiffrée : H6 (infirmé) : RC.loop_artifact_executable=non = oui` | **« Chaque verdict cite sa marche bloquante et une raison chiffrée — jamais un rang sans preuve. »** |
| 1.6 | 0:37–0:45 (8 s) | Défiler jusqu'à la section axe I (Intervention), cadrer l'encart « marche bloquante » | Texte réel observé : `Marche bloquante : I4` — `... GA.merged_without_human_edit_ratio=0.2987... ≥ 0.8 ratio ; ... (approximation : pull-requests.json absent, dénominateur = pull_requests.total (46/154))` | **« Même logique sur l'axe Intervention : 46 PR sur 154 mergées sans retouche humaine — un chiffre, pas une impression. »** |

**Durée scène 1 : 45 s.**

---

## Scène 2 — Profil à trous et sa fourchette (`leodagan` − `git-activity.json`) — 0:45 → 1:30 (45 s)

> Scénario d'ablation réutilisé tel quel depuis `evals/ablation.ts` (Part 6) :
> copie de `fixtures/profiles/leodagan`, suppression de `git-activity.json`
> seul, ré-analyse. La fourchette `[red ; green]` ci-dessous est la valeur
> **documentée et vérifiée par `npm run eval`** (`DOCUMENTED_FOURCHETTES`
> dans `evals/ablation.ts`, cas `leodagan:git-activity.json`), reconfirmée en
> exécutant réellement la commande le 2026-08-29 — pas une estimation.

| # | Timecode | Action / commande | Sortie réelle attendue | Carton / sous-titre (FR) |
|---|---|---|---|---|
| 2.1 | 0:45–0:52 (7 s) | Terminal, taper : `cp -r fixtures/profiles/leodagan /tmp/demo-leodagan-sans-ga && rm /tmp/demo-leodagan-sans-ga/git-activity.json` | Aucune sortie (commandes shell silencieuses) | **« Même profil, une pièce en moins : `git-activity.json` retiré. »** |
| 2.2 | 0:52–0:59 (7 s) | Taper : `node dist/cli.js analyze /tmp/demo-leodagan-sans-ga` | Aucune sortie sur `stdout` ; `echo $?` → `0` (pas de plantage malgré la pièce manquante) | **« L'outil ne plante jamais sur une pièce absente : code de sortie 0, avec avertissements dans `result.json`. »** |
| 2.3 | 0:59–1:10 (11 s) | Ouvrir `recognaize-cli-out/leodagan-<hash>/report.html`, cadrer l'en-tête | En-tête réel observé : `<h1>red – green</h1>` / `Confiance globale : 0` | **« Sans preuve d'activité Git, le rang retombe à red — mais la fourchette [red ; green] montre l'incertitude, jamais un rang inventé. »** |
| 2.4 | 1:10–1:22 (12 s) | Cadrer le sous-titre complet sous le titre | Texte réel observé : `Point bas : red. Ce qui bloque la suite : axe T — T4 : aucune preuve disponible — marche inconnue. · axe H — H6 : ... · axe I — I2 : aucune preuve disponible — marche inconnue. · axe P — P2 : aucune preuve disponible — marche inconnue.` | **« Chaque marche inconnue est listée : c'est un chemin vers Green, pas un couperet. »** |
| 2.5 | 1:22–1:30 (8 s) | Carton plein écran (pas de terminal) | — | **« Retirer une pièce ne fait JAMAIS remonter le rang ni la confiance — vérifié pièce par pièce sur les 4 profils étalons par `npm run eval` (Part 6). »** |

**Durée scène 2 : 45 s.**

---

## Scène 3 — Refus (`profile.json` seul) — 1:30 → 1:52 (22 s)

| # | Timecode | Action / commande | Sortie réelle attendue | Carton / sous-titre (FR) |
|---|---|---|---|---|
| 3.1 | 1:30–1:36 (6 s) | Cadrer un explorateur de fichiers (ou `ls`) sur un dossier ne contenant que `profile.json` | `profile.json` (seul fichier listé) | **« Un dossier qui ne contient QUE `profile.json` — aucune pièce exploitable. »** |
| 3.2 | 1:36–1:44 (8 s) | Terminal, taper : `node dist/cli.js analyze <dossier>` | Sortie réelle observée sur `stderr` : `Refus : le dossier ne contient pas assez de pièces exploitables. Pièces manquantes : git-activity.json, pull-requests.json, code/, sonar-measures.json, repo-context/, declaratif.md, session.md.` ; `echo $?` → `2` | **« Refus explicite, code de sortie 2, message en français — jamais un rang deviné sur du vide. »** |
| 3.3 | 1:44–1:52 (8 s) | Carton de clôture plein écran | — | **« recognAIze — rang, fourchette et confiance : jamais inventés. »** (sous-titre : lien du dépôt, voir `docs/rendu.md`) |

**Durée scène 3 : 22 s.**

---

## Récapitulatif du budget

| Scène | Durée |
|---|---|
| 1 — Profil complet (arthur) | 45 s |
| 2 — Profil à trous (leodagan − git-activity.json) | 45 s |
| 3 — Refus (profile.json seul) | 22 s |
| **Total** | **112 s** (marge de 8 s sous 120 s) |

## Ce qui reste à faire par un humain

1. Enregistrer l'écran en suivant les timecodes et répliques ci-dessus (terminal + navigateur), aucune voix requise.
2. Ajouter les cartons/sous-titres tels qu'écrits mot pour mot (incrustation vidéo ou piste de sous-titres `.srt`/`.vtt`).
3. Exporter en ≤ 2 min, format lisible sans son (contraste suffisant, taille de police lisible en plein écran mobile).
4. Héberger la vidéo et coller le lien dans `docs/rendu.md` (remplacer `<TODO: lien vidéo une fois enregistrée>`).
