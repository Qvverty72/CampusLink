import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { accessLabels } from '../types/access';
import type { AuditDetail } from '../types/audit';
import { auditPublicationFields, auditPublicationOwner, auditPublicationPrice, publicationLabels, publicationText, type AuditSide } from '../utils/auditPublicationPresentation';
import { AuditPublicationImages } from './AuditPublicationImages';
import { auditColors as colors } from './audit.styles';

type Props = { entry:AuditDetail; side?:AuditSide; renderValue:(value:unknown,path:string)=>ReactNode };
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('es-CL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : null;

/** Misma ficha en creación, retirada y cada estado de edición; datos de contenido siempre del snapshot. */
export function AuditPublicationDetails({ entry,side,renderValue }: Props) {
  const fields = auditPublicationFields(entry,side), field = (key:string)=>fields.find(item=>item.key===key);
  const value = (key:string)=>field(key)?.value;
  if (!fields.length) return <View style={styles.card}><Text style={styles.muted}>Sin datos históricos disponibles para esta publicación.</Text></View>;
  const ownerId = publicationText(value('propietario_id')), owner = auditPublicationOwner(entry,ownerId);
  const reference = entry.references?.[field('propietario_id')?.path ?? ''];
  const ownerName = owner?.profile?.fullName ?? (reference?.id === ownerId && reference.kind === 'user' && reference.source !== 'unavailable' ? reference.name : null);
  const price = auditPublicationPrice(value('precio'),value('modalidad'),value('moneda'));
  const images = Array.isArray(value('images')) ? value('images') as unknown[] : [];
  const retired = !!publicationText(value('deleted_at'));
  const initials = ownerName?.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('es-CL') ?? '?';
  const show = (key:string,fallback='No registrado') => {
    const item = field(key);
    return item && item.value !== null && item.value !== undefined ? renderValue(item.value,item.path) : <Text style={styles.muted}>{fallback}</Text>;
  };
  return <View style={styles.stack}>
    {value('tipo_recurso') !== 'DIGITAL' && <AuditPublicationImages value={images} mode="preview" />}
    <View style={styles.card}>
      <View style={styles.badges}>
        {retired && <Badge label="Retirada" tone="retired" />}
        {['estado_publicacion','modalidad','estado_uso','tipo_recurso'].map(key=>{
          const label=publicationText(value(key));return label && !(retired&&key==='estado_publicacion') ? <Badge key={key} label={publicationLabels[label] ?? label} tone={key==='estado_publicacion'&&label==='DISPONIBLE'?'available':undefined} /> : null;
        })}
      </View>
      <Text selectable accessibilityRole="header" style={styles.title}>{publicationText(value('titulo')) ?? 'Título no registrado'}</Text>
      <View style={styles.priceRow}><Text selectable style={styles.price}>{price.label}</Text>{price.currency && <Text style={styles.currency}>{price.currency}</Text>}</View>
      {price.raw !== null && <Text selectable style={styles.raw}>Valor registrado: {price.raw}</Text>}
      <View style={styles.field}><Text style={styles.label}>ID DE LA PUBLICACIÓN</Text><Text selectable style={styles.raw}>ID: {publicationText(value('id')) ?? (!field('id') ? entry.entidad_id : 'No registrado')}</Text></View>
    </View>

    <View style={styles.card}>
      <View style={styles.person}>
        <View style={styles.avatar} accessible={false} aria-hidden><Text style={styles.initials}>{initials}</Text></View>
        <View style={styles.personCopy}><Text style={styles.label}>PROPIETARIO</Text><Text selectable style={styles.value}>{ownerName ?? 'Nombre no disponible'}</Text><Text selectable style={styles.raw}>ID: {ownerId ?? 'No registrado'}</Text></View>
      </View>
      <View style={styles.field}><Text style={styles.label}>CORREO REGISTRADO</Text><Text selectable style={styles.value}>{owner?.profile?.email ?? 'Correo no disponible'}</Text></View>
      <View style={styles.field}><Text style={styles.label}>{owner?.profile?.careers.length === 1 ? 'CARRERA REGISTRADA' : 'CARRERAS REGISTRADAS'}</Text>
        {owner?.profile?.careers.length ? owner.profile.careers.map(career=><View key={career.id} style={styles.field}><Text selectable style={styles.value}>{career.name}</Text><Text selectable style={styles.raw}>ID: {career.id}</Text></View>)
          : <Text style={styles.muted}>{owner?.profile ? 'Sin carreras registradas' : 'Carreras no disponibles'}</Text>}
      </View>
      <Text style={styles.note}>Correo y carreras del perfil registrado al consultar.</Text>
      <View style={styles.field}><Text style={styles.label}>ROLES DEL USUARIO</Text><Text style={styles.note}>Al momento de la acción</Text>
        {owner?.assignments?.source === 'assignment_history'
          ? owner.assignments.roles.length ? <View style={styles.badges}>{owner.assignments.roles.map(role=><View key={role} style={[styles.badge,role==='ADMINISTRADOR'&&styles.adminRole]}>
            <Text selectable style={[styles.badgeText,role==='ADMINISTRADOR'&&styles.adminText]}>{accessLabels[role] ?? role}</Text>
          </View>)}</View> : <Text style={styles.muted}>Sin roles asignados</Text>
          : <Text style={styles.muted}>Información histórica de roles no disponible</Text>}
      </View>
      <View style={styles.field}><Text style={styles.label}>PERMISOS DEL USUARIO</Text><Text style={styles.note}>Al momento de la acción</Text>
        {owner?.assignments?.source === 'assignment_history'
          ? owner.assignments.permissions.length ? <View style={styles.badges}>{owner.assignments.permissions.map(permission=><View key={permission} style={styles.permission}>
            <View accessible={false} aria-hidden><Check size={12} color="#286B49" /></View><Text style={styles.permissionText}>{accessLabels[permission] ?? permission}</Text>
          </View>)}</View> : <Text style={styles.muted}>Sin permisos específicos asignados</Text>
          : <Text style={styles.muted}>Información histórica de permisos no disponible</Text>}
      </View>
    </View>

    <View style={styles.card}><Text style={styles.label}>DESCRIPCIÓN DE LA PUBLICACIÓN</Text><Text selectable style={styles.value}>{publicationText(value('descripcion')) ?? 'Sin descripción registrada'}</Text></View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>CLASIFICACIÓN Y ORIGEN</Text>
      {value('tipo_recurso') !== 'DIGITAL' && <View style={styles.field}><Text style={styles.label}>CATEGORÍA</Text>{show('categoria_id','Categoría no registrada')}</View>}
      <View style={styles.field}><Text style={styles.label}>CAMPUS</Text>{show('campus_id','Campus no registrado')}</View>
      {field('institucion_id') && <View style={styles.field}><Text style={styles.label}>INSTITUCIÓN</Text>{show('institucion_id')}</View>}
      {field('careers') && <View style={styles.field}><Text style={styles.label}>CARRERAS DEL RECURSO</Text>{show('careers')}</View>}
      {field('subjects') && <View style={styles.field}><Text style={styles.label}>ASIGNATURAS DEL RECURSO</Text>{show('subjects')}</View>}
    </View>
    {value('tipo_recurso') !== 'DIGITAL' && <View style={styles.card}><Text accessibilityRole="header" style={styles.label}>ARCHIVOS DE IMAGEN</Text><AuditPublicationImages value={images} mode="metadata" /></View>}
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>REGISTRO</Text>
      <View style={styles.columns}><RegisteredDate title="ACTUALIZADO EN" value={value('updated_at')} /><RegisteredDate title="RETIRADO EN" value={value('deleted_at')} empty={field('deleted_at')?.value === null ? 'Sin retirar' : undefined} /></View>
      {retired && publicationText(value('estado_publicacion')) && <View style={styles.field}><Text style={styles.label}>ESTADO CONSERVADO AL RETIRAR</Text><Text style={styles.value}>{publicationLabels[String(value('estado_publicacion'))] ?? String(value('estado_publicacion'))}</Text></View>}
    </View>
    {!side && !!entry.justificacion_accion && <View style={styles.card}><Text style={styles.label}>FUNDAMENTO DE LA ACCIÓN</Text><Text selectable style={styles.value}>{entry.justificacion_accion}</Text></View>}
  </View>;
}

function Badge({label,tone}:{label:string;tone?:'available'|'retired'}) {
  return <View style={[styles.badge,tone==='available'&&styles.available,tone==='retired'&&styles.retired]}><Text style={styles.badgeText}>{label}</Text></View>;
}
function RegisteredDate({title,value,empty='No registrado'}:{title:string;value:unknown;empty?:string}) {
  return <View style={styles.column}><Text style={styles.label}>{title}</Text><Text selectable style={styles.value}>{date(value) ?? empty}</Text>{typeof value==='string'&&<Text selectable style={styles.raw}>{value}</Text>}</View>;
}

/** Valores del desplegable Original/Nuevo mantienen formato humano y valor exacto. */
export function AuditPublicationChangeValue({entry,value,path,renderValue}:{entry:AuditDetail;value:unknown;path:string;renderValue:Props['renderValue']}) {
  const [side,key]=path.split('.') as [AuditSide,string];
  if (key==='precio' && value!==null) {
    const price=auditPublicationPrice(value,'VENTA',entry[side]?.moneda);
    return <View style={styles.field}><Text selectable style={styles.value}>{price.label}{price.currency ? ` ${price.currency}` : ''}</Text><Text selectable style={styles.raw}>Valor registrado: {price.raw}</Text></View>;
  }
  if (typeof value==='string'&&['estado_publicacion','modalidad','estado_uso','tipo_recurso'].includes(key))return <Badge label={publicationLabels[value]??value} />;
  if (typeof value==='string'&&['updated_at','deleted_at'].includes(key))return <RegisteredDate title="FECHA REGISTRADA" value={value} />;
  return renderValue(value,path);
}

const styles=StyleSheet.create({
  stack:{gap:12},card:{padding:16,gap:13,borderRadius:16,borderWidth:1,borderColor:'#DDE6EF',backgroundColor:colors.surface,minWidth:0},
  badges:{flexDirection:'row',flexWrap:'wrap',gap:6},badge:{alignSelf:'flex-start',maxWidth:'100%',paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:colors.soft},
  available:{backgroundColor:'#E1F3EA'},retired:{backgroundColor:'#FFF0E8'},badgeText:{color:colors.PRIMARY,fontSize:10,lineHeight:16,fontWeight:'600',flexShrink:1},
  adminRole:{backgroundColor:'#0B2E50'},adminText:{color:'#FFFFFF'},
  title:{color:colors.PRIMARY,fontSize:18,lineHeight:25,fontWeight:'700'},priceRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:5},
  price:{color:colors.PRIMARY,fontSize:24,lineHeight:30,fontWeight:'700'},currency:{color:colors.PRIMARY,fontSize:11,lineHeight:17,fontWeight:'600'},
  raw:{color:colors.SECONDARY,fontSize:10,lineHeight:16},label:{color:colors.PRIMARY,fontSize:10,lineHeight:16,letterSpacing:0.4,fontWeight:'600'},
  value:{color:colors.PRIMARY,fontSize:13,lineHeight:20,flexShrink:1},muted:{color:colors.muted,fontSize:12,lineHeight:19},note:{color:colors.muted,fontSize:10,lineHeight:16},
  field:{gap:4,minWidth:0},person:{flexDirection:'row',alignItems:'center',gap:10},personCopy:{flex:1,minWidth:0,gap:3},
  avatar:{width:34,height:34,borderRadius:17,backgroundColor:colors.soft,alignItems:'center',justifyContent:'center'},initials:{color:colors.PRIMARY,fontSize:12,fontWeight:'700'},
  permission:{maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:5,backgroundColor:'#E5F3EB',borderRadius:14},
  permissionText:{color:colors.PRIMARY,fontSize:10,lineHeight:16,flexShrink:1},columns:{flexDirection:'row',gap:12},column:{flex:1,minWidth:0,gap:4},
});
