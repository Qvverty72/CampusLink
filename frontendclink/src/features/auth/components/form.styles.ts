import { StyleSheet } from 'react-native';

export const authStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#071A2B' },
  container: { padding: 28, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  brand: { color: '#74C69D', fontSize: 20, fontWeight: '700', marginTop: 12 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 8 },
  description: { color: '#B9CAD6', fontSize: 15, lineHeight: 23 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: { color: '#FFFFFF', borderWidth: 1, borderColor: '#486476', borderRadius: 12, padding: 14, minHeight: 52, fontSize: 16 },
  button: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#09243A', fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  link: { color: '#74C69D', fontSize: 15, paddingVertical: 8 },
  error: { color: '#FFB4AB', fontSize: 15, lineHeight: 23 },
});
