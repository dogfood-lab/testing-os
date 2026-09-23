<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**AI時代におけるテスト用のオペレーティングシステム**

*AIによる支援を受けたソフトウェアのためのプロトコル、証拠ストア、および学習ループ。*

<!-- version:start -->
**v1.14.0** — 現在のリリース。リリース内容については、[CHANGELOG.md](CHANGELOG.md) を参照してください。
<!-- version:end -->

📖 **[ハンドブックを読む →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## これは何なのか

`testing-os` は、AIネイティブなワークフローで、リポジトリの実際のテスト証拠を記録、検証し、そこから学習します。リポジトリを指し示すと、すべてのテスト実行は、信頼できるProvenance（出所）が確認されたレコードになります。これは、自己申告による合格ではありません。

得られるもの：

- **Provenance（出所）が確認されたレコード。** すべての送信は、受け入れられる前に、実際のCI実行にバインドされます（キーレスで、プロバイダー自身のIDを使用）。その結果、改ざんが検知可能な、追記専用の証拠ストアとなり、単なる「合格」のチェックマークではありません。
- **制御可能なポリシー契約。** YAMLで「検証済み」と見なすものを宣言します。これは、境界が定められた、評価を実行しない述語DSL（`field`/`op`/`value` + `all`/`any`/`not`/`implies`）であり、リポジトリ全体で強制できます。ポリシーをリリースする前に、`dogfood-verify lint`を使用してlintを実行します。
- **並列エージェントスウォームプロトコル。** コードベースに対してマルチエージェント監査を実行し、生の調査結果を再利用可能なパターンとドクトリンに変換します。
- **ライブステータスサーフェス。** リポジトリごとのレコード、インデックス、およびステータスバッジはすべて、1つの証拠ストアから提供されます。
- **リポジトリの動作を説明するページ。** Atlasは、リポジトリのワークフロー、実行するツール、インポート、書き込み、および履歴を読み取り、`atlas/README.md`を書き込みます。つまり、何が入ってくるか、何が実行されるか、どこに保存されるか、誰がそれを読み取るか、何が何に影響を与えるか、前回から何が変更されたか、どこから始めるかです。そこに書かれた文章は、人が書いたものではありません。`atlas check`は、マップがコードと一致しなくなった場合にCIを失敗させ、`atlas explain <file>`はシステム内の1つのファイルが何であるかを回答し、すべてのプルリクエストには、構造的なデルタがコメントとして追加されます。

これは、[Dogfood Lab](https://github.com/dogfood-lab)組織の主要なモノリポジトリであり、8つの`@dogfood-lab/*`パッケージが、1つの`swarm`CLIと1つの`atlas`CLIの基盤となっています。

## クイックスタート

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

独自のリポジトリのテスト証拠をここに記録したいですか？ **[`examples/`スターターキット](examples/)** を使用すると、5分で設定できます（`dogfood-report`は送信をビルドし、`dogfood-init`はワークフローを構築します）。オペレーターガイド、CLIリファレンス、スキーマリファレンス、および統合レシピは、**[ハンドブック](https://dogfood-lab.github.io/testing-os/handbook/)** にあります。バージョンごとの詳細は、[CHANGELOG.md](CHANGELOG.md) にあります。

## 脅威モデル

testing-osは、`mcp-tool-shop-org/*`と`dogfood-lab/*`の下にある信頼できるGitHubリポジトリから、`repository_dispatch`を介して送信されたdogfood送信を処理します。検証者は、CIのProvenance（出所）を必要とします。主張された実行IDは、プロバイダーのAPIを介して確認され、形状が不正、参照が欠落している、またはポリシーの主張が無効な送信は拒否されます。

**Provenance（出所）が認証です。** `github`送信の場合、検証者は、主張されたGitHub Actions実行が実際に存在すること（GitHub API）を確認し、送信の`repo`と`commit_sha`をその確認された実行にバインドします。これは、ライブでキーレスのチェックであり、GitHub自身のOIDC IDに根ざしているため、レコードは、実際には発生しなかった実行またはコミットを証明することはできません。**GitLab CI**は、オプションでサポートされています（`source.provider: gitlab`）。GitLab送信は、検証者が非GitHubホストを呼び出す唯一のケースであり（`gitlab.com/api`）、それも`gitlab`送信に対してのみです。

**レコードの整合性は、改ざん防止ではなく、改ざんが検知可能です。** 永続化されたすべてのレコードには、`integrity`ブロック（`submission_digest` + `prev_digest`）が含まれており、これは追記専用のハッシュチェーンを形成し、`node packages/ingest/run.js --verify-chain`が完全にオフラインで検証します。これにより、外部からの改ざん、ディスクの破損、および部分的な復元が検出されます。ただし、これは、レコードとチェーンの両方を書き換えることができるインジェスト資格情報自体を防御するものではありません。これを閉じるには、書き込み者の制御外にあるアンカーが必要です。**オプションで、デフォルトでは無効になっているXRPLアンカー**（`node packages/ingest/run.js --anchor-*`）は、チェーンのヘッダーをパブリックXRP Ledgerに記録し、アンカーポイントより下の任意の切り捨てまたは書き換えを検出できるようにします。これは、開示された2番目の非GitHub呼び出しであり、オペレーターがそれを有効にした場合にのみ行われます。

**What testing-os touches:** the submission JSON in each `repository_dispatch` payload; `policies/`, `fixtures/`, `records/`, `indexes/`, and `dogfood/roadmap/` in this repo (the last written only by an operator-invoked `swarm roadmap compile` — never by the automated ingest path); outbound calls to `api.github.com` for provenance verification; and — for `github` submissions only — a read-only fetch of the submitting repo's `dogfood/scenarios/<scenario_id>.yaml` at the attested commit (the scenario definition that powers required-steps enforcement; size-capped and schema-validated before use, absent files simply leave that check unenforced with a visible warning).

**testing-osが扱わないもの：** 宣言された`dogfood/scenarios/`定義ファイルを超えた消費者のソースコード、消費者のリポジトリ内の秘密（送信エンベロープ内）、またはこのリポジトリのワーキングツリー外のすべてのもの。

**検出状態の遷移は証拠となるものであり、追加のみが可能です。** スウォーム制御プレーンのクローズ動詞（`swarm reopen`、`swarm close`）には、明示的な理由と証拠が必要であり、さらにオペレーターのクローズの場合は、宣言された検証モードも必要です。すべての遷移は、実行主体を記録した不変の`finding_events`行を書き込みます。自動化されたパスで、検出結果が古くなった場合にクローズしたり、予測に基づいて再開したりすることはできません。また、どの動詞もイベント履歴を書き換えることはできません。誤って使用された認証情報によって遷移が追加されることはありますが、各追加自体も記録されます。

**ネットワークの範囲。** デフォルトでは、唯一の送信先は`api.github.com`（読み取り専用：プロベナンスの確認 + 上記のシナリオ定義の取得）です。例外は2つあり、どちらもオプトインであり、上記で説明されています。GitLabプロバイダーによる送信（`gitlab.com/api`）、およびオペレーターが有効にしたXRPLアンカーの実行です。**テレメトリも分析も行いません。このコードベースは、外部に情報を送信しません。上記の2つのオプトインパスがない場合、GitHubを超えてネットワークの範囲を公開することはありません。** 受信側のワークフローは、このリポジトリのみにスコープされた`contents: write`で実行されます。

## パッケージ

| パッケージ | ソース | 目的 |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | 8つのJSONスキーマ（レコード、検出、パターン、推奨事項、ドクトリン、ポリシー、シナリオ、送信）。 |
| `@dogfood-lab/verify` | JS | 中央の送信バリデーター。送信は、永続化される前にここを通過します。 |
| `@dogfood-lab/findings` | JS | 検出コントラクト + 派生/レビュー/合成/アドバイスのパイプライン。 |
| `@dogfood-lab/ingest` | JS | パイプラインの連携：ディスパッチ → 検証 → 永続化 → インデックス作成。 |
| `@dogfood-lab/report` | JS | ソースリポジトリの送信ビルダー。 |
| `@dogfood-lab/portfolio` | JS | クロスリポジトリのポートフォリオジェネレーター。 |
| `@dogfood-lab/dogfood-swarm` | JS | 10段階の並列エージェントプロトコル + SQLite制御プレーン + `swarm`バイナリ。 |
| `@dogfood-lab/atlas` | JS | リポジトリを読み取り、その動作方法を記述したページを書き込みます（`atlas/README.md`）。`atlas check`は、CIでマップをゲートします。依存関係はありません。どのリポジトリでも実行できます。 |

公開されたAPIを介して統合されるが、**独立性を維持する**姉妹のテストツール：[`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck)、[`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge)、[`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp)、[`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine)、[`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab)。

## レイアウト

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

## ローカル開発

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

Node ≥ 22が必要です。CIマトリックスは、Node 22 + 24を`ubuntu-latest`で実行し、ローカルではNode 25で検証します。

**サポートされているファイルシステム：** APFS、HFS+、ext4（CIのベースライン）、NTFS — POSIX `link(2)`を実装しているもの。**サポート対象外：** exFAT、FAT32。[`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js)のファイルロックCASは、アトミックな公開のためにハードリンクセマンティクスを必要とします。exFATの場合、`linkSync`は`ENOTSUP`をスローします（静かにではなく、大きなエラーメッセージを表示します）。一般的な落とし穴：クロスプラットフォームの外部SSDは、多くの場合、exFATでフォーマットされています。代わりに、リポジトリをローカルのAPFS/HFS+にクローンしてください。[`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md)には、完全なSession G検証マトリックスが記載されています。

## バージョン管理

All `@dogfood-lab/*` packages bump together — one number across the monorepo. Seven packages publish to npm under `@dogfood-lab` at v1.14.0 in lockstep (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`); the eighth, `@dogfood-lab/portfolio`, stays internal. The version line near the top of this README is auto-stamped from `package.json` via [`scripts/sync-version.mjs`](scripts/sync-version.mjs) on every `npm run build`.

## ライセンス

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[ハンドブック](https://dogfood-lab.github.io/testing-os/handbook/)** · **[すべてのリポジトリ](https://github.com/orgs/dogfood-lab/repositories)** · **[プロフィール](https://github.com/dogfood-lab)**

*まず食べて、次にリリースする。*

</div
