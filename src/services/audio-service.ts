/**
 * src/services/audio-service.ts
 * Multi-sensory acoustic feedback service for Kuro Mobile.
 * Synthesizes audio tones (880Hz high beep, double chirp, low buzzer, celebration chime)
 * using Web Audio oscillators on web/testing and expo-av on native platforms.
 */

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

function createWavDataUri(
  frequency: number,
  durationMs: number,
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth' = 'sine',
  volume: number = 0.5
): string {
  const sampleRate = 11025;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = new Uint8Array(44 + numSamples);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      buffer[offset + i] = str.charCodeAt(i);
    }
  };
  const writeUint32 = (offset: number, val: number) => {
    buffer[offset] = val & 0xff;
    buffer[offset + 1] = (val >> 8) & 0xff;
    buffer[offset + 2] = (val >> 16) & 0xff;
    buffer[offset + 3] = (val >> 24) & 0xff;
  };
  const writeUint16 = (offset: number, val: number) => {
    buffer[offset] = val & 0xff;
    buffer[offset + 1] = (val >> 8) & 0xff;
  };

  // RIFF header
  writeString(0, 'RIFF');
  writeUint32(4, 36 + numSamples);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  writeUint32(16, 16);
  writeUint16(20, 1);
  writeUint16(22, 1);
  writeUint32(24, sampleRate);
  writeUint32(28, sampleRate);
  writeUint16(32, 1);
  writeUint16(34, 8);

  // data subchunk
  writeString(36, 'data');
  writeUint32(40, numSamples);

  // Samples
  const angularFreq = 2 * Math.PI * frequency;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fadeOutStart = numSamples * 0.8;
    const fade = i > fadeOutStart ? 1 - (i - fadeOutStart) / (numSamples - fadeOutStart) : 1;
    let sample = 0;

    if (waveform === 'sine') {
      sample = Math.sin(angularFreq * t);
    } else if (waveform === 'square') {
      sample = Math.sin(angularFreq * t) >= 0 ? 1 : -1;
    } else if (waveform === 'triangle') {
      sample = (Math.asin(Math.sin(angularFreq * t)) * 2) / Math.PI;
    } else if (waveform === 'sawtooth') {
      sample = 2 * (t * frequency - Math.floor(t * frequency + 0.5));
    }

    const val = Math.max(0, Math.min(255, Math.floor(128 + sample * 127 * volume * fade)));
    buffer[44 + i] = val;
  }

  return `data:audio/wav;base64,${bytesToBase64(buffer)}`;
}

export class AudioService {
  private static audioContext: any = null;
  private static isMuted = false;
  private static isAudioModeInitialized = false;

  private static successUri = createWavDataUri(880, 100, 'sine', 0.6);
  private static warningUri = createWavDataUri(587, 80, 'triangle', 0.6);
  private static errorUri = createWavDataUri(180, 250, 'sawtooth', 0.6);
  private static celebrationChime1Uri = createWavDataUri(880, 120, 'sine', 0.6);
  private static celebrationChime2Uri = createWavDataUri(1174, 220, 'sine', 0.6);

  private static getWebAudioContext(): any {
    if (typeof window === 'undefined') return null;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioContext) {
      try {
        this.audioContext = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    return this.audioContext;
  }

  /**
   * Synthesizes a tone using Web Audio API oscillator.
   */
  private static playWebTone(
    frequency: number,
    durationMs: number,
    type: 'sine' | 'square' | 'triangle' | 'sawtooth' = 'sine',
    gainVal: number = 0.15
  ): void {
    try {
      const ctx = this.getWebAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // Graceful fallback
    }
  }

  private static isNativePlatform(): boolean {
    try {
      return (
        (Platform?.OS === 'ios' || Platform?.OS === 'android') &&
        process?.env?.NODE_ENV !== 'test'
      );
    } catch {
      return false;
    }
  }

  /**
   * Plays audio on native iOS/Android devices using expo-audio.
   */
  private static async playNativeSound(uri: string): Promise<void> {
    if (!this.isNativePlatform()) return;
    try {
      if (!this.isAudioModeInitialized) {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        }).catch(() => {});
        this.isAudioModeInitialized = true;
      }

      const player = createAudioPlayer({ uri });
      player.volume = 1.0;
      player.play();
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription?.remove?.();
          player.release();
        }
      });
    } catch {
      // Graceful fallback if device audio is disabled or in unit test mock
    }
  }

  /**
   * Plays a high-pitch crisp beep (880Hz, 100ms) for valid scan success.
   */
  public static async playScanSuccess(): Promise<void> {
    if (this.isMuted) return;
    try {
      this.playWebTone(880, 100, 'sine', 0.2);
      if (this.isNativePlatform()) {
        await this.playNativeSound(this.successUri);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Plays a warning double chirp (587Hz -> 587Hz) for duplicate / already completed items.
   */
  public static async playScanWarning(): Promise<void> {
    if (this.isMuted) return;
    try {
      this.playWebTone(587, 80, 'triangle', 0.25);
      setTimeout(() => {
        try {
          this.playWebTone(587, 80, 'triangle', 0.25);
        } catch {}
      }, 100);

      if (this.isNativePlatform()) {
        await this.playNativeSound(this.warningUri);
        setTimeout(() => {
          try {
            this.playNativeSound(this.warningUri).catch(() => {});
          } catch {}
        }, 100);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Plays a low buzzer tone (180Hz - 220Hz, 250ms) for errors or unrecognized barcodes.
   */
  public static async playScanError(): Promise<void> {
    if (this.isMuted) return;
    try {
      this.playWebTone(180, 250, 'sawtooth', 0.2);
      if (this.isNativePlatform()) {
        await this.playNativeSound(this.errorUri);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Plays a celebratory chime (880Hz -> 1174Hz) when a pull sheet reaches 100% completion.
   */
  public static async playCelebrationChime(): Promise<void> {
    if (this.isMuted) return;
    try {
      this.playWebTone(880, 120, 'sine', 0.2);
      setTimeout(() => {
        try {
          this.playWebTone(1174, 200, 'sine', 0.25);
        } catch {}
      }, 120);

      if (this.isNativePlatform()) {
        await this.playNativeSound(this.celebrationChime1Uri);
        setTimeout(() => {
          try {
            this.playNativeSound(this.celebrationChime2Uri).catch(() => {});
          } catch {}
        }, 120);
      }
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Mute or unmute audio feedback.
   */
  public static setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public static isAudioMuted(): boolean {
    return this.isMuted;
  }
}

export default AudioService;
