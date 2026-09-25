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
**v1.20.0** — version actuelle. Consultez [CHANGELOG.md](CHANGELOG.md) pour connaître les nouveautés.
<!-- version:end -->

📖 **[Lisez le manuel →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## Ce que c’est

`testing-os` enregistre, vérifie et apprend à partir des données de test réelles de votre dépôt dans un flux de travail natif de l’IA. Indiquez-lui un dépôt, et chaque exécution de test devient un enregistrement dont la provenance est confirmée et auquel vous pouvez faire confiance, et non une simple confirmation auto-déclarée.

Ce que vous obtenez :

- **Enregistrements dont la provenance est confirmée.** Chaque soumission est liée à une exécution CI réelle, sans clé, via l’identité du fournisseur, avant d’être acceptée. Le résultat est un référentiel de preuves inviolable et en append-only, et non une simple case à cocher verte basée sur l’honneur.
- **Un contrat de politique que vous contrôlez.** Déclarez ce qui est considéré comme « vérifié » en YAML — un DSL prédicatif limité et sans évaluation (`field`/`op`/`value` + `all`/`any`/`not`/`implies`) — et appliquez-le à tous vos dépôts. Validez une politique avant de la déployer avec `dogfood-verify lint`.
- **Un protocole de groupe d’agents parallèles.** Effectuez des audits multi-agents sur une base de code, puis transformez les résultats bruts en modèles et doctrines réutilisables.
- **Une surface d’état en direct.** Enregistrements et index par dépôt, ainsi qu’un badge d’état, le tout servi à partir d’un seul référentiel de preuves.
- **Une page qui explique le fonctionnement d’un dépôt.** Atlas lit les flux de travail et les manifestes d’un dépôt, les outils qu’il exécute, ses importations, ses écritures et son historique, et écrit `atlas/README.md` : ce qui entre, ce qui s’exécute, où cela atterrit, qui le lit, ce qui provoque des erreurs, ce qui a changé par rapport à la dernière carte, et où commencer. Aucune phrase n’est écrite par une personne ; `atlas check` fait échouer la CI lorsque la carte cesse de correspondre au code, `atlas explain <file>` répond à la question de ce qu’un fichier contient dans le système, et chaque demande de tirage reçoit le delta structurel sous forme de commentaire.

C’est le monorepo phare de l’organisation [Dogfood Lab](https://github.com/dogfood-lab) — huit `@dogfood-lab/*` packages derrière une `swarm` CLI et une `atlas` CLI.

## Démarrage rapide

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

Vous souhaitez que les données de test de votre propre dépôt soient enregistrées ici ? Le **[kit de démarrage `examples/`](examples/)** vous permet de commencer en cinq minutes (`dogfood-report` crée la soumission ; `dogfood-init` crée le flux de travail). Le guide de l’opérateur, la référence de la CLI, la référence du schéma et les recettes d’intégration sont disponibles dans le **[manuel](https://dogfood-lab.github.io/testing-os/handbook/)**. Les détails par version sont disponibles dans [CHANGELOG.md](CHANGELOG.md).

## Exécutez-le pour une flotte privée

Le site public affiche tous les dépôts publics qui ont adopté Atlas. Pour les dépôts qui ne doivent pas quitter votre machine, le même moteur est fourni sous forme de conteneur avec une mémoire persistante :

```bash
mkdir -p atlas-data repos
cp docker/fleet.example.yml atlas-data/fleet.yml   # list your repositories, by mounted path or clone URL
docker compose -f docker/compose.example.yml up -d
```

`./atlas-data` est la mémoire : `fleet.yml`, chaque rendu, l’historique de chaque dépôt et l’état. Le service effectue une seule cartographie au démarrage lorsque la mémoire est vide, puis selon le calendrier défini dans `fleet.yml`, et sert la liste de la flotte à `http://127.0.0.1:8080/` et chaque page à `/?repo=owner/name`. Rien ne quitte le conteneur, à l’exception des téléchargements Git des dépôts que vous avez répertoriés ; la suppression de `./atlas-data` est le seul moyen d’oublier. La même image exécute la CLI sur un dépôt : `docker run --rm -v "$PWD:/repo" ghcr.io/dogfood-lab/atlas map`. Les commandes sont exécutées et les formes des fichiers sont disponibles dans [`docker/README.md`](docker/README.md).

## Modèle de menace

testing-os traite les soumissions Dogfood envoyées via `repository_dispatch` à partir de dépôts GitHub de confiance sous `mcp-tool-shop-org/*` et `dogfood-lab/*`. Le vérificateur exige une provenance CI — les ID d’exécution revendiqués sont confirmés via l’API du fournisseur, et les soumissions présentant des formes malformées, des références manquantes ou des revendications de politique non valides sont rejetées.

**La provenance est l’attestation.** Pour une soumission `github`, le vérificateur confirme que l’exécution GitHub Actions revendiquée existe réellement (API GitHub) et lie les `repo` et `commit_sha` de la soumission à cette exécution confirmée — une vérification en direct et sans clé, basée sur l’identité OIDC de GitHub, de sorte qu’un enregistrement ne peut pas attester d’une exécution ou d’un commit qui ne s’est pas produit. **GitLab CI** est pris en charge en option (`source.provider: gitlab`) ; une soumission GitLab est le seul cas où le vérificateur appelle un hôte non GitHub (`gitlab.com/api`), et uniquement pour les soumissions `gitlab`.

**L’intégrité des enregistrements est inviolable, mais pas inviolable.** Chaque enregistrement persistant contient un bloc `integrity` (`submission_digest` + `prev_digest`) formant une chaîne de hachage en append-only que `node packages/ingest/run.js --verify-chain` valide entièrement hors ligne — détectant les altérations, la corruption du disque et les restaurations partielles. Cela ne protège **pas** contre les informations d’identification d’ingestion elles-mêmes, qui peuvent réécrire à la fois un enregistrement et la chaîne ; pour cela, il faut un ancrage extérieur au contrôle de l’auteur. Un **ancrage XRPL facultatif et désactivé par défaut** (`node packages/ingest/run.js --anchor-*`) témoigne de l’en-tête de la chaîne sur le XRP Ledger public, ce qui permet de détecter toute troncature ou réécriture en dessous d’un point ancré — le deuxième appel divulgué à un hôte non GitHub, et uniquement lorsque l’opérateur l’active.

**Ce que testing-os prend en compte :** le fichier JSON de soumission dans chaque charge utile `repository_dispatch` ; `policies/`, `fixtures/`, `records/`, `indexes/` et `dogfood/roadmap/` dans ce dépôt (le dernier étant écrit uniquement par un opérateur via une commande `swarm roadmap compile`, et non par le processus d’ingestion automatisé) ; les appels sortants vers `api.github.com` pour la vérification de la provenance ; et — uniquement pour les soumissions `github` — une récupération en lecture seule du fichier `dogfood/scenarios/<scenario_id>.yaml` du dépôt de soumission au niveau du commit attesté (la définition du scénario qui alimente l’application des étapes requises ; la taille est limitée et le schéma est validé avant l’utilisation, les fichiers manquants entraînent simplement l’absence de cette vérification, avec un avertissement visible).

**Ce que testing-os ne prend PAS en compte :** le code source du consommateur au-delà des fichiers de définition `dogfood/scenarios/` déclarés, les secrets dans les dépôts du consommateur au-delà de l’enveloppe de distribution, ou tout ce qui se trouve en dehors de l’arborescence de travail de ce dépôt.

**Les transitions d’état sont des preuves et sont ajoutées en append-only.** Les verbes de fermeture du plan de contrôle du swarm (`swarm reopen`, `swarm close`) nécessitent une raison et une preuve explicites, et — pour les fermetures d’opérateur — un mode de vérification déclaré ; chaque transition écrit une ligne `finding_events` immuable enregistrant l’autorité responsable. Aucun processus automatisé ne peut fermer une anomalie en raison de son ancienneté ou la rouvrir par prédiction, et aucun verbe ne peut réécrire l’historique des événements — une autorisation mal utilisée peut ajouter des transitions, mais chaque ajout est enregistré.

**Surface réseau.** Par défaut, la seule sortie est `api.github.com` (en lecture seule : confirmation de la provenance + la récupération de la définition du scénario mentionnée ci-dessus). Les deux exceptions sont facultatives et sont mentionnées ci-dessus : une soumission du fournisseur GitLab (`gitlab.com/api`) et une exécution d’ancrage XRPL activée par un opérateur. **Pas de télémétrie, pas d’analyse — cette base de code ne communique jamais avec l’extérieur ; en l’absence de ces deux options, elle n’expose aucune surface réseau au-delà de GitHub.** Le flux de travail du récepteur s’exécute avec `contents: write`, limité à ce dépôt uniquement.

## Packages

| Package | Source | Objectif |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | Les 8 schémas JSON (enregistrement, anomalie, modèle, recommandation, doctrine, politique, scénario, soumission). |
| `@dogfood-lab/verify` | JS | Validateur central des soumissions. Les soumissions passent par ici avant d’être persistées. |
| `@dogfood-lab/findings` | JS | Contrat d’anomalie + pipelines de dérivation/examen/synthèse/conseil. |
| `@dogfood-lab/ingest` | JS | Colle de pipeline : distribution → vérification → persistance → indexation. |
| `@dogfood-lab/report` | JS | Générateur de soumissions pour les dépôts sources. |
| `@dogfood-lab/portfolio` | JS | Générateur de portefeuille inter-dépôts. |
| `@dogfood-lab/dogfood-swarm` | JS | Le protocole d’agent parallèle en 10 phases + plan de contrôle SQLite + `swarm` bin. |
| `@dogfood-lab/atlas` | JS | Lit un dépôt et écrit la page qui explique son fonctionnement (`atlas/README.md`) ; `atlas check` contrôle le mappage dans CI. Aucune dépendance entre les fichiers ; s’exécute dans n’importe quel dépôt. |

Outils de test frères qui **restent indépendants** mais s’intègrent via des API publiées : [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab).

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

Nécessite Node ≥ 22. La matrice CI exécute Node 22 + 24 sur `ubuntu-latest` ; validé localement sur Node 25.

**Systèmes de fichiers pris en charge :** APFS, HFS+, ext4 (base de référence CI), NTFS — tout système qui implémente POSIX `link(2)`. **Non pris en charge :** exFAT, FAT32. Le CAS de verrouillage de fichiers dans [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) nécessite une sémantique de lien physique pour une publication atomique ; sur exFAT, `linkSync` lève `ENOTSUP` (bruyant, pas silencieux). Piège courant : les SSD externes multiplateformes sont souvent formatés en exFAT — clonez le dépôt vers APFS/HFS+ local à la place. Voir [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) pour la matrice de validation complète de la session G.

## Gestion des versions

Tous les packages `@dogfood-lab/*` sont mis à jour ensemble — un seul numéro dans tout le monorepo. Sept packages sont publiés sur npm sous `@dogfood-lab` à la version 1.20.0 en synchronisation (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`) ; le huitième, `@dogfood-lab/portfolio`, reste interne. La ligne de version près du haut de ce fichier README est automatiquement ajoutée à partir de `package.json` via [`scripts/sync-version.mjs`](scripts/sync-version.mjs) à chaque `npm run build`.

## Licence

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[Manuel](https://dogfood-lab.github.io/testing-os/handbook/)** · **[Tous les dépôts](https://github.com/orgs/dogfood-lab/repositories)** · **[Profil](https://github.com/dogfood-lab)**

*Mangez d’abord. Publiez ensuite.*

</div
