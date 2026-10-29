// Gjenkjenner YouTube- og Vimeo-lenker for innebygd avspilling.

export type Video =
  | { kind: 'youtube'; id: string; start: number | null; embed: string; thumb: string }
  | { kind: 'vimeo'; id: string; embed: string }
  | { kind: 'lenke'; url: string };

function seconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null;
}

export function parseVideo(raw: string): Video {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { kind: 'lenke', url: raw };
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let ytId: string | null = null;
  if (host === 'youtu.be') ytId = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') ytId = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|live|shorts|v)\/([^/?#]+)/);
      ytId = m?.[1] ?? null;
    }
  }
  if (ytId && /^[\w-]{6,}$/.test(ytId)) {
    const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
    return {
      kind: 'youtube',
      id: ytId,
      start,
      embed: `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1${start ? `&start=${start}` : ''}`,
      thumb: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
    };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/\/(?:video\/)?(\d+)(?:\/([\da-f]+))?/);
    if (m) {
      const hash = m[2] ? `&h=${m[2]}` : '';
      return { kind: 'vimeo', id: m[1], embed: `https://player.vimeo.com/video/${m[1]}?autoplay=1${hash}` };
    }
  }
  return { kind: 'lenke', url: u.toString() };
}

export const opptakTyper: Record<string, string> = {
  'hel kamp': 'Hel kamp',
  høydepunkter: 'Høydepunkter',
  annet: 'Annet',
};
