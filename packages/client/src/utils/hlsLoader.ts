/**
 * Lazy HLS.js loader — only imported when an .m3u8 source is detected.
 * Safari supports HLS natively; for other browsers, hls.js is dynamically loaded from CDN.
 */

let hlsPromise: Promise<any> | null = null;

/** Returns true if the browser can play HLS natively (Safari, iOS). */
export function supportsHlsNatively(): boolean {
  const video = document.createElement('video');
  return !!video.canPlayType('application/vnd.apple.mpegurl');
}

/** Returns true if the URL looks like an HLS stream. */
export function isHlsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return url.toLowerCase().includes('.m3u8');
  }
}

/**
 * Dynamically loads hls.js from CDN.
 * The library is cached after first load.
 */
async function loadHls(): Promise<any> {
  if (hlsPromise) return hlsPromise;

  hlsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-hls]');
    if (existing && (window as any).Hls) {
      resolve({ default: (window as any).Hls } as any);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.dataset.hls = 'true';
    script.onload = () => resolve({ default: (window as any).Hls } as any);
    script.onerror = () => {
      hlsPromise = null;
      reject(new Error('Failed to load hls.js'));
    };
    document.head.appendChild(script);
  });

  return hlsPromise;
}

/**
 * Attach HLS streaming to a <video> element.
 * Returns a cleanup function that destroys the HLS instance.
 * On Safari/iOS, the native player handles HLS — we just set the src directly.
 */
export async function attachHls(
  video: HTMLVideoElement,
  url: string,
): Promise<() => void> {
  // Safari/iOS handles HLS natively
  if (supportsHlsNatively()) {
    video.src = url;
    video.load();
    return () => {};
  }

  const { default: Hls } = await loadHls();

  if (!Hls.isSupported()) {
    // Last resort: try setting src directly (some browsers might still work)
    video.src = url;
    video.load();
    return () => {};
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });

  hls.loadSource(url);
  hls.attachMedia(video);

  hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          console.warn('[HLS] Network error, trying to recover...');
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          console.warn('[HLS] Media error, trying to recover...');
          hls.recoverMediaError();
          break;
        default:
          console.error('[HLS] Fatal error:', data);
          hls.destroy();
          break;
      }
    }
  });

  return () => {
    hls.destroy();
  };
}
