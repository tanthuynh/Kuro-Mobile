/**
 * src/services/haptic-service.ts
 * Multi-sensory tactile vibration feedback service for Kuro Mobile.
 * Wraps expo-haptics with safe web and platform fallbacks.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export class HapticService {
  private static isAvailable(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }

  /**
   * Fires a success notification haptic pulse.
   */
  public static async scanSuccess(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Graceful fallback if device lacks haptic motor
    }
  }

  /**
   * Fires a warning notification haptic pulse (duplicate / already completed).
   */
  public static async scanWarning(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Fires an error notification haptic pulse (not on pull sheet / unknown code).
   */
  public static async scanError(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Fires a celebration feedback pattern when a pull sheet is 100% prepped.
   */
  public static async scanCelebration(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(async () => {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignored
        }
      }, 150);
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Fires a light tactile impact for general button taps and toggles.
   */
  public static async lightTap(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Fires a medium tactile impact for status advancement.
   */
  public static async mediumTap(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Graceful fallback
    }
  }
}

export default HapticService;
