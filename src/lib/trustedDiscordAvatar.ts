// The editable user_metadata avatar URL must not cause tracking requests to
// arbitrary third-party domains. Discord avatars are delivered from these CDNs.
const avatarHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

export function trustedDiscordAvatar(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !avatarHosts.has(url.hostname) ||
        url.port || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
