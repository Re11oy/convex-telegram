function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * Hex output keeps the secret within Telegram's allowed `secret_token` charset.
 * @see https://core.telegram.org/bots/api#setwebhook (`secret_token`)
 */
export function generateSecret(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function normalizeUsername(username: string): string {
  return `@${username.trim().replace(/^@+/, "")}`;
}
