import {StyleSheet,Text,View} from 'react-native';
import {CATALOG_COLORS as colors} from '../../components/CatalogUI';
import type {PhysicalgoodsReceivedRequest,PhysicalgoodsTerms} from '../types/publication';
import {physicalgoodsRequestTerms,physicalgoodsTermsLabel,samePhysicalgoodsTerms} from '../utils/requestTerms';

export function PhysicalgoodsOriginalPrice({original,current,compact=false,currentLabel='Precio actual',previousLabel='Precio anterior'}:{original?:PhysicalgoodsTerms|null;current:PhysicalgoodsTerms;compact?:boolean;currentLabel?:string;previousLabel?:string}) {
  const changed=original&&!samePhysicalgoodsTerms(original,current);
  const value=physicalgoodsTermsLabel(current),previous=changed?physicalgoodsTermsLabel(original):null;
  return <View style={styles.priceBlock}><View accessible accessibilityLabel={`${currentLabel}: ${value}${previous?`. ${previousLabel}: ${previous}`:''}`} style={styles.prices}>
    <Text style={[styles.current,compact&&styles.currentCompact]}>{value}</Text>
    {previous&&<Text style={[styles.previous,compact&&styles.previousCompact]}>{previous}</Text>}
  </View></View>;
}
/** Presentación vigente/acordada con el antecedente al solicitar, sin alterar los términos persistidos. */
export function PhysicalgoodsRequestPrices({request,showSelected=false,compact=false}:{request:PhysicalgoodsReceivedRequest;showSelected?:boolean;compact?:boolean}) {
  const {current,requested,agreed}=physicalgoodsRequestTerms(request),displayed=agreed??current;
  if(!showSelected&&samePhysicalgoodsTerms(requested,displayed))return null;
  return <View style={styles.history}>
    <PhysicalgoodsOriginalPrice current={displayed} original={requested} compact={compact} currentLabel={agreed?'Monto acordado':'Precio actual'} previousLabel="Precio al solicitar"/>
    {!compact&&request.requestedTerms===null&&<Text style={styles.label}>Precio al solicitar no disponible en el historial.</Text>}
  </View>;
}
const styles=StyleSheet.create({
  priceBlock:{gap:2},
  prices:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:7,rowGap:2,flexShrink:1},
  current:{color:colors.primary,fontSize:22,lineHeight:28,fontWeight:'800'},
  previous:{color:colors.muted,fontSize:15,lineHeight:22,textDecorationLine:'line-through',fontWeight:'400'},
  currentCompact:{fontSize:14,lineHeight:21,fontWeight:'700'},previousCompact:{fontSize:12,lineHeight:19},
  history:{gap:4},label:{color:colors.secondary,fontSize:12,lineHeight:18},
});
