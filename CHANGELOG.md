# Changelog

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
