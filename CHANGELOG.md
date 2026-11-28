# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-28

- Repair clean-install dependency locking and use Node.js 24 in CI.
- Create missing pricing-cache directories without changing cache reuse or refresh deduplication.
- Update GitHub Actions (checkout, setup-node v7), OpenCode plugin development dependencies (1.19.6 / 2.4.1), Vitest and Node types.
- Widen OpenCode peer ranges to tested releases (`>=1.18.29 <1.20.0`, `>=2.4.1 <3.0.0`).
- Verify the V2 local entrypoint by loading and running it instead of asserting a filename.

## [0.1.0] - 2026-09-13

- Add dynamic OpenLux pricing for configured OpenCode models.
- Add timeout handling and persistent stale-cache fallback.
- Add npm package and GitHub release publishing metadata.
