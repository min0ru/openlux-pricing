# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Repair clean-install dependency locking and use Node.js 24 in CI.
- Create missing pricing-cache directories without changing cache reuse or refresh deduplication.

## [0.1.0] - 2026-09-13

- Add dynamic OpenLux pricing for configured OpenCode models.
- Add timeout handling and persistent stale-cache fallback.
- Add npm package and GitHub release publishing metadata.
