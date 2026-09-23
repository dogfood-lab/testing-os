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
**v1.15.0** — 現在のリリース。変更点は[CHANGELOG.md](CHANGELOG.md)を参照してください。
<!-- version:end -->

📖 **[ハンドブックを読む →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## これは何ですか

`testing-os`は、AIネイティブなワークフローで、リポジトリの実際のテスト証拠を記録、検証し、そこから学習します。リポジトリを指し示すと、すべてのテスト実行は、信頼できる、自己申告された合格ではなく、出所が確認された記録になります。

得られるもの：

- **出所が確認された記録。**すべての提出物は、受け入れられる前に、実際のCI実行にバインドされます（プロバイダー自身のIDによる、キーレス）。その結果、改ざんが検知可能で、追記のみが可能な証拠ストアとなり、単なる形式的な緑色のチェックマークではありません。
- **制御可能なポリシー契約。**YAMLで「検証済み」と見なすものを宣言します。これは、境界が定められた、評価を行わない述語DSL（`field`/`op`/`value` + `all`/`any`/`not`/`implies`）であり、リポジトリ全体で強制することができます。ポリシーをリリースする前に、`dogfood-verify lint`を使用してlintを実行します。
- **並列エージェントスウォームプロトコル。**コードベースに対してマルチエージェント監査を実行し、次に生の調査結果を再利用可能なパターンと教義に変換します。
- **ライブステータスサーフェス。**リポジトリごとの記録、インデックス、およびステータスバッジはすべて、1つの証拠ストアから提供されます。
- **リポジトリの動作方法を示すページ。**Atlasは、リポジトリのワークフローとマニフェスト、実行するツール、インポート、書き込み、および履歴を読み取り、`atlas/README.md`を書き込みます。つまり、何が入ってくるか、何が実行されるか、どこに保存されるか、誰がそれを読み取るか、何が何に影響を与えるか、前回から何が変更されたか、どこから始めるかを示します。そこに書かれている文章は、人が書いたものではありません。`atlas check`は、マップがコードと一致しなくなった場合にCIを失敗させ、`atlas explain <file>`はシステム内の1つのファイルが何であるかを回答し、すべてのプルリクエストには構造的なデルタがコメントとして追加されます。

これは、[Dogfood Lab](https://github.com/dogfood-lab)組織の主要なモノリポジトリであり、8つの`@dogfood-lab/*`パッケージが、1つの`swarm`CLIと1つの`atlas`CLIの基盤となっています。

## クイックスタート

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

独自のレポジトリのテスト証拠をここに記録したいですか？**[`examples/`スターターキット](examples/)**を使用すると、5分で設定できます（`dogfood-report`は提出物をビルドし、`dogfood-init`はワークフローを構築します）。オペレーターガイド、CLIリファレンス、スキーマリファレンス、および統合レシピは、**[ハンドブック](https://dogfood-lab.github.io/testing-os/handbook/)**にあります。バージョンごとの詳細は、[CHANGELOG.md](CHANGELOG.md)にあります。

## プライベート環境で実行する

パブリックサイトは、Atlasを採用したすべてのパブリックリポジトリをレンダリングします。マシンから出さない必要があるリポジトリの場合、同じエンジンは、永続的なメモリを備えたコンテナとして提供されます。

```bash
mkdir -p atlas-data repos
cp docker/fleet.example.yml atlas-data/fleet.yml   # list your repositories, by mounted path or clone URL
docker compose -f docker/compose.example.yml up -d
```

`./atlas-data`がメモリです。`fleet.yml`は、すべてのレンダリング、各リポジトリの履歴と状態です。サービスは、メモリが空の状態で起動時に1回マップし、次に`fleet.yml`のスケジュールに従ってマップし、`http://127.0.0.1:8080/`でフリートリストを、`/?repo=owner/name`で各ページを提供します。リストに登録したリポジトリのgitフェッチを除いて、コンテナから何も出力されません。`./atlas-data`を削除すると、すべてが忘れられます。同じイメージは、1つのリポジトリでCLIを実行します。`docker run --rm -v "$PWD:/repo" ghcr.io/dogfood-lab/atlas map`。コマンドを実行すると、ファイル構造は[`docker/README.md`](docker/README.md)にあります。

## 脅威モデル

testing-osは、`mcp-tool-shop-org/*`と`dogfood-lab/*`の下にある信頼できるGitHubリポジトリから、`repository_dispatch`を介して送信されたdogfood提出物を処理します。検証者は、CIの出所を必要とします。主張された実行IDは、プロバイダーのAPIを介して確認され、形状が正しくない、参照が欠落している、またはポリシーの主張が無効な提出物は拒否されます。

**出所が認証です。**`github`の提出物について、検証者は、主張されたGitHub Actionsの実行が実際に存在すること（GitHub API）を確認し、提出物の`repo`と`commit_sha`をその確認された実行にバインドします。これは、GitHub自身のOIDC IDに根ざした、ライブでキーレスのチェックであり、記録は、実際に発生しなかった実行またはコミットを証明することはできません。**GitLab CI**は、オプションでサポートされています（`source.provider: gitlab`）。GitLabの提出物は、検証者が非GitHubホストを呼び出す唯一のケースであり（`gitlab.com/api`）、それも`gitlab`の提出物に対してのみです。

**記録の整合性は、改ざん防止ではなく、改ざんが検知可能です。**永続化されたすべての記録には、`integrity`ブロック（`submission_digest` + `prev_digest`）が含まれており、これは追記のみが可能なハッシュチェーンを形成し、`node packages/ingest/run.js --verify-chain`がオフラインで完全に検証します。これにより、外部からの改ざん、ディスクの破損、および部分的な復元が検出されます。ただし、これは、記録とチェーンの両方を書き換えることができるインジェスト資格情報自体を防御するものではありません。これを閉じるには、書き込み者の制御外にあるアンカーが必要です。**オプションで、デフォルトでは無効になっているXRPLアンカー**（`node packages/ingest/run.js --anchor-*`）は、チェーンのヘッダーをパブリックXRP Ledgerに記録し、アンカーポイントより下の任意の切り捨てまたは書き換えを検出できるようにします。これは、開示された2番目の非GitHub呼び出しであり、オペレーターがそれを有効にした場合にのみ行われます。

**testing-os が扱うもの:** 各 `repository_dispatch` ペイロード内の送信 JSON、このリポジトリ内の `policies/`、`fixtures/`、`records/`、`indexes/`、および `dogfood/roadmap/`（最後のものはオペレーターが呼び出した `swarm roadmap compile` によってのみ書き込まれ、自動化された取り込みパスでは決して書き込まれません）、信頼性検証のための `api.github.com` へのアウトバウンド呼び出し、および `github` の送信に対してのみ、送信リポジトリのコミットハッシュにおける `dogfood/scenarios/<scenario_id>.yaml` の読み取り専用フェッチ（シナリオ定義は、必須ステップの強制に使用され、使用前にサイズ制限とスキーマ検証が行われ、ファイルが存在しない場合は、そのチェックが実行されず、目に見える警告が表示されます）。

**testing-os が扱わないもの:** 宣言された `dogfood/scenarios/` 定義ファイルを超えたコンシューマーのソースコード、コンシューマーリポジトリ内のディスパッチエンベロープを超えたシークレット、またはこのリポジトリのワーキングツリー外のすべてのもの。

**検出状態の移行は、証拠となるものであり、追加のみが可能です。** スウォーム制御プレーンのクローズ動詞（`swarm reopen`、`swarm close`）には、明示的な理由、証拠、およびオペレーターによるクローズの場合は、宣言された検証モードが必要です。すべての移行は、実行された権限を記録する不変の `finding_events` 行を書き込みます。自動化されたパスで、検出が古いという理由でクローズされたり、予測によって再開されたりすることはありません。また、どの動詞もイベント履歴を書き換えることはできません。誤って使用された認証情報は移行を追加できますが、各追加自体も記録されます。

**ネットワークの範囲。** デフォルトでは、唯一の送信先は `api.github.com` です（読み取り専用：信頼性の確認 + 上記のシナリオ定義のフェッチ）。例外は 2 つだけで、どちらもオプトインであり、上記で説明されています。GitLab プロバイダーによる送信（`gitlab.com/api`）、およびオペレーターが有効にした XRPL アンカーの実行です。**テレメトリや分析は行いません。このコードベースは、外部に情報を送信しません。上記の 2 つのオプトインパスがない場合、GitHub 以外にネットワークの範囲は存在しません。** 受信ワークフローは、このリポジトリのみにスコープされた `contents: write` で実行されます。

## パッケージ

| パッケージ | ソース | 目的 |
|---------|--------|---------|
| `@dogfood-lab/schemas` | TypeScript | 8 つの JSON スキーマ（レコード、検出、パターン、推奨事項、ドクトリン、ポリシー、シナリオ、送信）。 |
| `@dogfood-lab/verify` | JS | 中央の送信バリデーター。送信は、永続化される前に、ここを通過します。 |
| `@dogfood-lab/findings` | JS | 検出コントラクト + 派生/レビュー/合成/アドバイスのパイプライン。 |
| `@dogfood-lab/ingest` | JS | パイプラインのグルー：ディスパッチ → 検証 → 永続化 → インデックス作成。 |
| `@dogfood-lab/report` | JS | ソースリポジトリの送信ビルダー。 |
| `@dogfood-lab/portfolio` | JS | クロスリポジトリのポートフォリオジェネレーター。 |
| `@dogfood-lab/dogfood-swarm` | JS | 10 フェーズの並列エージェントプロトコル + SQLite 制御プレーン + `swarm` バイナリ。 |
| `@dogfood-lab/atlas` | JS | リポジトリを読み取り、その動作方法を記述したページを書き込みます（`atlas/README.md`）。`atlas check` が CI でマップをゲートします。依存関係はありません。任意のレポジトリで実行できます。 |

**独立性を維持しながら、公開された API を介して統合する** 関連するテストツール：[`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck)、[`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge)、[`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp)、[`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine)、[`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab)。

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

Node ≥ 22 が必要です。CI マトリックスは、Node 22 + 24 を `ubuntu-latest` で実行し、ローカルでは Node 25 で検証します。

**サポートされているファイルシステム:** APFS、HFS+、ext4（CI のベースライン）、NTFS — POSIX `link(2)` を実装しているもの。**サポート対象外:** exFAT、FAT32。[`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) のファイルロック CAS は、アトミックな公開にハードリンクのセマンティクスが必要です。exFAT では、`linkSync` が `ENOTSUP` をスローします（静かにではなく、大きな警告が表示されます）。一般的な落とし穴：クロスプラットフォームの外部 SSD は、多くの場合、exFAT でフォーマットされています。リポジトリをローカルの APFS/HFS+ にクローンしてください。完全なセッション G 検証マトリックスについては、[`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) を参照してください。

## バージョン管理

すべての `@dogfood-lab/*` パッケージは、まとめてバージョンアップされます。つまり、モノリポジトリ全体で 1 つの番号が使用されます。7 つのパッケージは、v1.15.0 で `@dogfood-lab` に同期して npm に公開されます（`schemas`、`verify`、`report`、`ingest`、`findings`、`dogfood-swarm`、`atlas`）。8 番目のパッケージである `@dogfood-lab/portfolio` は、内部でのみ使用されます。この README の上部近くにあるバージョン行は、すべての `npm run build` で [`scripts/sync-version.mjs`](scripts/sync-version.mjs) を介して `package.json` から自動的にタイムスタンプが設定されます。

## ライセンス

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[ハンドブック](https://dogfood-lab.github.io/testing-os/handbook/)** · **[すべてのリポジトリ](https://github.com/orgs/dogfood-lab/repositories)** · **[プロファイル](https://github.com/dogfood-lab)**

*まず食べて、次にリリースする。*

</div
