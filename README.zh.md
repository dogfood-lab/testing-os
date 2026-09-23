<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**人工智能时代用于测试的操作系统**

*用于人工智能辅助软件的协议、证据存储和学习循环。*

<!-- version:start -->
**v1.15.0** — 当前版本。有关已发布内容，请参阅 [CHANGELOG.md](CHANGELOG.md)。
<!-- version:end -->

📖 **[阅读手册 →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div>

---

## 这是什么

`testing-os` 记录、验证并从您的仓库中的实际测试证据中学习，采用人工智能原生工作流程。将其指向一个仓库，每次测试运行都将成为一个可以信任的、具有来源证明的记录——而不是自我报告的通过状态。

您将获得：

- **具有来源证明的记录。** 每个提交都与真实的 CI 运行相关联——无需密钥，通过提供商自己的身份——然后才被接受。结果是一个防篡改的、仅追加的证据存储，而不是一个基于诚信原则的绿色复选标记。
- **您可以控制的策略合同。** 在 YAML 中声明什么被认为是“已验证”——一个有界、无评估谓词 DSL（`field`/`op`/`value` + `all`/`any`/`not`/`implies`）——并在您的仓库中强制执行。使用 `dogfood-verify lint` 在发布之前检查策略。
- **一个并行代理群协议。** 针对代码库运行多代理审计，然后将原始结果转换为可重用的模式和原则。
- **一个实时状态界面。** 每个仓库的记录、索引和一个状态徽章，所有这些都来自一个证据存储。
- **一个页面，说明一个仓库是如何工作的。** Atlas 读取仓库的工作流程和清单、它们运行的工具、其导入、写入和历史记录，并编写 `atlas/README.md`：输入的内容、运行的内容、最终存储的位置、谁读取它、什么导致什么出错、自上次映射以来发生了什么变化、从哪里开始。其中的任何句子都不是由人编写的；`atlas check` 在地图与代码不匹配时，CI 会失败，`atlas explain <file>` 确定一个文件中在系统中的位置，并且每个拉取请求都会获得结构差异作为评论。

它是 [Dogfood Lab](https://github.com/dogfood-lab) 组织的旗舰单仓库项目——八个 `@dogfood-lab/*` 包，基于一个 `swarm` CLI 和一个 `atlas` CLI。

## 快速入门

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

想要将您自己的仓库的测试证据记录到这里吗？**[`examples/` 启动工具包](examples/)** 可以在五分钟内完成设置（`dogfood-report` 构建提交；`dogfood-init` 搭建工作流程）。操作指南、CLI 参考、模式参考和集成配方都位于 **[手册](https://dogfood-lab.github.io/testing-os/handbook/)** 中。每个版本的详细信息都位于 [CHANGELOG.md](CHANGELOG.md) 中。

## 在私有环境中运行

公共站点呈现每个已采用 Atlas 的公共仓库。对于必须保留在您机器上的仓库，相同的引擎以容器形式提供，并具有持久内存：

```bash
mkdir -p atlas-data repos
cp docker/fleet.example.yml atlas-data/fleet.yml   # list your repositories, by mounted path or clone URL
docker compose -f docker/compose.example.yml up -d
```

`./atlas-data` 是内存：`fleet.yml`，每次渲染，每个仓库的历史记录和状态。该服务在启动时（内存为空时）映射一次，然后在 `fleet.yml` 中按照计划进行映射，并在 `http://127.0.0.1:8080/` 处提供仓库列表，并在 `/?repo=owner/name` 处提供每个页面。除了您列出的仓库的 git 获取之外，没有任何内容会离开容器；删除 `./atlas-data` 是忘记的唯一方法。相同的镜像在单个仓库上运行 CLI：`docker run --rm -v "$PWD:/repo" ghcr.io/dogfood-lab/atlas map`。运行命令，文件形状位于 [`docker/README.md`](docker/README.md) 中。

## 威胁模型

testing-os 处理通过 `repository_dispatch` 从受信任的 GitHub 仓库（位于 `mcp-tool-shop-org/*` 和 `dogfood-lab/*` 下）发送的 dogfood 提交。验证器需要 CI 来源证明——声明的运行 ID 通过提供商的 API 进行确认，并且具有格式错误的形状、缺少引用或无效策略声明的提交将被拒绝。

**来源证明是证明。** 对于 `github` 提交，验证器会确认声明的 GitHub Actions 运行确实存在（GitHub API），并将提交的 `repo` 和 `commit_sha` 绑定到该已确认的运行——这是一种实时的、无需密钥的检查，其根源在于 GitHub 自己的 OIDC 身份，因此记录不能证明未发生过的运行或提交。**GitLab CI** 默认支持（`source.provider: gitlab`）；GitLab 提交是验证器调用非 GitHub 主机（`gitlab.com/api`）的唯一情况，并且仅适用于 `gitlab` 提交。

**记录完整性是防篡改的，但不是完全防篡改的。** 每个持久化的记录都携带一个 `integrity` 块（`submission_digest` + `prev_digest`），形成一个仅追加的哈希链，该链由 `node packages/ingest/run.js --verify-chain` 完全离线验证——检测非预期篡改、磁盘损坏和部分恢复。它**不**防御对注入凭据本身的攻击，该凭据可以重写记录和链；要解决这个问题，需要一个写入者无法控制的锚点。一个**可选的、默认关闭的 XRPL 锚点**（`node packages/ingest/run.js --anchor-*`）将链头记录到公共 XRP Ledger，从而可以检测任何低于已锚定点的截断或重写——这是第二个公开的非 GitHub 调用，并且仅当操作员启用它时才会发生。

**testing-os 涉及的内容：**每个 `repository_dispatch` 负载中的提交 JSON；此仓库中的 `policies/`、`fixtures/`、`records/`、`indexes/` 和 `dogfood/roadmap/`（最后一个仅由操作员调用的 `swarm roadmap compile` 写入——绝不会通过自动化的导入流程写入）；到 `api.github.com` 的外向调用，用于验证来源；以及——仅针对 `github` 提交——对提交仓库的 `dogfood/scenarios/<scenario_id>.yaml` 的只读读取，读取的是经过验证的提交（场景定义，用于支持必需步骤的强制执行；在使用前会限制大小并验证模式，如果缺少文件，则该检查将不会被强制执行，并会显示可见的警告）。

**testing-os 不涉及的内容：**超出已声明的 `dogfood/scenarios/` 定义文件的消费者源代码、消费者仓库中超出分发信封的密钥，或此仓库工作树之外的任何内容。

**发现状态转换具有证据意义且仅追加。**群集控制平面的关闭动词（`swarm reopen`、`swarm close`）需要明确的原因、证据，以及——对于操作员关闭——声明的验证模式；每次转换都会写入一个不可变的 `finding_events` 行，记录执行操作的权限。没有自动化的流程可以基于过时状态关闭发现，也没有自动化的流程可以基于预测重新打开发现，也没有任何动词可以重写事件历史——错误使用的凭据可以添加转换，但每次添加本身都会被记录。

**网络接口。**默认情况下，唯一的出站连接是 `api.github.com`（只读：来源确认 + 上述的场景定义读取）。两种例外情况都是可选的，并且已在上面说明：GitLab 提供商提交（`gitlab.com/api`）和操作员启用的 XRPL 锚点运行。**没有遥测数据，没有分析数据——此代码库绝不会主动连接到外部服务器；如果没有这两个可选路径，它不会暴露任何超出 GitHub 的网络接口。**接收器工作流程的范围仅限于此仓库中的 `contents: write`。

## 软件包

| 软件包 | 源代码 | 目的 |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | 8 个 JSON 模式（记录、发现、模式、建议、原则、策略、场景、提交）。 |
| `@dogfood-lab/verify` | JS | 中央提交验证器。提交在持久化之前会经过此验证器。 |
| `@dogfood-lab/findings` | JS | 发现契约 + 推导/审查/综合/建议流水线。 |
| `@dogfood-lab/ingest` | JS | 流水线粘合剂：分发 → 验证 → 持久化 → 索引。 |
| `@dogfood-lab/report` | JS | 用于源代码仓库的提交构建器。 |
| `@dogfood-lab/portfolio` | JS | 跨仓库投资组合生成器。 |
| `@dogfood-lab/dogfood-swarm` | JS | 10 阶段并行代理协议 + SQLite 控制平面 + `swarm` 二进制文件。 |
| `@dogfood-lab/atlas` | JS | 读取一个仓库并写入一个页面，说明它的工作方式（`atlas/README.md`）；`atlas check` 在 CI 中控制该映射。没有同级依赖关系；可以在任何仓库中运行。 |

保持独立的同级测试工具，但通过已发布的 API 进行集成：[`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck)、[`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge)、[`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp)、[`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine)、[`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab)。

## 布局

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

## 本地开发

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

需要 Node ≥ 22。CI 矩阵在 `ubuntu-latest` 上运行 Node 22 + 24；在本地使用 Node 25 进行验证。

**支持的文件系统：**APFS、HFS+、ext4（CI 基准）、NTFS——任何实现 POSIX `link(2)` 的文件系统。**不支持：**exFAT、FAT32。在 [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) 中的文件锁定 CAS 需要原子发布的文件硬链接语义；在 exFAT 上，`linkSync` 会引发 `ENOTSUP`（响亮，而不是静默）。常见问题：跨平台外部 SSD 通常格式化为 exFAT——而是将仓库克隆到本地 APFS/HFS+。请参阅 [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md)，了解完整的 Session G 验证矩阵。

## 版本控制

All `@dogfood-lab/*` packages bump together — one number across the monorepo. Seven packages publish to npm under `@dogfood-lab` at v1.15.0 in lockstep (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`); the eighth, `@dogfood-lab/portfolio`, stays internal. The version line near the top of this README is auto-stamped from `package.json` via [`scripts/sync-version.mjs`](scripts/sync-version.mjs) on every `npm run build`.

## 许可证

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[手册](https://dogfood-lab.github.io/testing-os/handbook/)** · **[所有仓库](https://github.com/orgs/dogfood-lab/repositories)** · **[个人资料](https://github.com/dogfood-lab)**

*先吃，后发布。*

</div>
