<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="./assets/logo.png" alt="testing-os" width="280">
</p>

<div align="center">

# testing-os

[![CI](https://github.com/dogfood-lab/testing-os/actions/workflows/ci.yml/badge.svg)](https://github.com/dogfood-lab/testing-os/actions/workflows/ci.yml)
[![Pages](https://github.com/dogfood-lab/testing-os/actions/workflows/pages.yml/badge.svg)](https://dogfood-lab.github.io/testing-os/)
[![dogfood](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dogfood-lab/testing-os/main/indexes/badges/dogfood-lab--testing-os--cli.json)](https://dogfood-lab.github.io/testing-os/handbook/read-model/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

**Système d’exploitation pour les tests à l’ère de l’IA**

*Protocoles, référentiels de preuves et boucles d’apprentissage pour les logiciels assistés par l’IA.*

<!-- version:start -->
**v1.14.0** — version actuelle. Consultez [CHANGELOG.md](CHANGELOG.md) pour connaître les nouveautés.
<!-- version:end -->

📖 **[Lisez le manuel →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## Ce que c’est

`testing-os` enregistre, vérifie et apprend à partir des données de test réelles de votre dépôt, dans le cadre d’un flux de travail natif pour l’IA. Indiquez-lui un dépôt, et chaque exécution de test devient un enregistrement dont l’origine est confirmée et auquel vous pouvez faire confiance, et non un simple résultat déclaré.

Ce que vous obtenez :

- **Enregistrements dont l’origine est confirmée.** Chaque soumission est liée à une exécution CI réelle, sans clé, via l’identité du fournisseur, avant d’être acceptée. Le résultat est un référentiel de preuves inviolable et en append-only, et non une simple case à cocher basée sur l’honneur.
- **Un contrat de politique que vous contrôlez.** Déclarez ce qui est considéré comme « vérifié » en YAML — un DSL prédicat limité et sans évaluation (`field`/`op`/`value` + `all`/`any`/`not`/`implies`) — et appliquez-le à tous vos dépôts. Validez une politique avant de la déployer avec `dogfood-verify lint`.
- **Un protocole de groupe d’agents parallèles.** Effectuez des audits multi-agents sur une base de code, puis transformez les résultats bruts en modèles et doctrines réutilisables.
- **Une surface d’état en direct.** Enregistrements et index par dépôt, ainsi qu’un badge d’état, le tout servi à partir d’un seul référentiel de preuves.
- **Une page qui explique le fonctionnement d’un dépôt.** Atlas lit les flux de travail d’un dépôt, les outils qu’il exécute, ses importations, ses écritures et son historique, et écrit `atlas/README.md` : ce qui entre, ce qui s’exécute, où cela atterrit, qui le lit, ce qui provoque des erreurs, ce qui a changé depuis la dernière carte, et où commencer. Aucune phrase n’est écrite par une personne ; `atlas check` fait échouer la CI lorsque la carte cesse de correspondre au code, `atlas explain <file>` répond à la question de ce qu’un fichier contient dans le système, et chaque demande de tirage reçoit le delta structurel sous forme de commentaire.

Il s’agit du monorepo phare de l’organisation [Dogfood Lab](https://github.com/dogfood-lab) — huit `@dogfood-lab/*` packages derrière une `swarm` CLI et une `atlas` CLI.

## Démarrage rapide

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

Vous souhaitez que les données de test de votre propre dépôt soient enregistrées ici ? Le **[kit de démarrage `examples/`](examples/)** vous permet de commencer en cinq minutes (`dogfood-report` crée la soumission ; `dogfood-init` crée le flux de travail). Le guide de l’opérateur, la référence de la CLI, la référence du schéma et les recettes d’intégration sont disponibles dans le **[manuel](https://dogfood-lab.github.io/testing-os/handbook/)**. Les détails par version sont disponibles dans [CHANGELOG.md](CHANGELOG.md).

## Modèle de menace

testing-os traite les soumissions Dogfood envoyées via `repository_dispatch` à partir de dépôts GitHub de confiance sous `mcp-tool-shop-org/*` et `dogfood-lab/*`. Le vérificateur exige une preuve de CI : les ID d’exécution revendiqués sont confirmés via l’API du fournisseur, et les soumissions présentant des formes incorrectes, des références manquantes ou des revendications de politique non valides sont rejetées.

**L’origine est l’attestation.** Pour une soumission `github`, le vérificateur confirme que l’exécution GitHub Actions revendiquée existe réellement (API GitHub) et lie les `repo` et `commit_sha` de la soumission à cette exécution confirmée — une vérification en direct et sans clé, basée sur l’identité OIDC de GitHub, de sorte qu’un enregistrement ne peut pas attester d’une exécution ou d’un commit qui ne s’est pas produit. **GitLab CI** est pris en charge en option (`source.provider: gitlab`) ; une soumission GitLab est le seul cas où le vérificateur appelle un hôte non GitHub (`gitlab.com/api`), et uniquement pour les soumissions `gitlab`.

**L’intégrité des enregistrements est inviolable, mais pas à 100 %.** Chaque enregistrement persistant contient un bloc `integrity` (`submission_digest` + `prev_digest`) formant une chaîne de hachage en append-only que `node packages/ingest/run.js --verify-chain` valide entièrement hors ligne — détectant les altérations, la corruption du disque et les restaurations partielles. Cela ne protège **pas** contre les informations d’identification d’ingestion elles-mêmes, qui peuvent réécrire à la fois un enregistrement et la chaîne ; pour cela, il faut un ancrage extérieur au contrôle de l’auteur. Un **ancrage XRPL facultatif, désactivé par défaut** (`node packages/ingest/run.js --anchor-*`) témoigne du point de départ de la chaîne sur le XRP Ledger public, ce qui permet de détecter toute troncature ou réécriture en dessous d’un point ancré — la deuxième requête divulguée à un service non GitHub, et uniquement lorsque l’opérateur l’active.

**Ce que testing-os touche :** le JSON de la soumission dans chaque charge utile `repository_dispatch` ; `policies/`, `fixtures/`, `records/`, `indexes/` et `dogfood/roadmap/` dans ce dépôt (le dernier étant écrit uniquement par un `swarm roadmap compile` invoqué par un opérateur — jamais par le chemin d’ingestion automatisé) ; les appels sortants à `api.github.com` pour la vérification de l’origine ; et — uniquement pour les soumissions `github` — une récupération en lecture seule du `dogfood/scenarios/<scenario_id>.yaml` du dépôt soumettant au commit attesté (la définition du scénario qui alimente l’application des étapes requises ; de taille limitée et validée par un schéma avant utilisation, les fichiers manquants laissent simplement cette vérification non appliquée avec un avertissement visible).

**Ce que testing-os ne touche pas :** le code source du consommateur au-delà des fichiers de définition `dogfood/scenarios/` déclarés, les secrets dans les dépôts des consommateurs au-delà de l’enveloppe de soumission, ou quoi que ce soit en dehors de l’arborescence de travail de ce dépôt.

**Les transitions d’état lors de la détection de problèmes sont probantes et ne permettent que l’ajout de données.** Les verbes de fermeture du plan de contrôle du groupe (`swarm reopen`, `swarm close`) nécessitent une justification explicite, des preuves et, pour les fermetures d’opérateur, un mode de vérification déclaré ; chaque transition enregistre une ligne immuable `finding_events` qui indique l’autorité responsable. Aucun processus automatisé ne peut fermer un problème en raison de son ancienneté ou le rouvrir par prédiction, et aucun verbe ne peut réécrire l’historique des événements ; l’utilisation incorrecte d’un identifiant peut ajouter des transitions, mais chaque ajout est enregistré.

**Surface réseau.** Par défaut, la seule sortie est `api.github.com` (en lecture seule : confirmation de la provenance + récupération de la définition du scénario ci-dessus). Les deux exceptions sont toutes les deux facultatives et sont décrites ci-dessus : une soumission du fournisseur GitLab (`gitlab.com/api`) et une exécution d’un ancrage XRPL activée par un opérateur. **Pas de télémétrie, pas d’analyse — ce code ne communique jamais avec l’extérieur ; en l’absence de ces deux options, il n’expose aucune surface réseau au-delà de GitHub.** Le flux de travail du récepteur s’exécute avec `contents: write`, limité à ce dépôt uniquement.

## Paquets

| Paquet | Source | Objectif |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | Les 8 schémas JSON (enregistrement, problème, modèle, recommandation, doctrine, politique, scénario, soumission). |
| `@dogfood-lab/verify` | JS | Validateur central des soumissions. Les soumissions passent par ici avant d’être enregistrées. |
| `@dogfood-lab/findings` | JS | Contrat de détection de problèmes + pipelines de dérivation/examen/synthèse/conseil. |
| `@dogfood-lab/ingest` | JS | Liaison des pipelines : envoi → vérification → enregistrement → indexation. |
| `@dogfood-lab/report` | JS | Générateur de soumissions pour les dépôts sources. |
| `@dogfood-lab/portfolio` | JS | Générateur de portefeuille multi-dépôts. |
| `@dogfood-lab/dogfood-swarm` | JS | Le protocole d’agent parallèle en 10 phases + plan de contrôle SQLite + `swarm`. |
| `@dogfood-lab/atlas` | JS | Lit un dépôt et écrit la page qui explique son fonctionnement (`atlas/README.md`) ; `atlas check` contrôle l’accès au schéma dans l’intégration continue. Aucune dépendance entre les éléments ; s’exécute dans n’importe quel dépôt. |

Outils de test frères qui **restent indépendants** mais s’intègrent via des API publiées : [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab).

## Disposition

```
testing-os/
├── packages/                  # 8 workspace packages (@dogfood-lab/*)
├── atlas/                     # This repository's own Atlas page and map, written by `atlas map`
├── site/                      # Astro Starlight handbook → dogfood-lab.github.io/testing-os/handbook/
├── swarms/                    # Swarm-run artifacts + control-plane.db
├── indexes/                   # Generated read API: latest-by-repo.json, failing.json, stale.json, trends.json, badges/ (shields.io endpoints)
├── policies/                  # Policy YAML by repo
├── records/                   # Submission landing pad (ingest.yml writes here)
├── fixtures/                  # Test/example fixtures
├── docs/                      # Contract docs + architecture notes
├── examples/                  # Copy-paste consumer starter kit (dogfood.yml + scenario + policy)
├── scripts/                   # Repo-level utilities (sync-version, build)
└── .github/workflows/         # ci.yml, ingest.yml, pages.yml, release.yml, self-dogfood.yml, atlas-render.yml
```

## Développement local

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

Nécessite Node ≥ 22. La matrice d’intégration continue exécute Node 22 + 24 sur `ubuntu-latest` ; validé localement sur Node 25.

**Systèmes de fichiers pris en charge :** APFS, HFS+, ext4 (base de référence de l’intégration continue), NTFS — tout système qui implémente POSIX `link(2)`. **Non pris en charge :** exFAT, FAT32. Le CAS de verrouillage de fichiers dans [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) nécessite une sémantique de lien physique pour une publication atomique ; sur exFAT, `linkSync` génère `ENOTSUP` (bruyant, pas silencieux). Piège courant : les SSD externes multiplateformes sont souvent formatés en exFAT — clonez le dépôt sur APFS/HFS+ local à la place. Voir [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) pour la matrice de validation complète de la session G.

## Gestion des versions

Tous les `@dogfood-lab/*` paquets sont mis à jour ensemble — un seul numéro dans l’ensemble du monorepo. Sept paquets sont publiés sur npm sous `@dogfood-lab` à la version 1.14.0 en synchronisation (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`) ; le huitième, `@dogfood-lab/portfolio`, reste interne. La ligne de version près du haut de ce fichier README est automatiquement ajoutée à partir de `package.json` via [`scripts/sync-version.mjs`](scripts/sync-version.mjs) à chaque `npm run build`.

## Licence

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[Manuel](https://dogfood-lab.github.io/testing-os/handbook/)** · **[Tous les dépôts](https://github.com/orgs/dogfood-lab/repositories)** · **[Profil](https://github.com/dogfood-lab)**

*Mangez d’abord. Publiez ensuite.*

</div
