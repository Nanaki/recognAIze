# Formulaire de rendu — recognAIze (hackathon laivel-up)

> ⚠️ **Statut de ce fichier : prérempli, incomplet par construction.**
> Plusieurs éléments dépendent d'actions humaines ou de la revue finale qui
> n'ont pas encore eu lieu — repérez les balises `<TODO …>` et les cases non
> cochées ci-dessous, elles ne doivent être remplies/cochées qu'une fois
> l'action réellement faite, jamais par anticipation.
>
> Ce formulaire pointe le **tag `v1.0.0-rendu`**, jamais `main`, conformément
> à `aidd_docs/memory/vcs.md` (« Main Branch : gelée par le tag `v1.0.0-rendu`
> avant le rendu ; suite sur `next` »). Le tag existe désormais
> (`a9b5698`, posé le 2026-08-31 après la revue finale — voir
> `aidd_docs/KNOWN-ISSUES.md` pour son résultat détaillé, 10 findings
> confirmés, 1 corrigé, 9 documentés pour `next`). La MR #1
> (`feat/mvp-chemin-jury` → `main`) a été fusionnée par merge commit, `next`
> créée depuis `main`, `main` posée comme branche par défaut sur GitHub.
> Le dépôt est désormais **public** sous licence MIT (2026-08-31). Reste une
> seule action humaine bloquante avant le rendu : la vidéo de démo.

## Lien du dépôt

```
https://github.com/Nanaki/recognAIze/tree/v1.0.0-rendu
```

Le remote GitHub `Nanaki/recognAIze` est **public** depuis le 2026-08-31.
Ce lien pointe le tag `v1.0.0-rendu`, jamais `main` ni une branche, et est
réellement consultable dès maintenant.

## Commandes de lancement

Les deux mêmes lignes que le README (`## Quickstart`), vérifiées sur un clone
frais :

```bash
npm ci --ignore-scripts && npm run build
node dist/cli.js analyze fixtures/profiles/bohort
```

Sortie attendue : code de sortie `0`, aucune impression sur `stdout`
(silence = succès), écriture de `recognaize-cli-out/bohort-<hash>/result.json` et
`report.html` (ouvrable en `file://`, sans serveur).

## Lien de la vidéo

```
<TODO: lien vidéo une fois enregistrée>
```

Le scénario complet (3 scènes, cartons français, budget ≤ 120 s) est écrit
et vérifié dans `docs/demo/script-video.md`. **La vidéo elle-même n'est pas
produite** : cette session est un agent de codage sans caméra, micro ni
capacité d'enregistrement d'écran. Un humain doit suivre ce script au pied
de la lettre pour l'enregistrer avant le rendu.

## Pitch (3 lignes)

> recognAIze lit un dossier de profil de développeur (jamais complet) et
> annonce son rang AI-Driven Development sur la grille officielle
> laivel-up — avec une fourchette et une confiance quand les preuves ne
> suffisent pas à trancher, jamais un rang inventé.
> Le moteur est 100 % déterministe et sans réseau : chaque verdict cite sa
> marche bloquante et une raison chiffrée (valeur observée vs seuil),
> traçable jusqu'au référentiel livré avec l'outil (46 points de
> vérification, 24 marches).
> Aucune pièce absente ne fait planter l'outil (elle devient `inconnu`,
> jamais `absent` par erreur) et retirer une pièce ne fait jamais remonter
> ni le rang ni la confiance — vérifié par une eval d'ablation sur les 4
> profils étalons de la grille (`npm run eval`, entièrement vert).

## Pseudo Discord

```
sebastien_nicolas
```

## État de la CI (GitHub Actions)

`.github/workflows/ci.yml` définit une matrice `[ubuntu-latest, macos-latest] ×
[node 20, node 22]` (build, tests, eval) plus un job `secrets` (scan
`gitleaks` sur chaque push et pull request). Les 4 jambes et le job `secrets`
sont verts sur `main` (run `33379410598`, le merge de la MR #1), dépôt
public. `test/sources/read.test.ts` verrouille explicitement le comportement
du tri sur un système de fichiers insensible à la casse (macOS/APFS), pour
ne jamais dépendre d'une collision de noms de fichiers propre à une
plateforme.

## Cases de conformité

- [x] **Aucune clé dans le code ni l'historique.**
  `gitleaks detect --source . --log-opts="--all" --redact --exit-code 1`
  réexécuté le 2026-08-31 sur l'état FINAL de l'historique (172 commits
  scannés, `git rev-list --count HEAD` fait foi) : **0 fuite**, exit `0`.
- [x] **Dépôt public sous licence MIT.**
  `LICENSE` (MIT, Sébastien Nicolas, 2026) est présente et vérifiée dans le
  dépôt. La MR #1 est fusionnée, le tag `v1.0.0-rendu` posé, `main` est la
  branche par défaut sur GitHub, et le dépôt `Nanaki/recognAIze` est
  **public** depuis le 2026-08-31 (vérifié : `gh repo view` renvoie
  `visibility: PUBLIC`).

## Checklist restante pour un humain avant le rendu (lundi 31 août 2026, 12h)

1. Enregistrer la vidéo en suivant `docs/demo/script-video.md` (3 scènes, ≤ 120 s, sans son) et coller le lien ci-dessus. **Seule action restante** — cette session n'a ni caméra, ni micro, ni capacité d'enregistrement d'écran.
2. ~~Remplir le pseudo Discord ci-dessus.~~ Fait.
3. ~~Ré-exécuter `gitleaks detect --log-opts=--all` sur l'état FINAL de l'historique juste avant le rendu et vérifier que le job `secrets` est bien vert sur le remote.~~ Fait (0 fuite, CI verte).
4. ~~Faire tourner la revue finale, puis : ouvrir la MR vers `main`, la fusionner, poser le tag `v1.0.0-rendu`, geler `main`, créer `next`.~~ Fait — MR #1 fusionnée par merge commit, tag posé, `next` créée depuis `main`, `main` posée comme branche par défaut. Revue finale : `aidd_docs/KNOWN-ISSUES.md`.
5. ~~Rendre le dépôt `Nanaki/recognAIze` public sous licence MIT.~~ Fait (2026-08-31).
6. ~~Remplacer le lien du dépôt ci-dessus par l'URL réelle pointant `v1.0.0-rendu`.~~ Fait, et réellement consultable maintenant.
7. ~~Cocher les deux cases de conformité ci-dessus.~~ Fait.
