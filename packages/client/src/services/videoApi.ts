import { SERVER_URL } from './socket';

export interface UploadVideoResult {
  url: string;
  name: string;
  type: 'url';
}

export async function uploadVideo(
  file: File,
  roomCode: string,
  userId: string,
  onProgress?: (percent: number) => void,
): Promise<UploadVideoResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('roomCode', roomCode);
  formData.append('userId', userId);

  console.log('[VideoApi] Uploading', {
    name: file.name,
    sizeMB: (file.size / (1024 * 1024)).toFixed(2),
    roomCode,
  });

  // Use XHR for upload progress; fetch has limited progress support
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SERVER_URL}/api/video/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[VideoApi] Upload success', {
            url: body.url?.slice(0, 80),
            name: body.name,
          });
          resolve(body as UploadVideoResult);
        } else {
          console.error('[VideoApi] Upload failed', { status: xhr.status, body });
          reject(new Error(body.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid server response'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
