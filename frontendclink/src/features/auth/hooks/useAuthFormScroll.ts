import { useCallback, useRef } from 'react';
import { Keyboard, type ScrollViewInstance } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Mantiene el scroll nativo vivo mientras iOS restaura sus insets del teclado. */
export function useAuthFormScroll(stepKey: string) {
  const scroll = useRef<ScrollViewInstance>(null);
  const previousStep = useRef(stepKey);
  const pendingReset = useRef<ReturnType<typeof Keyboard.addListener> | null>(null);
  const cancelReset = useCallback(() => {
    pendingReset.current?.remove();
    pendingReset.current = null;
  }, []);
  const reset = useCallback(() => {
    cancelReset();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [cancelReset]);

  useFocusEffect(useCallback(() => {
    if (previousStep.current !== stepKey) {
      previousStep.current = stepKey;
      if (Keyboard.isVisible()) {
        // Esperar al evento real evita competir con la animación/insets nativos.
        pendingReset.current = Keyboard.addListener('keyboardDidHide', reset);
        Keyboard.dismiss();
      } else {
        reset();
      }
    }
    return () => {
      cancelReset();
      Keyboard.dismiss();
    };
  }, [stepKey, cancelReset, reset]));

  return scroll;
}
