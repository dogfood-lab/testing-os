<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**Sistema operativo para pruebas en la era de la IA**

*Protocolos, almacenes de pruebas y ciclos de aprendizaje para software asistido por IA.*

<!-- version:start -->
**v1.16.0** — versión actual. Consulte [CHANGELOG.md](CHANGELOG.md) para ver las novedades.
<!-- version:end -->

📖 **[Lea el manual →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## ¿Qué es esto?

`testing-os` registra, verifica y aprende de las pruebas reales de su repositorio en un flujo de trabajo nativo de IA. Apúntelo a un repositorio y cada ejecución de prueba se convertirá en un registro con confirmación de procedencia en el que puede confiar, y no en un simple resultado autoinformado.

Lo que obtendrá:

- **Registros con confirmación de procedencia.** Cada envío está vinculado a una ejecución de CI real, sin necesidad de claves, a través de la identidad del propio proveedor, antes de ser aceptado. El resultado es un almacén de pruebas inmutable y de solo anexión, no una simple marca de verificación basada en la confianza.
- **Un contrato de políticas que usted controla.** Declare qué cuenta como "verificado" en YAML: un DSL de predicados limitado y sin evaluación (`field`/`op`/`value` + `all`/`any`/`not`/`implies`), y aplíquelo en todos sus repositorios. Analice una política antes de implementarla con `dogfood-verify lint`.
- **Un protocolo de enjambre de agentes paralelos.** Ejecute auditorías multiagente en una base de código y, a continuación, convierta los resultados brutos en patrones y doctrinas reutilizables.
- **Una superficie de estado en vivo.** Registros por repositorio, índices y una insignia de estado, todo servido desde un único almacén de pruebas.
- **Una página que muestra cómo funciona un repositorio.** Atlas lee los flujos de trabajo y los manifiestos de un repositorio, las herramientas que ejecuta, sus importaciones, sus escrituras y su historial, y escribe `atlas/README.md`: qué entra, qué se ejecuta, dónde termina, quién lo lee, qué causa qué, qué ha cambiado desde el último mapa y por dónde empezar. Ninguna frase está escrita por una persona; `atlas check` hace que la CI falle cuando el mapa deja de coincidir con el código, `atlas explain <file>` responde a qué pertenece un archivo en el sistema y cada solicitud de extracción obtiene el delta estructural como comentario.

Es el repositorio principal de la organización [Dogfood Lab](https://github.com/dogfood-lab): ocho `@dogfood-lab/*` paquetes detrás de una `swarm` CLI y una `atlas` CLI.

## Comenzar rápidamente

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

¿Quiere que las pruebas de su propio repositorio se registren aquí? El **[kit de inicio `examples/`](examples/)** le permitirá empezar en cinco minutos (`dogfood-report` genera el envío; `dogfood-init` crea el flujo de trabajo). La guía del operador, la referencia de la CLI, la referencia del esquema y las recetas de integración se encuentran en el **[manual](https://dogfood-lab.github.io/testing-os/handbook/)**. Los detalles por versión se encuentran en [CHANGELOG.md](CHANGELOG.md).

## Ejecútelo para una flota privada

El sitio público renderiza todos los repositorios públicos que han adoptado Atlas. Para los repositorios que no deben salir de su máquina, el mismo motor se distribuye como un contenedor con memoria persistente:

```bash
mkdir -p atlas-data repos
cp docker/fleet.example.yml atlas-data/fleet.yml   # list your repositories, by mounted path or clone URL
docker compose -f docker/compose.example.yml up -d
```

`./atlas-data` es la memoria: `fleet.yml`, cada renderizado, el historial de cada repositorio y el estado. El servicio se asigna una vez al inicio, cuando la memoria está vacía, luego según el programa en `fleet.yml` y sirve la lista de la flota en `http://127.0.0.1:8080/` y cada página en `/?repo=owner/name`. Nada sale del contenedor, excepto las recuperaciones de Git de los repositorios que ha enumerado; eliminar `./atlas-data` es la única forma de olvidar. La misma imagen ejecuta la CLI en un repositorio: `docker run --rm -v "$PWD:/repo" ghcr.io/dogfood-lab/atlas map`. Ejecute los comandos y las formas de los archivos se encuentran en [`docker/README.md`](docker/README.md).

## Modelo de amenazas

testing-os procesa los envíos de dogfood enviados a través de `repository_dispatch` desde repositorios de GitHub de confianza bajo `mcp-tool-shop-org/*` y `dogfood-lab/*`. El verificador requiere la procedencia de la CI: los ID de ejecución declarados se confirman a través de la API del proveedor, y los envíos con formas incorrectas, referencias faltantes o reclamaciones de políticas no válidas se rechazan.

**La procedencia es la atestación.** Para un envío `github`, el verificador confirma que la ejecución de GitHub Actions declarada realmente existe (API de GitHub) y vincula el `repo` y el `commit_sha` del envío a esa ejecución confirmada: una comprobación en vivo y sin claves, basada en la identidad OIDC de GitHub, por lo que un registro no puede atestiguar una ejecución o un commit que no se produjo. **GitLab CI** se admite de forma opcional (`source.provider: gitlab`); un envío de GitLab es el único caso en el que el verificador llama a un host que no es de GitHub (`gitlab.com/api`), y solo para los envíos `gitlab`.

**La integridad del registro es inmutable, no a prueba de manipulaciones.** Cada registro persistente lleva un bloque `integrity` (`submission_digest` + `prev_digest`) que forma una cadena hash de solo anexión que `node packages/ingest/run.js --verify-chain` valida por completo sin conexión, detectando manipulaciones externas, corrupción de disco y restauraciones parciales. No defiende contra las credenciales de ingestión en sí, que pueden reescribir tanto un registro como la cadena; para evitarlo, se necesita un ancla fuera del control del escritor. Un **ancla XRPL opcional y desactivada por defecto** (`node packages/ingest/run.js --anchor-*`) da testimonio del encabezado de la cadena en el libro mayor público de XRP, lo que hace que cualquier truncamiento o reescritura por debajo de un punto anclado sea detectable: la segunda llamada divulgada que no es de GitHub, y solo cuando un operador la habilita.

**Qué afecta testing-os:** el JSON de envío en cada carga útil `repository_dispatch`; `policies/`, `fixtures/`, `records/`, `indexes/` y `dogfood/roadmap/` en este repositorio (el último solo lo escribe un operador a través de `swarm roadmap compile`, nunca a través de la ruta de ingestión automatizada); llamadas salientes a `api.github.com` para la verificación de la procedencia; y, solo para los envíos `github`, una recuperación de solo lectura del `dogfood/scenarios/<scenario_id>.yaml` del repositorio de envío en el commit certificado (la definición del escenario que impulsa la aplicación de los pasos requeridos; el tamaño está limitado y el esquema se valida antes de su uso; los archivos ausentes simplemente dejan esa comprobación sin aplicar, con una advertencia visible).

**Qué NO afecta testing-os:** código fuente del consumidor más allá de los archivos de definición `dogfood/scenarios/` declarados, secretos en los repositorios del consumidor más allá del sobre de envío, o cualquier cosa fuera del árbol de trabajo de este repositorio.

**Las transiciones de estado de detección son evidencia y solo se pueden agregar.** Los verbos de cierre del plano de control del enjambre (`swarm reopen`, `swarm close`) requieren una razón explícita, evidencia y, para los cierres de operador, un modo de verificación declarado; cada transición escribe una fila `finding_events` inmutable que registra la autoridad que actúa. Ninguna ruta automatizada puede cerrar una detección por inactividad o volver a abrirla por predicción, y ningún verbo puede reescribir el historial de eventos; una credencial utilizada incorrectamente puede agregar transiciones, pero cada adición se registra.

**Superficie de red.** De forma predeterminada, la única salida es `api.github.com` (solo lectura: confirmación de la procedencia + la recuperación de la definición del escenario mencionada anteriormente). Las dos excepciones son ambas opcionales y se describen anteriormente: un envío de proveedor de GitLab (`gitlab.com/api`) y una ejecución de ancla XRPL habilitada por el operador. **No hay telemetría, no hay análisis: esta base de código nunca se comunica con el exterior; si no se utilizan esas dos rutas opcionales, no expone ninguna superficie de red más allá de GitHub.** El flujo de trabajo del receptor se ejecuta con `contents: write`, que solo tiene ámbito en este repositorio.

## Paquetes

| Paquete | Origen | Propósito |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | Los 8 esquemas JSON (registro, detección, patrón, recomendación, doctrina, política, escenario, envío). |
| `@dogfood-lab/verify` | JS | Validador central de envíos. Los envíos pasan por aquí antes de que se almacenen. |
| `@dogfood-lab/findings` | JS | Contrato de detección + canalizaciones de derivación/revisión/síntesis/asesoramiento. |
| `@dogfood-lab/ingest` | JS | Conexión de la canalización: envío → verificación → persistencia → indexación. |
| `@dogfood-lab/report` | JS | Generador de envíos para repositorios de origen. |
| `@dogfood-lab/portfolio` | JS | Generador de cartera entre repositorios. |
| `@dogfood-lab/dogfood-swarm` | JS | El protocolo de agente paralelo de 10 fases + plano de control SQLite + `swarm` bin. |
| `@dogfood-lab/atlas` | JS | Lee un repositorio y escribe la página que indica cómo funciona (`atlas/README.md`); `atlas check` controla el mapa en CI. No hay dependencias entre archivos; se ejecuta en cualquier repositorio. |

Herramientas de prueba complementarias que **permanecen independientes** pero se integran a través de API publicadas: [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab).

## Diseño

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

## Desarrollo local

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

Requiere Node ≥ 22. La matriz de CI ejecuta Node 22 + 24 en `ubuntu-latest`; se valida localmente en Node 25.

**Sistemas de archivos compatibles:** APFS, HFS+, ext4 (línea de base de CI), NTFS: cualquier sistema que implemente POSIX `link(2)`. **No compatibles:** exFAT, FAT32. El CAS de bloqueo de archivos en [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) requiere semántica de enlace duro para la publicación atómica; en exFAT, `linkSync` lanza `ENOTSUP` (ruidoso, no silencioso). Un error común: los SSD externos multiplataforma a menudo tienen formato exFAT; en su lugar, clone el repositorio en APFS/HFS+ local. Consulte [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) para obtener la matriz de validación completa de la Sesión G.

## Control de versiones

Todos los paquetes `@dogfood-lab/*` se actualizan juntos: un número en todo el monorepositorio. Siete paquetes se publican en npm bajo `@dogfood-lab` en v1.16.0 de forma sincronizada (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`); el octavo, `@dogfood-lab/portfolio`, permanece interno. La línea de versión cerca de la parte superior de este README se estampa automáticamente desde `package.json` a través de [`scripts/sync-version.mjs`](scripts/sync-version.mjs) en cada `npm run build`.

## Licencia

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[Manual](https://dogfood-lab.github.io/testing-os/handbook/)** · **[Todos los repositorios](https://github.com/orgs/dogfood-lab/repositories)** · **[Perfil](https://github.com/dogfood-lab)**

*Come primero. Envía después.*

</div
