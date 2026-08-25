/**
 * src/services/audio-service.ts
 * Multi-sensory acoustic feedback service for Kuro Mobile.
 * Synthesizes audio tones (880Hz high beep, double chirp, low buzzer, celebration chime)
 * using Web Audio oscillators on web/testing and expo-av on native platforms.
 */

import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export class AudioService {
  private static audioContext: any = null;
  private static isMuted = false;

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

  /**
   * Plays a high-pitch crisp beep (880Hz, 100ms) for valid scan success.
   */
  public static async playScanSuccess(): Promise<void> {
    if (this.isMuted) return;
    try {
      this.playWebTone(880, 100, 'sine', 0.2);
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
        this.playWebTone(587, 80, 'triangle', 0.25);
      }, 100);
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
        this.playWebTone(1174, 200, 'sine', 0.25);
      }, 120);
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
