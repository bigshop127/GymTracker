import { create } from 'zustand';
import { useSettingsStore } from './settings';

interface RestTimerState {
  targetTime: number | null;
  duration: number;
  remainingSeconds: number;
  isActive: boolean;

  startTimer: (seconds: number) => void;
  adjustTimer: (seconds: number) => void;
  skipTimer: () => void;
  tick: () => void;
}

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const WebkitAudioContext = (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new (window.AudioContext || WebkitAudioContext)();
  }
  return sharedAudioContext;
}

export function unlockAudioContext() {
  const audioCtx = getSharedAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch((err) => {
      console.warn('Failed to resume AudioContext:', err);
    });
  }
}

// Auto unlock on first user interaction anywhere
if (typeof window !== 'undefined') {
  const handleUserInteraction = () => {
    unlockAudioContext();
    const audioCtx = getSharedAudioContext();
    if (audioCtx && audioCtx.state === 'running') {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    }
  };
  window.addEventListener('click', handleUserInteraction);
  window.addEventListener('touchstart', handleUserInteraction);
}

export function playRestEndSound() {
  try {
    const audioCtx = getSharedAudioContext();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = 880; // A5 音高，清脆醒目
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.6, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.8);
  } catch (e) {
    console.error('Failed to play beep sound:', e);
  }
}

function triggerVibration() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

export const useRestTimerStore = create<RestTimerState>((set, get) => ({
  targetTime: null,
  duration: 0,
  remainingSeconds: 0,
  isActive: false,

  startTimer: (seconds: number) => {
    if (seconds <= 0) return;
    const target = Date.now() + seconds * 1000;
    set({
      targetTime: target,
      duration: seconds,
      remainingSeconds: seconds,
      isActive: true,
    });
  },

  adjustTimer: (seconds: number) => {
    const { targetTime, duration, isActive } = get();
    if (!isActive || !targetTime) return;

    const newTarget = targetTime + seconds * 1000;
    const newDuration = Math.max(0, duration + seconds);

    set({
      targetTime: newTarget,
      duration: newDuration,
      remainingSeconds: Math.max(0, Math.ceil((newTarget - Date.now()) / 1000)),
    });
  },

  skipTimer: () => {
    set({
      targetTime: null,
      duration: 0,
      remainingSeconds: 0,
      isActive: false,
    });
  },

  tick: () => {
    const { targetTime, isActive } = get();
    if (!isActive || !targetTime) return;

    const diff = targetTime - Date.now();
    if (diff <= 0) {
      // 倒數結束，執行通知與重設
      const settings = useSettingsStore.getState().settings;
      
      if (settings?.soundOnRestEnd) {
        playRestEndSound();
      }
      if (settings?.vibrateOnRestEnd) {
        triggerVibration();
      }

      set({
        targetTime: null,
        duration: 0,
        remainingSeconds: 0,
        isActive: false,
      });
    } else {
      set({
        remainingSeconds: Math.ceil(diff / 1000),
      });
    }
  },
}));
