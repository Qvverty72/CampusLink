import {useState} from 'react';
import {Text,View} from 'react-native';
import type {DigitalAcademicCatalog,DigitalAcademicOption} from '../types/publication';
import {SearchableMultiSelect} from '../../components/SearchableMultiSelect';
import {RequestButton} from '../../components/RequestsUI';
import {ui} from '../../components/CatalogUI';
interface Props {
 catalog:DigitalAcademicCatalog|null;loading:boolean;error:string|null;reload:()=>void;
 careerIds:string[];subjectIds:string[];onCareersChange:(ids:string[])=>void;onSubjectsChange:(ids:string[])=>void;disabled:boolean;
 previous?:{careers:DigitalAcademicOption[];subjects:DigitalAcademicOption[]};
}
export function DigitalAcademicSelector(props:Props){
 const [openField,setOpenField]=useState<'careers'|'subjects'|null>(null);
 return <View style={{gap:12}}><Text style={ui.subtitle}>Puedes elegir varias carreras y asignaturas de tu institución. Cada selección es independiente.</Text>
 {props.error&&<>
 <Text accessibilityRole="alert" style={ui.subtitle}>{props.error}</Text><RequestButton label="Reintentar catálogo" disabled={props.disabled} onPress={props.reload}/>
 </>}
 <SearchableMultiSelect label="Carreras" options={props.catalog?.careers??[]} loading={props.loading} values={props.careerIds} onChange={props.onCareersChange} previous={props.previous?.careers}
 expanded={openField==='careers'} onExpandedChange={open=>setOpenField(open?'careers':null)} disabled={props.disabled}/>
 <SearchableMultiSelect label="Asignaturas" options={props.catalog?.subjects??[]} loading={props.loading} values={props.subjectIds} onChange={props.onSubjectsChange} previous={props.previous?.subjects}
 expanded={openField==='subjects'} onExpandedChange={open=>setOpenField(open?'subjects':null)} disabled={props.disabled}/>
 </View>;
}
