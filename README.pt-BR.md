<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

**Sistema operacional para testes na era da IA**

*Protocolos, repositórios de evidências e ciclos de aprendizado para software assistido por IA.*

<!-- version:start -->
**v1.13.0** — versão atual. Consulte [CHANGELOG.md](CHANGELOG.md) para ver o que foi incluído.
<!-- version:end -->

📖 **[Leia o manual →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## O que é isso

`testing-os` registra, verifica e aprende com as evidências reais de teste do seu repositório em um fluxo de trabalho nativo de IA. Aplique-o a um repositório e cada execução de teste se torna um registro com confirmação de procedência, no qual você pode confiar — e não apenas uma aprovação auto-relatada.

O que você obtém:

- **Registros com confirmação de procedência.** Cada envio está vinculado a uma execução real de CI — sem necessidade de chaves, por meio da própria identidade do provedor — antes de ser aceito. O resultado é um repositório de evidências à prova de adulteração e com apenas adições, e não apenas uma marca de seleção verde baseada na confiança.
- **Um contrato de política que você controla.** Declare o que conta como "verificado" em YAML — um DSL de predicados limitado e sem avaliação (`field`/`op`/`value` + `all`/`any`/`not`/`implies`) — e aplique-o em seus repositórios. Valide uma política antes de enviá-la com `dogfood-verify lint`.
- **Um protocolo de enxame de agentes paralelos.** Execute auditorias multiagente em uma base de código e, em seguida, transforme os resultados brutos em padrões e doutrinas reutilizáveis.
- **Uma superfície de status em tempo real.** Registros e índices por repositório, além de um selo de status, tudo servido a partir de um único repositório de evidências.
- **Uma página que mostra como um repositório funciona.** O Atlas lê os fluxos de trabalho, as importações, as gravações e o histórico de um repositório e escreve `atlas/README.md`: o que entra, o que é executado, onde é armazenado, quem o lê, o que causa falhas, por onde começar. Nenhuma frase nele é escrita por uma pessoa, e `atlas check` faz com que o CI falhe quando o mapa para de corresponder ao código.

É o principal monorepos da organização [Dogfood Lab](https://github.com/dogfood-lab) — oito pacotes `@dogfood-lab/*` por trás de uma CLI `swarm` e uma CLI `atlas`.

## Início rápido

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

Quer que as evidências de teste do seu próprio repositório sejam registradas aqui? O **[kit inicial `examples/`](examples/)** permite que você comece em cinco minutos (`dogfood-report` cria o envio; `dogfood-init` cria o fluxo de trabalho). O guia do operador, a referência da CLI, a referência do esquema e as receitas de integração estão no **[manual](https://dogfood-lab.github.io/testing-os/handbook/)**. Os detalhes por versão estão em [CHANGELOG.md](CHANGELOG.md).

## Modelo de ameaças

O testing-os processa os envios do Dogfood enviados por meio de `repository_dispatch` de repositórios confiáveis do GitHub sob `mcp-tool-shop-org/*` e `dogfood-lab/*`. O verificador exige a procedência do CI — os IDs de execução reivindicados são confirmados por meio da API do provedor, e os envios com formatos malformados, referências ausentes ou reivindicações de política inválidas são rejeitados.

**A procedência é a garantia.** Para um envio `github`, o verificador confirma que a execução do GitHub Actions reivindicada realmente existe (API do GitHub) e vincula o `repo` e o `commit_sha` do envio a essa execução confirmada — uma verificação ao vivo e sem necessidade de chaves, enraizada na própria identidade OIDC do GitHub, para que um registro não possa atestar uma execução ou um commit que não ocorreu. O **GitLab CI** é suportado como uma opção (`source.provider: gitlab`); um envio do GitLab é o único caso em que o verificador chama um host que não é do GitHub (`gitlab.com/api`), e apenas para envios `gitlab`.

**A integridade do registro é à prova de adulteração, não à prova de violação.** Cada registro persistido carrega um bloco `integrity` (`submission_digest` + `prev_digest`) que forma uma cadeia de hash com apenas adições, que `node packages/ingest/run.js --verify-chain` valida completamente offline — detectando adulterações externas, corrupção de disco e restaurações parciais. Ele **não** se defende contra as credenciais de ingestão em si, que podem reescrever um registro e a cadeia; para evitar isso, é necessária uma âncora fora do controle do escritor. Uma **âncora opcional, desativada por padrão no XRPL** (`node packages/ingest/run.js --anchor-*`) testemunha o cabeçalho da cadeia no XRP Ledger público, tornando qualquer truncamento ou reescrita abaixo de um ponto ancorado detectável — a segunda chamada divulgada para um host que não é do GitHub, e apenas quando um operador a habilita.

**O que o testing-os acessa:** o JSON do envio em cada carga útil `repository_dispatch`; `policies/`, `fixtures/`, `records/`, `indexes/` e `dogfood/roadmap/` neste repositório (o último é escrito apenas por um `swarm roadmap compile` invocado por um operador — nunca pelo caminho de ingestão automatizado); chamadas de saída para `api.github.com` para verificação de procedência; e — apenas para envios `github` — uma busca somente leitura do `dogfood/scenarios/<scenario_id>.yaml` do repositório de envio no commit atestado (a definição de cenário que alimenta a aplicação de etapas obrigatórias; com tamanho limitado e validada pelo esquema antes do uso, os arquivos ausentes simplesmente deixam essa verificação sem ser aplicada, com um aviso visível).

**O que o testing-os NÃO acessa:** código-fonte do consumidor além dos arquivos de definição `dogfood/scenarios/` declarados, segredos nos repositórios do consumidor além do envelope de envio ou qualquer coisa fora da árvore de trabalho deste repositório.

**As transições de estado de descoberta são evidências e têm apenas adições.** Os verbos de fechamento do plano de controle do enxame (`swarm reopen`, `swarm close`) exigem uma razão e evidências explícitas e — para fechamentos de operador — um modo de verificação declarado; cada transição grava uma linha `finding_events` imutável, registrando a autoridade que executa a ação. Nenhum caminho automatizado pode fechar uma descoberta com base na falta de novidades ou reabri-la com base em uma previsão, e nenhum verbo pode reescrever o histórico de eventos — uma credencial usada incorretamente pode adicionar transições, mas cada adição é registrada.

**Interface de rede.** Por padrão, a única saída é `api.github.com` (somente leitura: confirmação da proveniência + a recuperação da definição do cenário mencionada acima). As duas exceções são opcionais e foram descritas acima: um envio do provedor GitLab (`gitlab.com/api`) e uma execução de âncora XRPL habilitada pelo operador. **Sem telemetria, sem análise — este código-fonte nunca se comunica com um servidor externo; sem esses dois caminhos opcionais, ele não expõe nenhuma interface de rede além do GitHub.** O fluxo de trabalho do receptor é executado com `contents: write`, restrito a este repositório.

## Pacotes

| Pacote | Fonte | Objetivo |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | Os 8 esquemas JSON (registro, descoberta, padrão, recomendação, doutrina, política, cenário, envio). |
| `@dogfood-lab/verify` | JS | Validador central de envios. Os envios passam por aqui antes de serem persistidos. |
| `@dogfood-lab/findings` | JS | Contrato de descoberta + pipelines de derivação/revisão/síntese/aconselhamento. |
| `@dogfood-lab/ingest` | JS | Conexão do pipeline: envio → verificação → persistência → indexação. |
| `@dogfood-lab/report` | JS | Criador de envios para repositórios de origem. |
| `@dogfood-lab/portfolio` | JS | Gerador de portfólio entre repositórios. |
| `@dogfood-lab/dogfood-swarm` | JS | O protocolo de agente paralelo de 10 fases + plano de controle SQLite + `swarm` bin. |
| `@dogfood-lab/atlas` | JS | Lê um repositório e grava a página que explica como ele funciona (`atlas/README.md`); `atlas check` controla o mapa no CI. Sem dependências entre os módulos; executa em qualquer repositório. |

Ferramentas de teste independentes que se integram por meio de APIs publicadas: [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab).

## Layout

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

## Desenvolvimento local

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

Requer Node ≥ 22. A matriz CI executa Node 22 + 24 em `ubuntu-latest`; validado localmente em Node 25.

**Sistemas de arquivos suportados:** APFS, HFS+, ext4 (linha de base do CI), NTFS — qualquer sistema que implemente POSIX `link(2)`. **Não suportado:** exFAT, FAT32. O CAS de bloqueio de arquivos em [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) requer semântica de link rígido para publicação atômica; no exFAT, `linkSync` gera `ENOTSUP` (alto, não silencioso). Um problema comum: SSDs externos multiplataforma geralmente são formatados em exFAT — clone o repositório para APFS/HFS+ local em vez disso. Consulte [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) para a matriz de validação completa da Sessão G.

## Versionamento

Todos os pacotes `@dogfood-lab/*` são atualizados em conjunto — um único número em todo o monorepositorio. Sete pacotes são publicados no npm sob `@dogfood-lab` na versão v1.13.0, em sincronia (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`); o oitavo, `@dogfood-lab/portfolio`, permanece interno. A linha de versão perto do topo deste README é gerada automaticamente a partir de `package.json` por meio de [`scripts/sync-version.mjs`](scripts/sync-version.mjs) a cada `npm run build`.

## Licença

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[Manual](https://dogfood-lab.github.io/testing-os/handbook/)** · **[Todos os Repositórios](https://github.com/orgs/dogfood-lab/repositories)** · **[Perfil](https://github.com/dogfood-lab)**

*Coma primeiro. Envie depois.*

</div
