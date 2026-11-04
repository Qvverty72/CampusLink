import { useState, type ReactNode } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { ArrowLeft, ArrowRight, Eye, EyeOff, RotateCw, type LucideIcon } from 'lucide-react-native';
import { AUTH_COLORS, authStyles as styles } from './form.styles';
import { useAuthFormScroll } from '../hooks/useAuthFormScroll';

export function AuthScaffold({ children, back = false, stepKey = 'form' }: { children: ReactNode; back?: boolean; stepKey?: string }) {
  const insets = useSafeAreaInsets();
  const scroll = useAuthFormScroll(stepKey);
  return <View style={[styles.page, {
    paddingTop: safeAreaInset('top', insets.top),
    paddingBottom: safeAreaInset('bottom', insets.bottom),
    paddingLeft: safeAreaInset('left', insets.left),
    paddingRight: safeAreaInset('right', insets.right),
  }]}>
    <StatusBar barStyle="dark-content" />
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={[styles.container, Platform.OS === 'web' && styles.centeredContainer]}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">
        <View style={styles.shell}>
          <View style={styles.brandRow}>
            <View><Text style={styles.brand}>CampusLink</Text><Text style={styles.brandCaption}>Tu comunidad universitaria</Text></View>
          </View>
          {back && <Link href="/login" asChild><Pressable accessibilityRole="link" accessibilityLabel="Volver al inicio de sesión" style={styles.back}>
            <ArrowLeft size={18} color={AUTH_COLORS.PRIMARY} /><Text style={styles.link}>Volver al inicio de sesión</Text>
          </Pressable></Link>}
          <View key={stepKey} style={styles.card}>{children}</View>
        </View>
      </ScrollView>
  </View>;
}

export function AuthHeading({ title, description, icon: Icon }: { title: string; description?: ReactNode; icon?: LucideIcon }) {
  return <View style={styles.heading}>
    {Icon && <View style={styles.headingIcon}><Icon size={23} color={AUTH_COLORS.PRIMARY} /></View>}
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {description && <Text style={styles.description}>{description}</Text>}
  </View>;
}

export function AuthInput({ label, icon: Icon, password = false, code = false, ...props }: TextInputProps & { label: string; icon: LucideIcon; password?: boolean; code?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const editable = props.editable !== false;
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputFrame, focused && styles.inputFocused]}>
      <Icon size={18} color={AUTH_COLORS.SECONDARY} />
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor={AUTH_COLORS.muted}
        autoCapitalize={props.autoCapitalize ?? 'none'} autoCorrect={props.autoCorrect ?? false}
        secureTextEntry={password && !visible} style={[styles.input, code && styles.codeInput, props.style]}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }} />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
        accessibilityState={{ disabled: !editable }} aria-pressed={visible} disabled={!editable}
        onPress={() => setVisible(value => !value)} style={styles.iconButton}>
        {visible ? <EyeOff size={20} color={AUTH_COLORS.SECONDARY} /> : <Eye size={20} color={AUTH_COLORS.SECONDARY} />}
      </Pressable>}
    </View>
  </View>;
}

export function AuthButton({ children, onPress, disabled = false, busy = false }: { children: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    activeOpacity={0.75} style={[styles.button, (disabled || busy) && styles.disabled]}>
    {busy && <ActivityIndicator size="small" color="#FFFFFF" accessibilityLabel="Procesando" />}
    <Text style={styles.buttonText}>{children}</Text>{!busy && <ArrowRight size={18} color="#FFFFFF" />}
  </TouchableOpacity>;
}

export function AuthMessage({ children, error = false }: { children?: ReactNode; error?: boolean }) {
  if (!children) return null;
  return <View style={[styles.message, error && styles.errorMessage]}>
    <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={error ? styles.error : styles.messageText}>{children}</Text>
  </View>;
}

export function ResendCodeButton({ seconds, busy, onPress }: { seconds: number; busy: boolean; onPress: () => void }) {
  const disabled = busy || seconds > 0;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.secondaryButton, disabled && styles.disabled]}>
    <RotateCw size={17} color={AUTH_COLORS.PRIMARY} />
    <Text style={styles.secondaryText}>{seconds > 0 ? `Reenviar código en ${seconds} s` : 'Reenviar código'}</Text>
  </Pressable>;
}
