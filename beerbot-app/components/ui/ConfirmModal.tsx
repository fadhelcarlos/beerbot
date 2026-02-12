import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Modal } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AlertTriangle } from 'lucide-react-native';
import { colors, typography, radius, spacing, shadows } from '@/lib/theme';
import GoldButton from './GoldButton';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.backdropFill} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(300)}
          exiting={SlideOutDown.duration(200)}
          style={styles.cardWrapper}
        >
          <Pressable
            style={[
              styles.card,
              destructive && styles.cardDestructive,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {destructive && (
              <View style={styles.iconRow}>
                <View style={styles.iconCircle}>
                  <AlertTriangle size={20} color={colors.status.danger} strokeWidth={2.5} />
                </View>
              </View>
            )}

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.actions}>
              <GoldButton
                label={cancelLabel}
                onPress={onCancel}
                variant="ghost"
                style={styles.actionButton}
              />
              <GoldButton
                label={confirmLabel}
                onPress={onConfirm}
                variant={destructive ? 'danger' : 'primary'}
                style={styles.actionButton}
              />
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardWrapper: {
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.glass.border,
    padding: 24,
    alignItems: 'center',
    ...shadows.elevated,
  },
  cardDestructive: {
    borderColor: 'rgba(248,113,113,0.12)',
  },
  iconRow: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.status.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  actionButton: {
    flex: 1,
  },
});
