import { fotoraAlbumUrl, readLimitedBytes } from './evidenceImages.ts';

type Photo = { bytes: Uint8Array; hash: string; mime: string; extension: string };
export class FotoraUploadError extends Error {
  constructor(public uncertain: boolean) { super('Fotora upload unavailable'); }
}

export async function uploadFotoraAlbum(photos: Photo[]): Promise<{ url: string; expiresAt: string | null }> {
  const cookies = new Map<string, string>();
  const client = Deno.createHttpClient({ http1: true, http2: true, poolMaxIdlePerHost: 1 });
  const signal = AbortSignal.timeout(90_000);
  let started = false;
  const request = async (path: string, form?: FormData, useCookies = true) => {
    const headers: Record<string, string> = {};
    if (useCookies && cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    let body: Uint8Array | undefined;
    if (form) {
      const encoded = new Request('https://fotora.ru/', { method: 'POST', body: form });
      body = new Uint8Array(await encoded.arrayBuffer());
      headers['Content-Type'] = encoded.headers.get('Content-Type')!;
      headers['Content-Length'] = String(body.length);
      started = true;
    }
    const response = await fetch(`https://fotora.ru${path}`, { method: form ? 'POST' : 'GET', headers, body, client, signal, redirect: 'error' });
    for (const value of response.headers.getSetCookie()) {
      const match = /^([A-Za-z_][A-Za-z0-9_-]*)=([^;\r\n]{0,4096})/.exec(value);
      if (match && cookies.size < 8) cookies.set(match[1], match[2]);
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('Fotora HTTP error'); }
    return new TextDecoder().decode(await readLimitedBytes(response.body, 1024 * 1024)).replace(/<!--[\s\S]*?-->/g, '');
  };
  const redirect = (html: string) => /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/.exec(html)?.[1];
  try {
    const home = await request('/');
    if (!/name=["']uploadFiles\[\]["']/.test(home)
      || /class=["'][^"']*(?:cf-turnstile|g-recaptcha|smart-captcha)/.test(home)) throw new Error('Fotora flow changed');
    const files = new FormData();
    for (const photo of photos) files.append('uploadFiles[]', new Blob([photo.bytes], { type: photo.mime }), `screenshot-${photo.hash.slice(0, 16)}.${photo.extension}`);
    const destination = redirect(await request('/', files));
    let path = destination;
    if (/^\/create-album\/?$/.test(destination ?? '')) {
      const draft = await request('/create-album/');
      if (!/id=["']createAlbumForm["']/.test(draft) || (draft.match(/id=["']imageComment["']/g) ?? []).length !== photos.length) throw new Error('Fotora file count mismatch');
      const create = new FormData();
      create.append('albumTitleInput', 'Доказательства к отчёту ГИБДД');
      create.append('allComments', JSON.stringify(photos.map(() => '')));
      create.append('createAlbum', '');
      path = redirect(await request('/create-album/', create));
    } else if (photos.length !== 1) throw new Error('Fotora did not accept files');
    if (!path || !/^\/uploaded\/?\?ID=[A-Za-z0-9]{5,64}$/.test(path)) throw new Error('Fotora did not confirm album');
    const url = fotoraAlbumUrl(`https://fotora.ru${path}`);
    if (!url) throw new Error('Invalid album URL');
    const gallery = await request(new URL(url).pathname + new URL(url).search, undefined, false);
    if ((gallery.match(/class=["']uploaded-image["']/g) ?? []).length !== photos.length) throw new Error('Fotora public gallery mismatch');
    const text = gallery.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const expiry = /Дата\s+удаления:\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
    const date = expiry ? new Date(`${expiry[3]}-${expiry[2]}-${expiry[1]}T00:00:00Z`) : null;
    return { url, expiresAt: date && Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : null };
  } catch { throw new FotoraUploadError(started); }
  finally { cookies.clear(); client.close(); }
}
