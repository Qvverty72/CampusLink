import {withPostgresTransaction} from '../../../database/supabase/postgres.js';
import {ApiError} from '../../../services/api-response.js';
import {parsePaginationQuery} from '../../../services/pagination.js';
import type {VerifiedAuthConnection} from '../../auth/auth.types.js';
import {authorizeDigitalAccess,currentDigitalContext} from './elibrary.service.js';
import {digitalAction,digitalTradeDto} from './elibrary.trades.service.js';
import {digitalId} from './elibrary.validation.js';
import {activityCounts,activityRequests,activityResources,activityTradeCounts,activityTrades} from './elibrary.activity.repository.js';
import {findDigitalPublications,findOwnedDigitalActivity} from './elibrary.repository.js';
import {findOwnerRatings} from '../marketplace.ratings.repository.js';

export async function getDigitalActivity(auth:VerifiedAuthConnection,raw:unknown,kind:'counts'|'requests'|'resources'|'transactions'|'publications'|'resource',rawId?:unknown){
 authorizeDigitalAccess(auth);
 const allowed=kind==='requests'?['page','limit','received','resourceId','order']:kind==='transactions'||kind==='publications'?['page','limit','tab']:kind==='resources'?['page','limit']:[];
 const query=digitalAction(raw,allowed),parsed=parsePaginationQuery({page:query.page,limit:query.limit});
 if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','Revisa la paginación.');
 const page=parsed.data;
 if(query.received!==undefined&&(typeof query.received!=='string'||!['true','false'].includes(query.received)))throw new ApiError(400,'VALIDATION_ERROR','Revisa la bandeja.');
 if(query.order!==undefined&&(typeof query.order!=='string'||!['oldest','newest'].includes(query.order)))throw new ApiError(400,'VALIDATION_ERROR','Revisa el orden.');
 const tabs=kind==='transactions'?['active','finished']:['all','active','inactive'];
 if(query.tab!==undefined&&(typeof query.tab!=='string'||!tabs.includes(query.tab)))throw new ApiError(400,'VALIDATION_ERROR','Revisa el filtro.');
 const resourceId=query.resourceId===undefined?null:digitalId(query.resourceId),id=rawId===undefined?null:digitalId(rawId);
 try{return await withPostgresTransaction(async client=>{
   const {current,campus}=await currentDigitalContext(client,auth),institutionId=campus.institucion_id;
   const wrap=<T>(data:T[],total:number,extra={})=>({data,meta:{page:page.page,limit:page.limit,hasMore:page.offset+data.length<total,total,...extra}});
   if(kind==='counts')return activityCounts(client,institutionId,current.userId);
   if(kind==='requests'){
     const result=await activityRequests(client,institutionId,current.userId,query.received==='true',page,resourceId,query.order==='oldest'?'oldest':'newest');
     const ratings=await findOwnerRatings(client,query.received==='true'?result.rows.map(row=>row.requesterId):[],{resourceType:'DIGITAL',institutionId});
     return wrap(result.rows.map(row=>({...row,...ratings.get(row.requesterId),requestedAt:new Date(row.requestedAt).toISOString(),publishedAt:new Date(row.publishedAt).toISOString()})),result.total);
   }
   if(kind==='resources'){const result=await activityResources(client,institutionId,current.userId,page);return wrap(result.rows,result.total);}
   if(kind==='transactions'){
     const tab=query.tab==='finished'?'finished':'active',counts=await activityTradeCounts(client,institutionId,current.userId);
     const rows=await activityTrades(client,institutionId,current.userId,page,tab),data=[];
     for(const row of rows)data.push(await digitalTradeDto(client,row.resource,current,row));
     return wrap(data,counts[tab],{counts});
   }
   const filters={...page,q:'',careerId:null,subjectId:null,modality:null};
   const rows=await findDigitalPublications(client,institutionId,id,filters,current.userId,kind==='resource'?'participant':'owned',null,String(query.tab??'all'),true);
   if(kind==='resource'){if(!rows[0])throw new ApiError(404,'NOT_FOUND','No se encontró un recurso autorizado.');return rows[0];}
   const data=rows.slice(0,page.limit),stats=new Map((await findOwnedDigitalActivity(client,institutionId,current.userId,data.map(row=>row.id))).map(row=>[row.id,row]));
   return {data:data.map(row=>({...row,activity:stats.get(row.id)})),meta:{page:page.page,limit:page.limit,hasMore:rows.length>page.limit}};
 });}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'DEPENDENCY_UNAVAILABLE','No se pudo cargar tu actividad digital.');}
}
