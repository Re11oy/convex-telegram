# Changelog

## [0.1.2](https://github.com/Re11oy/convex-telegram/compare/v0.1.1...v0.1.2) (2026-09-30)


### Bug Fixes

* **component:** regenerate code for convex 1.45 ([#26](https://github.com/Re11oy/convex-telegram/issues/26)) ([8bb3e76](https://github.com/Re11oy/convex-telegram/commit/8bb3e765bba499105c59fdf6e571ce0bff8768eb))
* ship @gramio/types as a dependency ([#24](https://github.com/Re11oy/convex-telegram/issues/24)) ([74059e0](https://github.com/Re11oy/convex-telegram/commit/74059e024e81c97242d85e93729aac225d6829fe))

## 0.1.1

Client and webhook revamp.

### Breaking

- Renamed the `Telegram` class to `TelegramBot`.
- `registerRoutes` is now a standalone export instead of a method.
- Webhook secrets are now mandatory: `setupWebhook` generates one if unset and stores its SHA-256 hash. Webhook requests are rejected unless the `X-Telegram-Bot-Api-Secret-Token` header matches.

### Added

- Webhook management with persisted settings.
- Typed environment-variable handling for bot configuration.

## 0.1.0

- Initial release.
