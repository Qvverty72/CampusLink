import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { loadDigitalPreview, type DigitalPreviewResult } from '../api/elibraryApi';
export function DigitalPreview({ publicationId, fileId, name }: { publicationId: string; fileId: string; name: string }) {
  const [open, setOpen] = useState(false), [result,setResult] = useState<DigitalPreviewResult | null>(null);
  const [loading,setLoading] = useState(false), [error,setError] = useState(false), pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function show() {
    pending.current?.abort(); const abort = new AbortController(); pending.current = abort;
    setOpen(true); setLoading(true); setError(false); setResult(null);
    try { const value = await loadDigitalPreview(publicationId,fileId,abort.signal); if(!abort.signal.aborted)setResult(value); }
    catch { if(!abort.signal.aborted)setError(true); }
    finally { if(!abort.signal.aborted)setLoading(false); }
  }
  return <View style={styles.box}>
    {open ? <>
      <Text style={styles.title}>Vista previa · {name}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Cargando vista previa" /> : error ? <>
        <Text style={styles.body}>No pudimos cargar la muestra. Inténtalo nuevamente.</Text>
        <Pressable accessibilityRole="button" onPress={show} style={styles.button}><Text style={styles.link}>Reintentar muestra</Text></Pressable>
      </> : <><Text style={styles.body}>{result?.message}</Text>{result?.available && <Text selectable style={styles.fragment}>{result.text}…</Text>}</>}
      <Pressable accessibilityRole="button" onPress={() => { pending.current?.abort(); setOpen(false); }} style={styles.button}><Text style={styles.link}>Cerrar muestra</Text></Pressable>
    </> : <Pressable accessibilityRole="button" accessibilityLabel={`Vista previa de ${name}`} onPress={show} style={styles.button}><Text style={styles.link}>Ver muestra limitada · {name}</Text></Pressable>}
  </View>;
}
const styles=StyleSheet.create({box:{gap:8,padding:12,borderRadius:12,backgroundColor:'#F4F7F9'},title:{fontSize:15,fontWeight:'600',color:'#09243A'},body:{fontSize:14,lineHeight:21,color:'#607485'},fragment:{fontSize:16,lineHeight:25,color:'#09243A'},button:{minHeight:44,justifyContent:'center'},link:{fontSize:15,color:APP_COLORS.PRIMARY}});
