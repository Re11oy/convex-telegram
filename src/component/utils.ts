type TelegramBotUsername = string & { __isBotUsername: true };

export function normalizeUsername(username: string | TelegramBotUsername) {
  if (username.startsWith("@")) {
    return username as TelegramBotUsername;
  }

  return `@${username}` as TelegramBotUsername;
}
