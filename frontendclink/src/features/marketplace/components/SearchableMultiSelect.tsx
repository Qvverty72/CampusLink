import {Pressable,Text,View} from 'react-native';
import {X} from 'lucide-react-native';
import {SearchableFilterSelect,type FilterSelectOption} from './SearchableFilterSelect';
import {CATALOG_COLORS as colors,ui} from './CatalogUI';

/** Same debounced picker as filters; multiple IDs remain selected independently. */
export function SearchableMultiSelect({label,options,previous=[],values,onChange,expanded,onExpandedChange,disabled=false,loading=false}:{
 label:string;options:readonly FilterSelectOption[];previous?:readonly FilterSelectOption[];values:string[];onChange:(ids:string[])=>void;
 expanded:boolean;onExpandedChange:(open:boolean)=>void;disabled?:boolean;loading?:boolean;
}){
 const available=new Map([...previous,...options].map(row=>[row.id,row]));
 return <View style={{gap:8}}><SearchableFilterSelect label={label} placeholder={`Agregar ${label.toLowerCase()}`} value="" searchRequired allowEmpty={false}
 options={options.filter(row=>!values.includes(row.id))} optionsLoading={loading} expanded={expanded} onExpandedChange={onExpandedChange} disabled={disabled}
 onChange={id=>{if(id&&!values.includes(id))onChange([...values,id]);}}/>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{values.map(id=><Pressable key={id} accessibilityRole="button" disabled={disabled}
 accessibilityLabel={`Quitar ${available.get(id)?.name??'selección no disponible'}`} onPress={()=>onChange(values.filter(value=>value!==id))}
 style={[ui.outlined,{minHeight:44,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:colors.tint,flexShrink:1}]}>
 <Text style={{color:colors.primary,flexShrink:1}}>{available.get(id)?.name??'Selección no disponible'}{!loading&&!options.some(row=>row.id===id)?' · Ya no disponible':''}</Text><X size={16} color={colors.primary}/>
 </Pressable>)}</View></View>;
}
