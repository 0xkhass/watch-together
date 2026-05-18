import { VideoState, VideoProvider } from '../types';
import { parseVideoUrl, ParsedVideoSource } from './videoSource';

export function playbackFromRoomVideo(video: VideoState | undefined): ParsedVideoSource | null {
  if (!video?.url) return null;

  if (video.provider && video.embedUrl) {
    return {
      provider: (video.provider as VideoProvider) || 'embed',
      url: video.url,
      embedUrl: video.embedUrl,
      videoId: video.embedId,
      name: video.name || 'Video',
      type: video.type === 'local' ? 'url' : video.type,
    };
  }

  return parseVideoUrl(video.url, video.name ?? undefined);
}
