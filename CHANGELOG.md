# Changelog

All notable changes to `testing-os` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial monorepo scaffold (npm workspaces, tsc --build, vitest, single CI workflow).
- MIT LICENSE, SECURITY.md, README.

### Migration
- This repo is the successor to [`mcp-tool-shop-org/dogfood-labs`](https://github.com/mcp-tool-shop-org/dogfood-labs). Tooling there will be folded into `packages/*` here over the coming waves; the npm scope `@dogfood-labs/*` is retired in favor of `@dogfood-lab/*`.
