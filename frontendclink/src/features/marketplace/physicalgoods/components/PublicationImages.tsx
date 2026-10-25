import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {Star,Trash2} from 'lucide-react-native';
import type { PublicationPhoto } from '../types/publication';
import { CATALOG_COLORS as c } from '../../components/CatalogUI';

export function PublicationImages({ photos, disabled, onRemove, onPrincipal,principalIndex=0,removeDisabled=false }: {
  photos: readonly Pick<PublicationPhoto,'uri'>[]; disabled: boolean; onRemove: (index: number) => void; onPrincipal?: (index: number) => void;principalIndex?:number;removeDisabled?:boolean;
}) {
  if(!photos.length)return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={photos.length>1} style={styles.scroll} contentContainerStyle={styles.list} accessibilityLabel="Imágenes seleccionadas" keyboardShouldPersistTaps="handled">{photos.map((photo, index) => {
    const principal=Boolean(onPrincipal)&&index===principalIndex;
    return <View key={`${photo.uri}:${index}`} style={[styles.item,principal&&styles.principal]}>
      <View style={styles.preview}>
        <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Vista previa de imagen ${index + 1}${principal?', portada':''}`} />
        <View pointerEvents="none" accessible={false} aria-hidden style={styles.badges}><View style={styles.number}><Text style={styles.numberText}>{index+1}</Text></View>{principal&&<View style={styles.cover}><Text style={styles.coverText}>Portada</Text></View>}</View>
      </View>
      <View style={styles.actions}>
        {onPrincipal&&<Pressable accessibilityRole="button" accessibilityLabel={principal?`Imagen ${index+1}, portada actual`:`Usar imagen ${index+1} como principal`} accessibilityState={{selected:principal,disabled:disabled||principal}} disabled={disabled||principal} style={[styles.button,principal&&styles.selectedButton,disabled&&styles.disabled]} onPress={()=>{if(!disabled&&!principal)onPrincipal(index);}}>
          <Star size={17} color={c.primary} fill={principal?c.primary:'transparent'} aria-hidden/>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar imagen ${index+1}`} accessibilityState={{disabled:disabled||removeDisabled}} disabled={disabled||removeDisabled} style={[styles.button,styles.removeButton,(disabled||removeDisabled)&&styles.disabled]} onPress={()=>{if(!disabled&&!removeDisabled)onRemove(index);}}>
          <Trash2 size={17} color="#AD3029" aria-hidden/>
        </Pressable>
      </View>
    </View>;
  })}</ScrollView>;
}
const styles = StyleSheet.create({
  scroll:{flexGrow:0},list:{gap:8,padding:2},item:{width:112,borderColor:c.border,borderWidth:1,padding:6,borderRadius:12,gap:6,backgroundColor:c.surface},principal:{borderColor:c.primary},
  preview:{height:90,borderRadius:8,overflow:'hidden',backgroundColor:c.background},image:{height:'100%',width:'100%',resizeMode:'contain'},badges:{position:'absolute',top:5,left:5,right:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4},
  number:{width:22,height:22,borderRadius:7,backgroundColor:c.primary,alignItems:'center',justifyContent:'center'},numberText:{color:c.surface,fontSize:11,fontWeight:'700'},cover:{paddingHorizontal:5,paddingVertical:3,borderRadius:6,backgroundColor:c.surface},coverText:{color:c.primary,fontSize:9,lineHeight:13,fontWeight:'700'},
  actions:{flexDirection:'row',gap:4},button:{flex:1,minWidth:44,height:44,borderRadius:9,backgroundColor:c.background,alignItems:'center',justifyContent:'center'},selectedButton:{backgroundColor:c.tint},removeButton:{backgroundColor:'#FFF4F2'},disabled:{opacity:0.45},
});
