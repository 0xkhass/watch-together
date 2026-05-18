import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { EVENTS, VoiceUser } from '../types';

interface RTCPeerState {
  pc: RTCPeerConnection;
  userId: string;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isPolite: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function useWebRTC(socket: Socket, userId: string) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState<Map<string, VoiceUser>>(new Map());
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerState>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const isDeafenedRef = useRef(false);
  isDeafenedRef.current = isDeafened;

  // ── Create peer connection ──────────────────────────────────────────────────

  const createPeer = useCallback((targetUserId: string, isPolite: boolean): RTCPeerState => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const state: RTCPeerState = { pc, userId: targetUserId, makingOffer: false, ignoreOffer: false, isPolite };

    // Add local tracks
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit(EVENTS.RTC_ICE, { targetUserId, candidate: candidate.toJSON() });
      }
    };

    // Remote stream
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;

      // Create audio element for this peer
      let audio = audioElementsRef.current.get(targetUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElementsRef.current.set(targetUserId, audio);
      }
      audio.srcObject = stream;
      audio.volume = isDeafenedRef.current ? 0 : 1;

      setVoiceUsers(prev => {
        const next = new Map(prev);
        const existing = next.get(targetUserId);
        if (existing) next.set(targetUserId, { ...existing, stream, isMuted: false });
        return next;
      });
    };

    pc.onnegotiationneeded = async () => {
      try {
        state.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit(EVENTS.RTC_OFFER, { targetUserId, offer: pc.localDescription });
      } catch (err) {
        console.error('[WebRTC] Negotiation error:', err);
      } finally {
        state.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(targetUserId);
      }
    };

    peersRef.current.set(targetUserId, state);
    return state;
  }, [socket]);

  const removePeer = useCallback((targetUserId: string) => {
    const state = peersRef.current.get(targetUserId);
    if (state) {
      state.pc.close();
      peersRef.current.delete(targetUserId);
    }
    const audio = audioElementsRef.current.get(targetUserId);
    if (audio) {
      audio.srcObject = null;
      audioElementsRef.current.delete(targetUserId);
    }
    setVoiceUsers(prev => {
      const next = new Map(prev);
      next.delete(targetUserId);
      return next;
    });
  }, []);

  // ── Join voice chat ────────────────────────────────────────────────────────

  const joinVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setIsInVoice(true);

      // Setup speaking detection
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      speakingIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeakingUsers(prev => {
          const next = new Set(prev);
          if (avg > 10) next.add(userId);
          else next.delete(userId);
          return next;
        });
      }, 100);

      // Notify others
      socket.emit(EVENTS.RTC_USER_JOINED_VOICE);

    } catch (err) {
      console.error('[WebRTC] Failed to get microphone:', err);
      throw err;
    }
  }, [socket, userId]);

  // ── Leave voice chat ───────────────────────────────────────────────────────

  const leaveVoice = useCallback(() => {
    // Stop local stream
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Close all peers
    for (const [uid] of peersRef.current) {
      removePeer(uid);
    }

    // Clear speaking detection
    clearInterval(speakingIntervalRef.current);
    analyserRef.current = null;

    setIsInVoice(false);
    setVoiceUsers(new Map());
    setSpeakingUsers(new Set());

    socket.emit(EVENTS.RTC_USER_LEFT_VOICE);
  }, [socket, removePeer]);

  // ── Toggle mute ────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
      socket.emit(EVENTS.MEMBER_UPDATED, { isMuted: !track.enabled });
    }
  }, [socket]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      for (const audio of audioElementsRef.current.values()) {
        audio.volume = next ? 0 : 1;
      }
      return next;
    });
  }, []);

  const setPeerVolume = useCallback((targetUserId: string, volume: number) => {
    const audio = audioElementsRef.current.get(targetUserId);
    if (audio && !isDeafened) audio.volume = Math.max(0, Math.min(1, volume));
  }, [isDeafened]);

  // ── Socket event handlers ──────────────────────────────────────────────────

  useEffect(() => {
    // Another user joined voice
    const onUserJoinedVoice = (data: { userId: string; username: string }) => {
      if (data.userId === userId) return;

      setVoiceUsers(prev => {
        const next = new Map(prev);
        next.set(data.userId, { userId: data.userId, username: data.username, isSpeaking: false, isMuted: false });
        return next;
      });

      // If we're in voice, initiate connection (we are the polite peer)
      if (isInVoice) {
        createPeer(data.userId, true);
      }
    };

    // Another user left voice
    const onUserLeftVoice = (data: { userId: string }) => {
      removePeer(data.userId);
    };

    // Receive offer
    const onOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      let state = peersRef.current.get(data.fromUserId);
      if (!state) {
        state = createPeer(data.fromUserId, true); // We're polite when receiving offer
      }

      const { pc, makingOffer, isPolite } = state;
      const offerCollision = makingOffer || pc.signalingState !== 'stable';

      state.ignoreOffer = !isPolite && offerCollision;
      if (state.ignoreOffer) return;

      try {
        await pc.setRemoteDescription(data.offer);
        await pc.setLocalDescription();
        socket.emit(EVENTS.RTC_ANSWER, { targetUserId: data.fromUserId, answer: pc.localDescription });
      } catch (err) {
        console.error('[WebRTC] Offer handling error:', err);
      }
    };

    // Receive answer
    const onAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const state = peersRef.current.get(data.fromUserId);
      if (!state) return;
      try {
        await state.pc.setRemoteDescription(data.answer);
      } catch (err) {
        console.error('[WebRTC] Answer handling error:', err);
      }
    };

    // Receive ICE candidate
    const onIce = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const state = peersRef.current.get(data.fromUserId);
      if (!state) return;
      try {
        await state.pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!state.ignoreOffer) {
          console.error('[WebRTC] ICE error:', err);
        }
      }
    };

    socket.on(EVENTS.RTC_USER_JOINED_VOICE, onUserJoinedVoice);
    socket.on(EVENTS.RTC_USER_LEFT_VOICE, onUserLeftVoice);
    socket.on(EVENTS.RTC_OFFER, onOffer);
    socket.on(EVENTS.RTC_ANSWER, onAnswer);
    socket.on(EVENTS.RTC_ICE, onIce);

    return () => {
      socket.off(EVENTS.RTC_USER_JOINED_VOICE, onUserJoinedVoice);
      socket.off(EVENTS.RTC_USER_LEFT_VOICE, onUserLeftVoice);
      socket.off(EVENTS.RTC_OFFER, onOffer);
      socket.off(EVENTS.RTC_ANSWER, onAnswer);
      socket.off(EVENTS.RTC_ICE, onIce);
    };
  }, [socket, userId, isInVoice, createPeer, removePeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInVoice) leaveVoice();
    };
  }, []); // eslint-disable-line

  return {
    isInVoice,
    isMuted,
    isDeafened,
    voiceUsers,
    speakingUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    setPeerVolume,
  };
}