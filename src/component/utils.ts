import type { TelegramBotUsername } from "../client/types";

export function makeWebhookSecretToken() {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const values = new Uint8Array(48);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

export function normalizeUsername(username: string | TelegramBotUsername) {
  if (username.startsWith("@")) {
    return username as TelegramBotUsername;
  }

  return `@${username}` as TelegramBotUsername;
}
