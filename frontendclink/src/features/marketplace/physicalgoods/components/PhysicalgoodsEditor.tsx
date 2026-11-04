import {useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import type {useEditPhysicalgoods} from '../hooks/useEditPhysicalgoods';
import {resourceConditions} from '../types/publication';
import {PublicationSection,PublicationModality,PublicationFeedback,PublicationSubmit,publicationUI as f} from '../../components/PublicationFormUI';
import {SearchableFilterSelect} from '../../components/SearchableFilterSelect';
import {RequestButton} from '../../components/RequestsUI';

/** Formulario de contenido; fotografías/categoría conservan operaciones independientes. */
export function PhysicalgoodsEditor({edit,disabled,busy,onSave,onCancel}:{edit:ReturnType<typeof useEditPhysicalgoods>;disabled:boolean;busy:boolean;onSave:()=>void;onCancel:()=>void}){
 const [conditionOpen,setConditionOpen]=useState(false);
 const {draft,setDraft}=edit;
 if(!draft)return null;
 return <View style={f.form}>
  <PublicationSection number="1" title="Datos del recurso">
   <View style={f.field}><Text style={f.label}>Nombre del recurso *</Text><TextInput accessibilityLabel="Editar nombre del recurso" value={draft.title} editable={!disabled} onChangeText={title=>setDraft({...draft,title})} maxLength={200} style={f.input}/></View>
   <View style={f.field}><Text style={f.label}>Descripción *</Text><TextInput accessibilityLabel="Editar descripción del recurso" value={draft.description} editable={!disabled} onChangeText={description=>setDraft({...draft,description})} maxLength={4000} multiline style={[f.input,f.textarea]}/></View>
   <SearchableFilterSelect label="Condición *" searchable={false} options={resourceConditions.map(row=>({id:row.value,name:row.label}))} value={draft.condition} onChange={condition=>setDraft({...draft,condition:condition as typeof draft.condition})} expanded={conditionOpen} onExpandedChange={setConditionOpen} disabled={disabled} allowEmpty={false}/>
  </PublicationSection>
  <PublicationSection number="2" title="Modalidad y precio">
   <PublicationModality value={draft.modality} disabled={disabled} onChange={modality=>setDraft({...draft,modality,price:modality==='DONACION'?'':draft.price})}/>
   {draft.modality==='VENTA'&&<View style={f.field}><Text style={f.label}>Precio de venta (CLP) *</Text><TextInput accessibilityLabel="Editar precio de venta (CLP)" value={draft.price} editable={!disabled} onChangeText={price=>setDraft({...draft,price})} inputMode="decimal" maxLength={20} style={f.input}/></View>}
  </PublicationSection>
  <Text style={f.hint}>Los cambios no modifican las condiciones de transacciones ya acordadas.</Text>
  <PublicationFeedback error={edit.error}/>
  <PublicationSubmit label={busy?'Guardando cambios…':'Guardar cambios'} busy={busy} disabled={disabled} onPress={onSave}/>
  <RequestButton label="Cancelar edición" onPress={onCancel} disabled={busy}/>
 </View>;
}
