# Formulaire de rendu — recognAIze (hackathon laivel-up)

> ⚠️ **Statut de ce fichier : prérempli, incomplet par construction.**
> Plusieurs éléments dépendent d'actions humaines ou de la revue finale qui
> n'ont pas encore eu lieu — repérez les balises `<TODO …>` et les cases non
> cochées ci-dessous, elles ne doivent être remplies/cochées qu'une fois
> l'action réellement faite, jamais par anticipation.
>
> Ce formulaire pointe le **tag `v1.0.0-rendu`**, jamais `main`, conformément
> à `aidd_docs/memory/vcs.md` (« Main Branch : gelée par le tag `v1.0.0-rendu`
> avant le rendu ; suite sur `next` »). Ce tag n'existe pas encore.
> `aidd_docs/memory/vcs.md` fixe explicitement l'ordre : une seule MR est
> ouverte vers `main` à la fin, après revue finale — la fusion vers `main`, la
> pose du tag `v1.0.0-rendu` et la création de `next` restent gated derrière
> cette revue et sont documentées comme actions restantes ci-dessous.

## Lien du dépôt

```
<TODO: à remplacer une fois le dépôt poussé — placeholder actuel : https://github.com/<OWNER>/recognAIze/tree/v1.0.0-rendu>
```

Un remote GitHub existe : `Nanaki/recognAIze`, mais **privé** — la branche
`feat/mvp-chemin-jury` y est poussée, `main` n'y a jamais été touchée. Le lien
définitif ci-dessus doit encore :
- pointer le tag `v1.0.0-rendu` (URL de la forme `.../tree/v1.0.0-rendu`), jamais `main` ni une branche ;
- n'être rempli qu'après que le dépôt a été rendu public sous licence MIT (action humaine restante, checklist ci-dessous).

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
<TODO: à remplir par l'auteur — aucun pseudo Discord connu de cette session, rien n'est inventé ici>
```

## État de la CI (GitHub Actions)

`.github/workflows/ci.yml` définit une matrice `[ubuntu-latest, macos-latest] ×
[node 20, node 22]` (build, tests, eval) plus un job `secrets` (scan
`gitleaks` sur chaque push et pull request). Les 4 jambes et le job `secrets`
sont verts sur le remote (`Nanaki/recognAIze`, dépôt privé). `test/sources/read.test.ts`
verrouille explicitement le comportement du tri sur un système de fichiers
insensible à la casse (macOS/APFS), pour ne jamais dépendre d'une collision
de noms de fichiers propre à une plateforme.

## Cases de conformité

- [ ] **Aucune clé dans le code ni l'historique.**
  `gitleaks detect --source . --log-opts="--all" --redact --exit-code 1` sur
  tout l'historique doit rendre 0 fuite juste avant le rendu — le nombre de
  commits scannés augmente à chaque commit, se fier à `git rev-list --count HEAD`
  pour le compte réel au moment du rendu. Le binaire n'est pas installé de
  façon permanente sur la machine de développement : `.githooks/pre-commit`
  avertit honnêtement quand le scan local est sauté ; `.github/workflows/ci.yml`
  porte le job `secrets` qui l'exécute réellement sur CI, à chaque push.
  **Ne pas cocher cette case avant un dernier `gitleaks detect
  --log-opts=--all` sur l'état FINAL de l'historique**, une fois qu'il est
  figé (des commits sont encore attendus).
- [ ] **Dépôt public sous licence MIT.**
  `LICENSE` (MIT, Sébastien Nicolas, 2026) est présente et vérifiée dans le
  dépôt. Le dépôt GitHub existe (`Nanaki/recognAIze`) mais reste **privé**
  par choix explicite, en attendant la revue finale. **Ne pas cocher avant
  qu'il soit effectivement rendu public**, ce qui n'a lieu qu'après la revue
  finale, par construction de `aidd_docs/memory/vcs.md` (une seule MR vers
  `main`, après revue).

## Checklist restante pour un humain avant le rendu (lundi 31 août 2026, 12h)

1. Enregistrer la vidéo en suivant `docs/demo/script-video.md` (3 scènes, ≤ 120 s, sans son) et coller le lien ci-dessus.
2. Remplir le pseudo Discord ci-dessus.
3. Ré-exécuter `gitleaks detect --log-opts=--all` sur l'état FINAL de l'historique juste avant le rendu et vérifier que le job `secrets` de `.github/workflows/ci.yml` est bien vert sur le remote.
4. Faire tourner la revue finale, puis, une fois validée : ouvrir la MR vers `main`, la fusionner, poser le tag `v1.0.0-rendu`, geler `main`, créer `next` (`aidd_docs/memory/vcs.md`) — dans cet ordre.
5. Rendre le dépôt `Nanaki/recognAIze` (déjà poussé, privé) public sous licence MIT (après la fusion ci-dessus).
6. Remplacer le lien du dépôt ci-dessus par l'URL réelle pointant `v1.0.0-rendu`.
7. Cocher les deux cases de conformité ci-dessus, seulement une fois 3 et 5 vérifiés pour de vrai.
