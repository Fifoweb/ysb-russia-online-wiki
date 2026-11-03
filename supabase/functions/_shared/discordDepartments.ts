// Membership roles supplied by the server owner. Notification roles are unrelated.
export const discordDepartmentRoles = {
  sdb: '1540267058233876530',
  dps: '1538937566156300355',
  ugk: '1540267814651166812',
  mb: '1542230244293873805',
  udk: '1540267554684280852',
  uor: '1540267392742072320',
  uku: '1540267213578043434',
  ovk: '1540267656370716693',
} as const;

export type DiscordDepartment = keyof typeof discordDepartmentRoles;
export type DepartmentResult = {
  department: DiscordDepartment | '';
  status: 'verified' | 'none' | 'not_member' | 'multiple' | 'unavailable';
};

export function departmentFromRoles(roles: readonly string[]): DepartmentResult {
  const matches = (Object.keys(discordDepartmentRoles) as DiscordDepartment[])
    .filter(department => roles.includes(discordDepartmentRoles[department]));
  return matches.length === 1 ? { department: matches[0], status: 'verified' }
    : { department: '', status: matches.length ? 'multiple' : 'none' };
}

export class DepartmentLookupError extends Error {
  constructor(public retryAfter = 0) { super('Discord department lookup unavailable'); }
}

const snowflake = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value);

export function createDepartmentLookup(fetcher: typeof fetch = fetch) {
  let guildCache: { key: string; id: string; until: number } | undefined;
  async function get(path: string, token: string) {
    const response = await fetcher('https://discord.com/api/v10' + path, {
      headers: { Authorization: `Bot ${token}` }, redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404 && path.includes('/members/')) return null;
    if (!response.ok) {
      const retry = response.status === 429 ? Math.min(300, Math.max(15, Math.ceil(Number(response.headers.get('Retry-After')) || 60))) : 0;
      throw new DepartmentLookupError(retry);
    }
    // Never log provider bodies, member details, URLs with credentials, or tokens.
    const reader = response.body?.getReader();
    if (!reader) throw new DepartmentLookupError();
    let text = ''; let bytes = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_048_576) { await reader.cancel(); throw new DepartmentLookupError(); }
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally { reader.releaseLock(); }
  }

  async function resolveGuild(token: string, channelId?: string, guildId?: string) {
    const key = guildId || channelId;
    if (!snowflake(key)) throw new DepartmentLookupError();
    if (guildCache?.key === key && guildCache.until > Date.now()) return guildCache.id;
    const id = guildId || (await get(`/channels/${channelId}`, token))?.guild_id;
    if (!snowflake(id)) throw new DepartmentLookupError();
    const roles = await get(`/guilds/${id}/roles`, token);
    if (!Array.isArray(roles) || !Object.values(discordDepartmentRoles).every(roleId => roles.some(role => role?.id === roleId))) {
      throw new DepartmentLookupError();
    }
    guildCache = { key, id, until: Date.now() + 300_000 };
    return id;
  }

  return {
    resolveGuild,
    async lookup(discordId: string, token: string, channelId?: string, guildId?: string): Promise<DepartmentResult> {
      if (!snowflake(discordId) || !token) throw new DepartmentLookupError();
      const id = await resolveGuild(token, channelId, guildId);
      const member = await get(`/guilds/${id}/members/${discordId}`, token);
      if (member === null) return { department: '', status: 'not_member' };
      if (member?.user?.id !== discordId || !Array.isArray(member.roles) || !member.roles.every(snowflake)) throw new DepartmentLookupError();
      return departmentFromRoles(member.roles);
    },
  };
}
