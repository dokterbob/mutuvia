# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-05-29

### Added

- **Reusable payment QR codes** — create a permanent QR code on the Receive screen; each scan starts a new transaction. Supports pause and archive states, and shows a live payment count to the merchant. ([#115](https://github.com/dokterbob/mutuvia/pull/115))

### Changed

- QR accept URLs now use short UUIDs instead of signed JWTs — significantly smaller, less-dense, easier-to-scan QR codes. Removes the `QR_JWT_SECRET` env var requirement. ([#114](https://github.com/dokterbob/mutuvia/pull/114))

### Fixed

- Sentry server-side error capture no longer crashes on Bun — switched server SDK init to `@sentry/bun`, which excludes Node.js-incompatible integrations. ([#117](https://github.com/dokterbob/mutuvia/pull/117))

## [0.2.0] - 2026-05-04

### Added

- **Credential management** — add or change email and phone number directly from the Settings page with inline OTP verification. ([#106](https://github.com/dokterbob/mutuvia/pull/106))
- **Spanish language support** — full `es` locale with translation key validation wired into `bun run lint`. ([#105](https://github.com/dokterbob/mutuvia/pull/105))
- **What's new dialog** — shown automatically on first app load after a version update; skipped for new installs and repeat visits. ([#108](https://github.com/dokterbob/mutuvia/pull/108))
- OG meta tags and PWA manifest screenshots for a richer browser install UI. ([#104](https://github.com/dokterbob/mutuvia/pull/104), [#107](https://github.com/dokterbob/mutuvia/pull/107))

### Changed

- Replaced the immediate-cancel X on pending transaction rows with a chevron navigation affordance; added a confirmation dialog before cancelling on the QR screens. ([#101](https://github.com/dokterbob/mutuvia/pull/101))

### Fixed

- Auth endpoints (phone OTP, email OTP, session management) now work on custom domains — removed `baseURL` from Better Auth config so the origin is always derived from the incoming request. ([#110](https://github.com/dokterbob/mutuvia/pull/110))
- Route protection moved to `hooks.server.ts` to prevent null `appUser` crashes; SvelteKit runs layout and page loads in parallel so the layout redirect alone was not sufficient. ([#102](https://github.com/dokterbob/mutuvia/pull/102))

## [0.1.0] - 2026-04-10

Initial release.
