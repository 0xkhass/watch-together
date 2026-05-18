export type VideoProvider =
  | 'direct'
  | 'youtube'
  | 'vimeo'
  | 'twitch'
  | 'dailymotion'
  | 'streamable'
  | 'gdrive'
  | 'embed';

export interface ParsedVideoSource {
  provider: VideoProvider;
  url: string;
  embedUrl: string;
  videoId?: string;
  name: string;
  type: 'url' | 'local';
}

const DIRECT_EXT = /\.(mp4|webm|ogg|m3u8|mov|mkv|avi|flv|ts)([\?#]|$)/i;

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube') || u.hostname === 'youtu.be') return 'YouTube Video';
    if (u.hostname.includes('vimeo')) return 'Vimeo Video';
    if (u.hostname.includes('twitch')) return 'Twitch Video';
    if (u.hostname.includes('dailymotion')) return 'Dailymotion Video';
    if (u.hostname.includes('streamable')) return 'Streamable Video';
    if (u.hostname.includes('drive.google')) return 'Google Drive Video';
    // Try to get filename from path
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && DIRECT_EXT.test(last)) {
      return decodeURIComponent(last.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Video';
  }
}

function parseYouTube(raw: string): { videoId: string } | null {
  try {
    const u = new URL(raw);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? { videoId: id } : null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        return id ? { videoId: id } : null;
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        return id ? { videoId: id } : null;
      }
      if (u.pathname.startsWith('/live/')) {
        const id = u.pathname.split('/')[2];
        return id ? { videoId: id } : null;
      }
      const v = u.searchParams.get('v');
      return v ? { videoId: v } : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseVimeo(raw: string): { videoId: string } | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('vimeo.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ? { videoId: id } : null;
  } catch {
    return null;
  }
}

function parseTwitch(raw: string): { videoId: string; embedUrl: string } | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('twitch.tv')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'videos' && parts[1]) {
      const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return {
        videoId: parts[1],
        embedUrl: `https://player.twitch.tv/?video=${parts[1]}&parent=${parent}&autoplay=false`,
      };
    }
    if (parts[0] && parts[1] === 'clip' && parts[2]) {
      const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return {
        videoId: parts[2],
        embedUrl: `https://clips.twitch.tv/embed?clip=${parts[2]}&parent=${parent}`,
      };
    }
    // Live channel
    if (parts[0] && !['videos', 'clip', 'directory'].includes(parts[0])) {
      const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return {
        videoId: parts[0],
        embedUrl: `https://player.twitch.tv/?channel=${parts[0]}&parent=${parent}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseDailymotion(raw: string): { videoId: string } | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('dailymotion.com')) return null;
    const m = u.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    return m ? { videoId: m[1] } : null;
  } catch {
    return null;
  }
}

function parseStreamable(raw: string): { videoId: string } | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('streamable.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    // streamable.com/xyz123
    if (parts.length === 1 && parts[0].length > 2) {
      return { videoId: parts[0] };
    }
  } catch {
    return null;
  }
  return null;
}

function parseGoogleDrive(raw: string): { videoId: string; directUrl: string } | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.includes('drive.google.com')) return null;
    // drive.google.com/file/d/FILE_ID/view
    const match = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return {
        videoId: match[1],
        directUrl: `https://drive.google.com/uc?export=download&id=${match[1]}`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Parse any video URL into a playback source (direct file or embed). */
export function parseVideoUrl(input: string, customName?: string): ParsedVideoSource | null {
  const raw = input.trim();
  if (!raw || raw.toLowerCase().startsWith('blob:')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const name = customName?.trim() || titleFromUrl(raw);

  // YouTube
  const yt = parseYouTube(raw);
  if (yt) {
    return {
      provider: 'youtube',
      url: raw,
      embedUrl: `https://www.youtube.com/embed/${yt.videoId}?enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`,
      videoId: yt.videoId,
      name: name === titleFromUrl(raw) ? `YouTube · ${yt.videoId}` : name,
      type: 'url',
    };
  }

  // Vimeo
  const vimeo = parseVimeo(raw);
  if (vimeo) {
    return {
      provider: 'vimeo',
      url: raw,
      embedUrl: `https://player.vimeo.com/video/${vimeo.videoId}`,
      videoId: vimeo.videoId,
      name: name === titleFromUrl(raw) ? `Vimeo · ${vimeo.videoId}` : name,
      type: 'url',
    };
  }

  // Twitch
  const twitch = parseTwitch(raw);
  if (twitch) {
    return {
      provider: 'twitch',
      url: raw,
      embedUrl: twitch.embedUrl,
      videoId: twitch.videoId,
      name,
      type: 'url',
    };
  }

  // Dailymotion
  const dm = parseDailymotion(raw);
  if (dm) {
    return {
      provider: 'dailymotion',
      url: raw,
      embedUrl: `https://www.dailymotion.com/embed/video/${dm.videoId}`,
      videoId: dm.videoId,
      name,
      type: 'url',
    };
  }

  // Streamable
  const streamable = parseStreamable(raw);
  if (streamable) {
    return {
      provider: 'streamable',
      url: raw,
      embedUrl: `https://streamable.com/e/${streamable.videoId}`,
      videoId: streamable.videoId,
      name,
      type: 'url',
    };
  }

  // Google Drive
  const gdrive = parseGoogleDrive(raw);
  if (gdrive) {
    return {
      provider: 'gdrive',
      url: gdrive.directUrl,
      embedUrl: gdrive.directUrl,
      videoId: gdrive.videoId,
      name,
      type: 'url',
    };
  }

  // Direct video file (mp4, webm, ogg, m3u8, etc.)
  if (DIRECT_EXT.test(url.pathname) || url.pathname.includes('/uploads/')) {
    return {
      provider: 'direct',
      url: raw,
      embedUrl: raw,
      name,
      type: 'url',
    };
  }

  // Common video CDN patterns
  if (
    url.hostname.includes('cdn') ||
    url.hostname.includes('media') ||
    url.hostname.includes('stream') ||
    url.hostname.includes('storage') ||
    url.hostname.includes('blob.core') ||
    url.hostname.includes('s3.amazonaws') ||
    url.hostname.includes('cloudfront') ||
    url.hostname.includes('commondatastorage')
  ) {
    return {
      provider: 'direct',
      url: raw,
      embedUrl: raw,
      name,
      type: 'url',
    };
  }

  // Generic page embed (many sites block iframes — user will see an error in-player)
  return {
    provider: 'embed',
    url: raw,
    embedUrl: raw,
    name,
    type: 'url',
  };
}

export function isEmbedProvider(provider: VideoProvider): boolean {
  return provider !== 'direct' && provider !== 'gdrive';
}

export function providerLabel(provider: VideoProvider): string {
  const labels: Record<VideoProvider, string> = {
    direct: 'Direct video',
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    twitch: 'Twitch',
    dailymotion: 'Dailymotion',
    streamable: 'Streamable',
    gdrive: 'Google Drive',
    embed: 'Web embed',
  };
  return labels[provider];
}
