import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = path.join(project, 'src');
const native = require('react-native-web');
const noop = () => {};
const catalog = { careers: [{ id: 'career', name: 'Ingeniería en Informática', code: 'INF' }], subjects: [{ id: 'subject', name: 'Cálculo integral', code: 'MAT', careerIds: ['career'] }] };
const physicalRows = ['Calculadora científica', 'Cálculo de una variable', 'Set de dibujo técnico', 'Cuaderno de laboratorio', 'Álgebra lineal', 'Regla de arquitectura'].map((title, index) => ({
  id: `physical-${index}`, title, condition: index % 2 ? 'USADO' : 'BUEN_ESTADO', category: { id: 'books', name: 'Material académico' },
  modality: index === 2 || index === 3 ? 'DONACION' : 'VENTA', price: index === 2 || index === 3 ? null : [12000, 8500, 0, 0, 6500, 3500][index], imageUrl: null,
}));
const digitalRows = ['Guía de cálculo integral', 'Resumen de bases de datos', 'Apuntes de programación', 'Ejercicios de álgebra lineal'].map((title, index) => ({
  id: `digital-${index}`, title, description: 'Material académico de prueba', modality: index % 2 ? 'DONACION' : 'VENTA', price: index % 2 ? null : 2500,
  campusName: 'Campus de prueba', files: [{ id: 'file', name: 'guia.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }],
  careers: catalog.careers, subjects: index === 1 ? [{ id: 'database', name: 'Bases de datos' }] : catalog.subjects,
  acquired: index === 1, ownerId: 'other', careerIds: ['career'], subjectIds: ['subject'], status: 'DISPONIBLE', isWithdrawn: false,
}));

/** Render aislado de las pantallas reales con datos sintéticos. Nunca conecta a APIs o sesiones. */
export function renderCatalog(screen, { width = 390, state = 'ready', mode = 'catalog', variant = 'available', refreshing = false, filterQuery = '', agreementTab = 'active', agreementPanel = 'overview', inlinePanel = null, transactionState = state, ratingScore = 4, submitting = null, rechecking = false, ratingSent = false, agreementPage = 1, transactionCounts = null, sentScenario = null, sentOpen = null, sentResource = null, receivedScenario = null, receivedOpen = null, receivedResource = false } = {}) {
  const physical = screen === 'physical';
  const detailMode = mode === 'detail' || mode === 'request';
  const mocks = new Map();
  const add = (file, value) => mocks.set(path.join(sourceRoot, file), value);
  const nil = () => null;
  add('features/auth/hooks/useAuth.ts', { useAuth: () => ({ status: 'ready', identity: { userId: 'qa', campusId: 'qa', capabilities: { general: true } } }) });
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsResources.ts', { usePhysicalgoodsResources: () => ({
    filters: { q: state === 'empty' ? 'sin coincidencias' : '', categoryId: '', modality: '', condition: '', careerId: '', subjectId: '', minPrice: '', maxPrice: '', mine: false },
    options: { ...catalog, categories: [{ id: 'books', name: 'Libros' }] }, page: { data: state === 'empty' ? [] : physicalRows, meta: { page: 1, hasMore: true } },
    loading: state === 'loading', error: state === 'error' ? 'No se pudo conectar. Inténtalo nuevamente.' : null, number: 1, selectedId: detailMode ? 'physical-0' : null,
    galleryLoading: state === 'loading', galleryError: state === 'error' ? 'No se pudo cargar el detalle.' : null,
    gallery: state === 'loading' || state === 'error' ? null : { ...physicalRows[0], status: variant === 'reserved' ? 'RESERVADO' : 'DISPONIBLE', acceptsRequests: variant !== 'reserved',
      description: 'Calculadora en buen estado, ideal para tus clases de ciencias e ingeniería. Incluye su cubierta protectora.', images: [], campus: { id: 'qa', name: 'Campus de prueba' }, owner: { id: variant === 'own' ? 'qa' : 'owner', fullName: 'Camila González' } },
    reloadGallery: noop, close: noop,
    search: noop, reload: noop, refresh: noop, clearFilters: noop, setFilter: noop, setNumber: noop, open: noop,
  }) });
  add('features/marketplace/physicalgoods/hooks/useRequestPhysicalgoods.ts', { useRequestPhysicalgoods: () => ({
    eligible: variant !== 'own', loading: false, busy: false, options: { canRequest: variant === 'available', messages: [{ code: 'INTERES', label: 'Me interesa este recurso para mis estudios.' }, { code: 'SOLICITAR', label: 'Quisiera solicitarlo.' }, { code: 'CONSULTAR', label: 'Me gustaría acordar la entrega.' }], activeRequest: variant === 'active' ? { id: 'request', status: 'PENDIENTE' } : null },
    reload: noop, setMessageCode: noop, messageCode: 'INTERES', send: async () => {},
  }) });
  add('features/marketplace/physicalgoods/hooks/usePublishPhysicalgoods.ts', { usePublishPhysicalgoods: () => ({ loading: true }) });
  for (const [file, names] of [
    ['physicalgoods/components/PhysicalgoodsHistory.tsx', ['PhysicalgoodsHistory', 'PhysicalgoodsHistoryDetail']],
    ['physicalgoods/components/PhysicalgoodsRequests.tsx', ['PhysicalgoodsRequests']],
    ['physicalgoods/components/PhysicalgoodsTransaction.tsx', ['PhysicalgoodsTransaction']],
    ['physicalgoods/components/PhysicalgoodsRequest.tsx', ['PhysicalgoodsRequest']],
    ['physicalgoods/components/PhysicalgoodsEditor.tsx', ['PhysicalgoodsEditor']],
    ['elibrary/components/DigitalAcademicSelector.tsx', ['DigitalAcademicSelector']],
    ['elibrary/components/DigitalPublicationEditor.tsx', ['DigitalPublicationEditor']],
    ['elibrary/components/DigitalPersonalLibrary.tsx', ['DigitalPersonalLibrary']],
    ['elibrary/components/DigitalTradeCenter.tsx', ['DigitalRequestAction']],
  ]) add('features/marketplace/' + file, Object.fromEntries(names.map(name => [name, nil])));
  add('features/reports/components/ContentReportForm.tsx', { ContentReportForm: nil });
  if (mode !== 'report' && !(inlinePanel && variant === 'report-form')) add('features/marketplace/components/MarketplaceReportForm.tsx', { MarketplaceReportForm: nil });
  add('features/marketplace/elibrary/hooks/useDigitalLibrary.ts', { useDigitalLibrary: () => ({
    catalog, filters: { q: state === 'empty' ? 'sin coincidencias' : '', careerId: '', subjectId: '', modality: '' },
    loading: state === 'loading', error: state === 'error' ? 'El servicio no está disponible. Inténtalo nuevamente.' : null,
    items: state === 'empty' ? [] : digitalRows, page: 1, hasMore: true, search: noop, reload: noop, refresh: noop, openForm: noop, openDetail: noop,
    previousPage: noop, nextPage: noop, reloadCatalog: noop,
    selectedId: detailMode ? 'digital-0' : null, detailLoading: state === 'loading',
    detail: detailMode && state !== 'loading' && state !== 'error' ? { ...digitalRows[0], campusId: 'qa', description: 'Una guía organizada para repasar integrales, con ejemplos resueltos y ejercicios para practicar antes de tus evaluaciones.',
      acquired: variant === 'acquired', owner: { id: 'owner', fullName: 'Camila González', averageRating: 4.7, ratingCount: 12, completedAgreements: 16 } } : null,
    isOwner: variant === 'own', closeDetail: noop,
  }) });
  if (mode === 'publish') {
    const publicationCatalog = { careers: [...catalog.careers, { id: 'career2', name: 'Ingeniería en Administración', code: 'ADM' }], subjects: [{ ...catalog.subjects[0], careerIds: ['career', 'career2'] }, { id: 'subject2', name: 'Álgebra aplicada', code: 'ALG', careerIds: ['career'] }] };
    const sample = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="250"><rect width="440" height="250" fill="#e9f0f6"/><rect x="165" y="20" width="110" height="210" rx="15" fill="#002e56"/><rect x="180" y="38" width="80" height="45" rx="4" fill="#c8d7e0"/><g fill="#fdbb30"><rect x="180" y="103" width="20" height="18"/><rect x="210" y="103" width="20" height="18"/><rect x="240" y="103" width="20" height="18"/></g><g fill="#3f6a8e"><rect x="180" y="135" width="80" height="65" rx="4"/></g></svg>');
    const photos = [{ uri: sample, name: 'calculadora.jpg', mimeType: 'image/jpeg', base64: 'fixture' }, { uri: sample, name: 'detalle.jpg', mimeType: 'image/jpeg', base64: 'fixture' }];
    add('features/marketplace/physicalgoods/hooks/usePublishPhysicalgoods.ts', { usePublishPhysicalgoods: () => ({
      options: state === 'error-options' ? null : { ...catalog, campus: { id: 'qa', name: 'Campus de prueba' }, categories: [{ id: 'books', name: 'Material académico' }, { id: 'tech', name: 'Tecnología' }] },
      loading: state === 'loading', busy: state === 'busy', pickingPhoto: false, created: variant === 'partial' ? { id: 'saved', title: 'Calculadora científica', modality: 'VENTA', price: 12000 } : null,
      title: 'Calculadora científica', description: 'En buen estado. Incluye cubierta protectora, ideal para clases de ciencias e ingeniería.', condition: 'BUEN_ESTADO', categoryId: 'tech', modality: variant === 'donation' ? 'DONACION' : 'VENTA', price: '12000',
      careerId: 'career', subjectId: 'subject', photos: variant === 'empty' ? [] : photos, photo: photos[0], remaining: variant === 'partial' ? 1 : 0,
      error: state === 'error' || state === 'error-options' ? 'No se pudo completar la carga. Conservamos tu borrador.' : variant === 'partial' ? 'El recurso está publicado. Queda una imagen pendiente.' : null,
      setTitle: noop, setDescription: noop, setCondition: noop, setCategoryId: noop, setModality: noop, setPrice: noop, setCareerId: noop, setSubjectId: noop, choosePhoto: noop, removePhoto: noop, makePrincipal: noop, reload: noop, publish: noop, reset: noop,
    }) });
    mocks.delete(path.join(sourceRoot, 'features/marketplace/elibrary/components/DigitalAcademicSelector.tsx'));
    add('features/marketplace/elibrary/hooks/useDigitalLibrary.ts', { useDigitalLibrary: () => ({
      formOpen: true, attachMode: variant === 'attach', target: variant === 'partial' || variant === 'attach' ? { id: 'saved', title: 'Guía de cálculo integral', files: [{ id: 'saved-file', name: 'guia.pdf' }] } : null,
      title: 'Guía de cálculo integral', description: 'Ejemplos resueltos, ejercicios y un resumen de fórmulas para preparar tus evaluaciones.', modality: variant === 'donation' ? 'DONACION' : 'VENTA', price: '2500',
      files: variant === 'empty' ? [] : [{ uri: 'blob:qa', name: 'Guía de cálculo integral.pdf', sizeBytes: 1458000 }, { uri: 'blob:qa2', name: 'Ejercicios resueltos.pdf', sizeBytes: 890000 }],
      catalog: publicationCatalog, catalogLoading: state === 'loading', catalogError: state === 'error-options' ? 'No se pudo cargar el catálogo académico.' : null, careerIds: ['career', 'career2'], subjectIds: ['subject', 'subject2'],
      busy: state === 'busy', pickingFile: false, progress: state === 'busy' ? 'Adjuntando ejercicios.pdf · 1 pendiente' : '',
      error: state === 'error' || variant === 'partial' ? 'No se pudo cargar un archivo. Puedes reintentar los pendientes.' : null,
      notice: variant === 'partial' ? 'La publicación está guardada con 1 archivo. Quedan 2 pendientes.' : null,
      setTitle: noop, setDescription: noop, setModality: noop, setPrice: noop, setCareerIds: noop, setSubjectIds: noop, chooseFile: noop, removeFile: noop, reloadCatalog: noop, publish: noop, closeForm: noop,
    }) });
  }
  add('features/marketplace/elibrary/hooks/useDigitalTrades.ts', { useDigitalRequestAction: () => ({
    loading: false, busy: false, options: { canRequest: variant === 'available' || variant === 'preview-unavailable', acquired: variant === 'acquired', activeRequestId: variant === 'active' ? 'request' : null, messages: [{ code: 'INTERES', description: 'Me interesa este recurso para mis estudios.' }, { code: 'SOLICITAR', description: 'Quisiera solicitarlo.' }] }, reload: noop, code: 'INTERES', setCode: noop, submit: async () => {},
  }) });
  add('features/marketplace/elibrary/hooks/useDigitalPreview.ts', { useDigitalPreview: () => ({
    open: true, loading: false, result: variant === 'preview-unavailable' ? { available: false, text: null, message: 'Este archivo no dispone de una muestra textual. Revisa sus metadatos.' }
      : { available: true, text: '1. Introducción al cálculo integral\nLa integral permite estudiar la acumulación de cantidades. En esta guía repasaremos conceptos y ejemplos para resolver integrales definidas.', message: 'Muestra limitada preparada por el servidor.' },
  }) });
  add('features/marketplace/elibrary/hooks/useDigitalRecommendations.ts', { useDigitalRecommendations: () => ({
    items: digitalRows.filter(row => !row.acquired).map(row => ({ ...row, recommendation: { reasons: ['Relacionado con tu carrera'] } })),
    loading: state === 'loading', page: 1, hasMore: false, reload: noop,
  }) });
  const requestRows = ['Diego Pérez', 'Valentina Muñoz'].map((name, index) => ({
    id: `request-${index}`, publicationId: physical ? 'physical-0' : 'digital-0', title: physical ? physicalRows[0].title : digitalRows[0].title,
    owner: { id: 'owner', fullName: 'Camila González' }, requesterName: name, requester: { id: `user-${index}`, fullName: name }, status: 'PENDIENTE', requestedAt: '2026-10-23T12:00:00Z',
    message: index ? 'Quisiera solicitarlo.' : 'Me interesa este recurso para mis estudios.', transactionId: null, transaction: null, canResolve: true,
    campus: { id: 'qa', name: 'Campus de prueba' }, publication: { ...physicalRows[0], status: variant === 'reserved' ? 'RESERVADO' : 'DISPONIBLE', canView: true, isWithdrawn: false },
  }));
  if (mode === 'agreements') {
    requestRows[0] = { ...requestRows[0], status: 'ACEPTADA', transactionId: 'trade-0', transactionStatus: 'PENDIENTE_CONFIRMACION' };
    requestRows.push({ ...requestRows[1], id: 'request-2', title: 'Resumen de química orgánica', status: 'RECHAZADA' });
  }
  if(physical&&variant==='sent'&&sentScenario){
    const base=requestRows[0];
    requestRows.splice(0,requestRows.length,...[
      {...base,status:'ACEPTADA',owner:{id:'owner',fullName:'Carlos'},requester:{id:'viewer',fullName:'Carlos Soto'},campus:{id:'qa',name:'San Andres'},publication:{...base.publication,title:sentScenario==='long'?'Material de cálculo y álgebra para ingeniería, edición completa con ejercicios resueltos':'Sushi',modality:'DONACION',price:null,status:'RESERVADO'},transaction:{id:'trade-0',status:'RESERVADA',modality:'DONACION',amount:null,currency:'CLP'}},
      {...base,id:'request-1',owner:{id:'owner-1',fullName:'Marta'},requester:{id:'viewer',fullName:'Carlos Soto'},publication:{...base.publication,id:'physical-1',title:'Bicicleta urbana',price:45000}},
      {...base,id:'request-2',status:'RECHAZADA',owner:{id:'owner-2',fullName:'Javiera'},requester:{id:'viewer',fullName:'Carlos Soto'},publication:{...base.publication,id:'physical-2',title:'Calculadora',modality:'DONACION',price:null}},
    ]);
    if(sentScenario==='reserved')requestRows[0]={...requestRows[0],status:'PENDIENTE',transaction:null};
    if(sentScenario==='completed')requestRows[0]={...requestRows[0],transaction:{id:'trade-0',status:'COMPLETADA',modality:'VENTA',amount:15000,currency:'CLP'}};
    if(sentScenario==='historical')requestRows[0].publication={...requestRows[0].publication,isWithdrawn:true,canView:false};
  }
  if(physical&&variant==='received'&&receivedScenario){
    const base=requestRows[0],total=receivedScenario==='many'?10:3;
    requestRows.splice(0,requestRows.length,...Array.from({length:total},(_,index)=>({...base,id:`request-${index}`,requester:{id:`user-${index}`,fullName:['Diego Pérez','Valentina Muñoz','Mateo Rojas'][index]??`Estudiante ${index+1}`},
      publication:{...base.publication,price:15000,status:receivedScenario==='reserved'?'RESERVADO':'DISPONIBLE',canView:receivedScenario!=='historical',isWithdrawn:receivedScenario==='historical'},
      canResolve:receivedScenario!=='historical',status:receivedScenario==='historical'?'CANCELADA':receivedScenario==='reserved'&&index===0?'ACEPTADA':'PENDIENTE',
      transaction:receivedScenario==='reserved'&&index===0?{id:'trade-0',status:'RESERVADA',modality:'VENTA',amount:15000,currency:'CLP'}:null,
    })),{...base,id:'request-other',publication:{...base.publication,id:'physical-1',title:'Libro de física general',modality:'DONACION',price:null}});
  }
  const requestState = { open: true, received: variant !== 'sent', rows: state === 'empty' || state === 'error' ? [] : requestRows, number: 1, page: { data: state === 'empty' || state === 'error' ? [] : requestRows, meta: { hasMore: false } },
    loading: state === 'loading', error: state === 'error' ? 'No se pudo conectar. Revisa tu conexión e inténtalo otra vez.' : null, busy: false, selection: null, hasMore: false,
    reload: noop, mode: noop, select: noop, resolve: noop, cancel: noop, cancelSelection: noop, previous: noop, next: noop, setNumber: noop,
  };
  if (mode === 'requests' || (mode === 'personal' && ['sent', 'received'].includes(variant))) mocks.delete(path.join(sourceRoot, 'features/marketplace/physicalgoods/components/PhysicalgoodsRequests.tsx'));
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsRequests.ts', { usePhysicalgoodsRequests: () => requestState });
  add('components/RefreshScrollView.tsx', { useScrollRefresh: noop, RefreshScrollView: ({ children, contentContainerStyle, style }) => React.createElement(native.ScrollView, { contentContainerStyle, style }, children) });
  const personalMode = ['personal', 'owned', 'acquired', 'acquired-detail', 'transactions', 'agreements'].includes(mode);
  if (mode === 'request-detail') mocks.delete(path.join(sourceRoot, 'features/marketplace/physicalgoods/components/PhysicalgoodsHistory.tsx'));
  if (personalMode) {
    mocks.delete(path.join(sourceRoot, 'features/marketplace/physicalgoods/components/PhysicalgoodsHistory.tsx'));
    mocks.delete(path.join(sourceRoot, 'features/marketplace/elibrary/components/DigitalPersonalLibrary.tsx'));
  }
  const physicalOwn = physicalRows.slice(0, 3).map((row, index) => ({ ...row, campus: { id: 'qa', name: 'Campus de origen' },
    publishedAt: '2026-10-23T12:00:00Z', isWithdrawn: index === 2, canView: index !== 2, status: index === 1 ? 'FINALIZADO' : 'DISPONIBLE',
    activity: { pendingRequests: index === 0 ? 2 : 0 } }));
  const physicalTransactions = physicalOwn.map((row, index) => ({ id: `trade-${index}`, publication: row, campus: row.campus, role: index ? 'RECEPTOR' : 'PROPIETARIO',
    status: index === 1 ? 'COMPLETADA' : index === 2 ? 'CANCELADA' : 'PENDIENTE_CONFIRMACION', modality: row.modality, amount: row.price, currency: 'CLP', startedAt: row.publishedAt }));
  physicalTransactions.push(...['needs-confirmation','waiting'].map((kind,index)=>({...physicalTransactions[0],id:kind,status:'PENDIENTE_CONFIRMACION',publication:{...physicalOwn[0],title:index?'Libro de física':'Calculadora Casio'}})));
  if(transactionCounts){
    const sample=physicalTransactions[0];physicalTransactions.splice(0);
    for(const [tab,total]of Object.entries(transactionCounts))for(let index=0;index<total;index++)physicalTransactions.push({...sample,id:`${tab}-${index}`,publication:{...sample.publication,id:`pub-${tab}-${index}`,title:`Recurso ${index+1}`},status:tab==='active'?'RESERVADA':index%2?'CANCELADA':'COMPLETADA'});
  }
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsTransactions.ts',{TRANSACTIONS_PAGE_SIZE:5,usePhysicalgoodsTransactions:active=>{
    const all=empty||!active?[]:physicalTransactions,terminal=row=>['COMPLETADA','CANCELADA'].includes(row.status);
    const counts={active:all.filter(row=>!terminal(row)).length,finished:all.filter(terminal).length};
    const selectedTab=variant==='finished'?'finished':agreementTab;
    const rows=all.filter(row=>selectedTab==='finished'?terminal(row):!terminal(row));
    return {tab:selectedTab,setTab:noop,number:agreementPage,page:{data:rows.slice((agreementPage-1)*5,agreementPage*5),meta:{page:agreementPage,limit:5,total:counts[selectedTab],totalPages:Math.max(1,Math.ceil(counts[selectedTab]/5)),counts,hasMore:rows.length>agreementPage*5}},loading:state==='loading',error:state==='error'?'No se pudo cargar tu actividad.':null,reload:noop,refreshCurrent:noop,setNumber:noop};
  }});
  if(variant==='transactions-donation')Object.assign(physicalTransactions[0],{modality:'DONACION',amount:null});
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementPage.ts', { usePhysicalgoodsAgreementPage: (rows,enabled) => ({
    scope:'qa:qa',campusId:'qa',update:noop,refresh:noop,details: Object.fromEntries(rows.filter((_,index)=>enabled&&(variant!=='transactions-partial'||index!==0)).map(row=>[row.id,{...row,owner:{id:'qa',fullName:variant==='transactions-long'?'Camila Alejandra González Sepúlveda':'Camila González'},receiver:{id:'receiver',fullName:variant==='transactions-long'?'Diego Alejandro Pérez Muñoz':'Diego Pérez'},
      completedAt:row.status==='COMPLETADA'?'2026-10-24T12:00:00Z':null,cancelledAt:row.status==='CANCELADA'?'2026-10-24T11:00:00Z':null,
      rating:row.status==='COMPLETADA'&&variant==='rated'?{id:'rating',score:ratingScore,createdAt:'2026-10-24T12:35:00Z'}:null,
      canConfirm:!['COMPLETADA','CANCELADA'].includes(row.status)&&row.id!=='waiting',canCancel:!['COMPLETADA','CANCELADA'].includes(row.status),
      confirmations:row.status==='COMPLETADA'?[{userId:'qa',role:'PROPIETARIO',confirmedAt:'2026-10-24T12:00:00Z'},{userId:'receiver',role:'RECEPTOR',confirmedAt:'2026-10-24T12:00:00Z'}]:row.id==='needs-confirmation'?[{userId:'receiver',role:'RECEPTOR',confirmedAt:'2026-10-24T12:00:00Z'}]:row.id==='waiting'?[{userId:'qa',role:'PROPIETARIO',confirmedAt:'2026-10-24T12:00:00Z'}]:[]}])),failed:variant==='transactions-partial'&&rows.length?[rows[0].id]:[],loading:false,reload:noop,
  }) });
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementRequest.ts', { usePhysicalgoodsAgreementRequest: () => ({request:null,loading:false,error:null,open:noop,close:noop}) });
  const empty = state === 'empty' || state === 'error';
  add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsHistory.ts', { usePhysicalgoodsHistoryDetail: () => ({ loading: state === 'loading', error: state === 'error' ? 'No se pudo cargar el detalle.' : null, reload: noop, detail: state === 'loading' || state === 'error' ? null : { ...requestRows[0], status: variant === 'rejected' ? 'RECHAZADA' : variant === 'cancelled' ? 'CANCELADA' : ['accepted','completed','agreement-cancelled'].includes(variant) ? 'ACEPTADA' : 'PENDIENTE', transaction: ['accepted','completed','agreement-cancelled'].includes(variant) ? { id: 'trade', status: variant === 'completed' ? 'COMPLETADA' : variant === 'agreement-cancelled' ? 'CANCELADA' : 'RESERVADA' } : null, publication: { ...requestRows[0].publication, status: variant === 'completed' ? 'FINALIZADO' : variant === 'accepted' ? 'RESERVADO' : requestRows[0].publication.status, canView: variant !== 'historical' } } }), usePhysicalgoodsHistory: (active, transactions) => ({
    page: { data: empty || !active ? [] : transactions ? physicalTransactions : physicalOwn, meta: { hasMore: false } }, number: 1,
    loading: state === 'loading', error: state === 'error' ? 'No se pudo cargar tu actividad. Reintenta la consulta.' : null, reload: noop, setNumber: noop,
  }) });
  const owned = digitalRows.slice(0, 2).map((row, index) => ({ ...row, isWithdrawn: index === 1, activity: { pendingRequests: index ? 0 : 2, completedAgreements: index ? 1 : 4 } }));
  const acquired = digitalRows.slice(0, 2).map((row, index) => ({ ...row, isWithdrawn: index === 1, acquisition: { acquiredAt: '2026-10-20T12:00:00Z', modality: 'VENTA', amount: 2500, currency: 'CLP' } }));
  add('features/marketplace/elibrary/hooks/useOwnedDigitalResources.ts', { useOwnedDigitalResources: () => ({ open: true, items: empty ? [] : owned,
    loading: state === 'loading', error: state === 'error' ? 'No se pudieron cargar tus publicaciones.' : null, selected: null, page: 1, hasMore: false, reload: noop, edit: noop, next: noop, previous: noop }) });
  add('features/marketplace/elibrary/hooks/useAcquiredDigitalResources.ts', { useAcquiredDigitalResources: () => ({ open: true, items: empty ? [] : acquired,
    detail: mode === 'acquired-detail' ? { ...acquired[1], isWithdrawn: true, description: 'Material adquirido con acceso conservado. Las condiciones corresponden a tu acuerdo original.' } : null,
    selectedId: mode === 'acquired-detail' ? acquired[1].id : null, page: 1, hasMore: false, loading: state === 'loading',
    error: state === 'error' ? 'No se pudieron cargar tus materiales adquiridos.' : null, refresh: noop, show: noop, save: noop, back: noop, next: noop, previous: noop,
  }) });
  if (mode === 'agreements') {
    mocks.delete(path.join(sourceRoot, 'features/marketplace/elibrary/components/DigitalTradeCenter.tsx'));
    mocks.get(path.join(sourceRoot, 'features/marketplace/elibrary/hooks/useDigitalTrades.ts')).useDigitalTradeCenter = () => ({ ...requestState, page: 1, refresh: noop, poll: noop });
  }
  if (mode === 'transaction' || inlinePanel) {
    mocks.delete(path.join(sourceRoot, 'features/marketplace/physicalgoods/components/PhysicalgoodsTransaction.tsx'));
    mocks.delete(path.join(sourceRoot, 'features/marketplace/elibrary/components/DigitalTradeCenter.tsx'));
    const terminal = ['completed', 'cancelled'].includes(variant);
    const status = variant === 'completed' ? 'COMPLETADA' : variant === 'cancelled' ? 'CANCELADA' : ['waiting','needs-confirmation'].includes(variant) ? 'PENDIENTE_CONFIRMACION' : 'RESERVADA';
    const confirmations = ['waiting', 'completed'].includes(variant) ? [{ userId: 'qa', role: 'PROPIETARIO', confirmedAt: '2026-10-23T12:00:00Z' }, ...(variant === 'completed' ? [{ userId: 'receiver', role: 'RECEPTOR', confirmedAt: '2026-10-23T12:30:00Z' }] : [])] : [];
    if(variant==='needs-confirmation')confirmations.push({userId:'receiver',role:'RECEPTOR',confirmedAt:'2026-10-23T12:00:00Z'});
    const data = { id: 'trade', publicationId: 'publication', title: 'Guía de cálculo integral', campusId: 'qa', ownerId: 'qa', receiverId: 'receiver', status,
      modality: 'VENTA', amount: physical ? 12000 : 2500, currency: 'CLP', startedAt: '2026-10-23T10:00:00Z', completedAt: variant === 'completed' ? '2026-10-23T12:30:00Z' : null, cancelledAt: variant === 'cancelled' ? '2026-10-23T12:00:00Z' : null,
      confirmations, canConfirm: !terminal && variant !== 'waiting' && variant !== 'historical', canCancel: !terminal && variant !== 'historical', rating: null, canRate: false,
      publication: { id: 'publication', title: 'Calculadora científica', status: variant === 'completed' ? 'FINALIZADO' : variant === 'cancelled' ? 'DISPONIBLE' : 'RESERVADO', isWithdrawn: variant === 'withdrawn-cancel' },
      owner: { id: 'qa', fullName: 'Camila González' }, receiver: { id: 'receiver', fullName: 'Diego Pérez' }, role: 'PROPIETARIO', campus: { id: variant === 'historical' ? 'old' : 'qa', name: 'Campus de origen' }, cancelledById: variant === 'cancelled' ? 'qa' : null };
    if (['rating', 'rating-confirm', 'rated'].includes(variant)) Object.assign(data, { status: 'COMPLETADA', completedAt: '2026-10-24T12:30:00Z', canConfirm: false, canCancel: false,
      ownerId: 'owner', receiverId: 'qa', role: 'RECEPTOR', owner: { id: 'owner', fullName: 'Camila González' }, receiver: { id: 'qa', fullName: 'Diego Pérez' },
      confirmations: [{ userId: 'owner', role: 'PROPIETARIO', confirmedAt: '2026-10-24T12:00:00Z' }, { userId: 'qa', role: 'RECEPTOR', confirmedAt: '2026-10-24T12:30:00Z' }],
      publication: { ...data.publication, status: physical ? 'FINALIZADO' : 'DISPONIBLE' },
      canRate: variant !== 'rated', rating: variant === 'rated' ? { id: 'rating', score: ratingScore, createdAt: '2026-10-24T12:35:00Z' } : null });
    if (variant === 'participants-donation') Object.assign(data, { modality: 'DONACION', amount: null });
    if (variant === 'participants-buyer') Object.assign(data, { role: 'RECEPTOR', ownerId: 'owner', receiverId: 'qa', owner: { ...data.owner, id: 'owner' }, receiver: { ...data.receiver, id: 'qa' } });
    if (variant === 'participants-same-name') data.receiver.fullName = data.owner.fullName;
    if (variant === 'participants-long') {
      data.owner.fullName = 'Camila Alejandra González Sepúlveda';
      data.receiver.fullName = 'Diego Alejandro Pérez Muñoz';
    }
    if(inlinePanel){data.id=physicalTransactions[0].id;data.publication={...data.publication,id:physicalTransactions[0].publication.id,title:physicalTransactions[0].publication.title};Object.assign(physicalTransactions[0],{status:data.status,role:data.role,modality:data.modality,amount:data.amount,currency:data.currency,startedAt:data.startedAt});}
    const building = { id: 'building', name: 'Edificio Central', floors: [{ id: 'floor', name: 'Piso 1' }, { id: 'ground', name: 'Planta Baja' }] };
    const tradeState = { detail: transactionState === 'loading' || transactionState === 'error' ? null : data, trade: transactionState === 'loading' || transactionState === 'error' ? null : data,
      tradeTarget: { publicationId: 'publication', transactionId: 'trade', title: data.title }, viewerId: !physical && variant === 'completed' ? 'receiver' : 'qa', open: true, loading: transactionState === 'loading' || rechecking, busy: Boolean(submitting) && !rechecking, operation: submitting, error: transactionState === 'error' ? 'No se pudo cargar el acuerdo. Reintenta la consulta.' : null,
      detailRefreshing:false,refreshDetail:noop,messagesRefreshing: variant === 'messages-refreshing',refreshMessages:noop,cancelMessageRefresh:noop,cancelMessagePolling:noop,pollMessages:noop,historical: variant === 'historical', messagesLoading: false, optionsLoading: false, messages: { data: [{ id: 'message', senderId: 'receiver', text: 'Estoy en Biblioteca, en Planta Baja.', createdAt: '2026-10-23T11:00:00Z' }], meta: { hasMore: false } },
      options: variant === 'map-error' ? null : { buildings: [building] }, optionsError: variant === 'map-error' ? 'No se pudieron consultar las ubicaciones del campus.' : null,
      building, buildingId: 'building', floorId: 'floor', preview: variant === 'map-error' ? null : 'Estoy en Edificio Central, en Piso 1.',
      action: ['cancel-dialog', 'withdrawn-cancel'].includes(variant) ? 'cancel' : variant === 'confirm-dialog' ? 'confirm' : null, score: 4, ratingScore: 4, ratingConfirmation: variant === 'rating-confirm', page: 1,
      setScore: noop, selectRating: noop, confirmRating: noop, cancelRating: noop, rate: noop,
      reload: noop, closeTrade: noop, toggle: noop, mode: noop, selectAction: noop, selectTransition: noop, cancelTransition: noop, transition: async () => {}, confirmExchange:async()=>{},submitRating:async()=>{},confirm: async () => {}, cancel: async () => {}, cancelAction: noop, send: async () => {},
      poiKey:'',setPoi:noop,setBuilding: noop, setFloor: noop, setPage: noop, reloadOptions: noop, reloadMessages: noop,
    };
    if(variant.startsWith('coord-')){
      building.floors[0].pois=[{id:'library',name:'Biblioteca'},{id:'study',name:'Sala de estudio'}];building.floors[1].pois=[];
      if(variant==='coord-building')Object.assign(tradeState,{building:undefined,buildingId:'',floorId:'',preview:null});
      if(variant==='coord-floor')Object.assign(tradeState,{floorId:'',preview:null});
      if(variant==='coord-poi-selected')Object.assign(tradeState,{poiKey:'library',preview:'Estoy en Edificio Central, en Piso 1, en Biblioteca.'});
      if(variant==='coord-no-poi')Object.assign(tradeState,{floorId:'ground',preview:'Estoy en Edificio Central, en Planta Baja.'});
      if(variant==='coord-long-title')data.publication.title='Guía impresa de álgebra lineal y cálculo para primer año de Ingeniería';
      if(variant==='coord-refresh')tradeState.messagesRefreshing=true;
      if(['coord-building-menu','coord-building-selected-menu'].includes(variant)){
        const places=['Cabaña C','Cabaña B','Cabaña A','Edificio D','Edificio E','Edificio F','Edificio G','Edificio H','CTI','Gimnasio'].map((name,index)=>({id:'place-'+index,name,floors:[{id:'floor-'+index,name:'Planta Baja',pois:[]}]}));
        Object.assign(tradeState,{options:{buildings:places},building:variant==='coord-building-selected-menu'?places[5]:undefined,buildingId:variant==='coord-building-selected-menu'?places[5].id:'',floorId:'',preview:null});
      }
      if(['coord-cabin-floors','coord-cabin-floor-selected'].includes(variant)){
        const cabin={id:'cabin03',name:'Cabaña A',floors:[{id:'cabin03_floor-3',name:'Cabaña A - Piso -3',pois:[]},{id:'cabin03_floor1',name:'Cabaña A - Piso -2',pois:[]},{id:'cabin03_floor2',name:'Cabaña A - Piso -1',pois:[]},{id:'cabin03_floor3',name:'Cabaña A - Piso 1',pois:[]}]};
        Object.assign(tradeState,{building:cabin,options:{buildings:[cabin]},buildingId:cabin.id,floorId:variant==='coord-cabin-floor-selected'?'cabin03_floor-3':'',preview:variant==='coord-cabin-floor-selected'?'Estoy en Cabaña A, en Cabaña A - Piso -3.':null});
      }
    }
    if(variant==='new-message')tradeState.messages.data.push({id:'message-new',senderId:'qa',text:'Estoy en Edificio Central, en Piso 1.',createdAt:'2026-10-23T11:00:07Z'});
    if(variant==='coord-delay-map'){tradeState.options=null;tradeState.optionsLoading=true;}
    if(variant==='coord-delay-messages'){tradeState.messages=null;tradeState.messagesLoading=true;}
    if(variant==='coord-background-map')Object.assign(tradeState,{optionsLoading:true,poiKey:'library',preview:'Estoy en Edificio Central, en Piso 1, en Biblioteca.'});
    add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsTransaction.ts', { usePhysicalgoodsTransaction: () => tradeState });
    const photo = color => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#E9F0F6"/><rect x="206" y="22" width="188" height="356" rx="22" fill="${color}"/><rect x="223" y="51" width="154" height="64" rx="8" fill="#DBE7D5"/><text x="358" y="93" text-anchor="end" font-size="28" font-family="sans-serif" fill="#09243A">123.45</text>${Array.from({length:30},(_,i)=>`<rect x="${225+(i%5)*30}" y="${144+Math.floor(i/5)*35}" width="21" height="23" rx="5" fill="${i<5?'#B2C8D7':'#F4F7F9'}"/>`).join('')}</svg>`).toString('base64');
    add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementProduct.ts', { usePhysicalgoodsAgreementProduct: () => ({
      product: ['product-loading','product-error','product-unavailable'].includes(variant) ? null : { id:'publication', description:'Calculadora científica con funciones para tus clases. Incluye tapa protectora.', condition:'USADO', category:{id:'calculators',name:'Calculadoras'}, images:variant==='no-photos'?[]:[{id:'front',url:photo('#002E56'),principal:true},{id:'back',url:photo('#3F6A8E'),principal:false}] },
      loading:variant==='product-loading', error:variant==='product-error'?'No se pudo cargar la información del recurso. Puedes reintentar.':null, unavailable:variant==='product-unavailable', reload:noop,
    }) });
    mocks.get(path.join(sourceRoot, 'features/marketplace/elibrary/hooks/useDigitalTrades.ts')).useDigitalTradeCenter = () => tradeState;
    add('components/RefreshScrollView.tsx', { useScrollRefresh: noop, RefreshScrollView: ({ children, contentContainerStyle, style }) => React.createElement(native.ScrollView, { contentContainerStyle, style }, children) });
  }
  if(mode!=='transaction'&&!inlinePanel)add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementProduct.ts',{usePhysicalgoodsAgreementProduct:()=>({product:null,loading:false,error:null,unavailable:true,reload:noop})});
  if(receivedResource)add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementProduct.ts',{usePhysicalgoodsAgreementProduct:()=>({product:{id:'physical-0',modality:'VENTA',price:15000,condition:'USADO',category:{id:'calculators',name:'Calculadoras'},description:'Calculadora científica con tapa protectora.',images:[]},loading:false,error:null,unavailable:false,reload:noop})});
  if(sentResource){
    const cover='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#E9F0F6"/><g stroke="#003353" stroke-width="8" fill="none" stroke-linejoin="round" stroke-linecap="round"><circle cx="150" cy="290" r="78"/><circle cx="450" cy="290" r="78"/><path d="M150 290L225 160L305 290H150L380 160H225M305 290L380 160L450 290M205 143H250M380 160L365 115H405"/></g></svg>').toString('base64');
    add('features/marketplace/physicalgoods/hooks/usePhysicalgoodsAgreementProduct.ts',{usePhysicalgoodsAgreementProduct:()=>({
      product:['loading','error','historical'].includes(sentResource)?null:{id:'physical-1',modality:'VENTA',price:45000,condition:'USADO',category:{id:'other',name:'Otros recursos'},description:'Bicicleta urbana en buen estado, lista para tus recorridos.',images:[{id:'cover',principal:true,url:cover}]},
      loading:sentResource==='loading',error:sentResource==='error'?'No se pudo cargar la información del recurso. Puedes reintentar.':null,unavailable:sentResource==='historical',reload:noop,
    })});
  }
  if (mode === 'report' || (inlinePanel && variant === 'report-form')) add('features/reports/hooks/useContentReport.ts', { useContentReport: () => ({ busy: state === 'busy', error: state === 'error' ? 'No se pudo confirmar el envío. Si se guardó, reenviarla podría crear otra denuncia.' : null,
    receipt: variant === 'receipt' ? { id: 'receipt', status: 'PENDIENTE', reportedAt: '2026-10-24T12:35:00Z' } : null, submit: noop }) });
  if (refreshing) mocks.delete(path.join(sourceRoot, 'components/RefreshScrollView.tsx'));
  const cache = new Map();
  const browserNative = { ...native, useWindowDimensions: () => ({ width, height: 844, scale: 1, fontScale: 1 }) };
  // SSR cannot create RN Modal portals. The HTML fixture moves these wrappers to body,
  // preserving stacking order and preventing nested dialogs from clipping other modals.
  if (mode === 'transaction' || mode === 'filters' || mode === 'request-detail' || inlinePanel || sentResource || receivedResource) browserNative.Modal = ({ visible, children }) => visible ? React.createElement(native.View, { dataSet: { qaModalPortal: 'true' }, style: { position: 'fixed', top: 0, bottom: 0, left: 0, width, zIndex: 1000 } }, children) : null;
  const originalLoad = Module._load;
  Module._load = function(name, parent, isMain) {
    if (name === 'react-native') return native;
    if (name.startsWith('react-native-web/dist/exports/')) return { __esModule: true, default: browserNative[name.split('/').at(-1)] };
    if (name === 'react-native-svg') return originalLoad.call(this, 'react-native-svg/lib/commonjs/elements.web.js', parent, isMain);
    return originalLoad.call(this, name, parent, isMain);
  };
  function load(filename) {
    if (mocks.has(filename)) return mocks.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const transformed = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, configFile: path.join(project, 'babel.config.js'),
      caller: { name: 'metro', platform: 'web', supportsStaticESM: false },
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code;
    // F1 starts after the CTA: control only the detail's local requesting state.
    // All API hooks remain fixtures; no writes, sessions or browser clicks occur.
    let requestStateIndex = 0;
    vm.runInThisContext(Module.wrap(transformed), { filename })(module.exports, name => {
      if (name === 'react' && ratingSent && /PhysicalgoodsTransaction\.tsx$/.test(filename)) return { ...React, useRef: initial => React.useRef(initial && typeof initial === 'object' && 'started' in initial ? { ...initial, started: true } : initial) };
      if (name === 'react' && mode === 'filters' && /(?:PhysicalgoodsSearchFilters|DigitalSearchForm)\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(initial === false ? true : initial === null ? ['careerId', 'subjectId', 'categoryId', 'condition'].includes(variant) ? variant : null : initial) };
      if (name === 'react' && mode === 'filters' && /SearchableFilterSelect\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(initial === '' ? filterQuery : initial) };
      if (name === 'react' && mode === 'publish' && /PublishPhysicalgoods\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(initial === 'explore' ? 'publish' : initial) };
      if (name === 'react' && mode === 'personal' && /PublishPhysicalgoods\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(initial === 'explore' ? inlinePanel || variant === 'rated' ? 'transactions' : ['transactions', 'sent', 'received'].includes(variant) ? variant : variant.startsWith('transactions-') ? 'transactions' : 'mine' : initial) };
      if (name === 'react' && sentScenario && /PhysicalgoodsSentRequests\.tsx$/.test(filename)) return {...React,useState:initial=>React.useState(requestStateIndex++===0?{key:'viewer:1',id:sentOpen}:sentResource?requestRows.find(row=>row.id===sentOpen)??requestRows[0]:initial)};
      if (name === 'react' && receivedScenario && /PhysicalgoodsReceivedRequests\.tsx$/.test(filename)) return {...React,useState:initial=>React.useState(requestStateIndex++===0?{key:'owner:1',id:receivedOpen}:receivedResource?requestRows[0]:initial)};
      if (name === 'react' && inlinePanel && /PhysicalgoodsAgreements\.tsx$/.test(filename)) return {...React,useState:initial=>React.useState(initial===null?{publicationId:physicalTransactions[0].publication.id,transactionId:physicalTransactions[0].id,entry:inlinePanel}:initial==='active'&&agreementTab==='finished'?'finished':initial)};
      if (name === 'react' && /PhysicalgoodsAgreements\.tsx$/.test(filename) && (variant === 'finished' || agreementTab === 'finished')) return { ...React, useState: initial => React.useState(initial === 'active' ? 'finished' : initial) };
      if (name === 'react' && mode === 'transaction' && /PhysicalgoodsTransaction\.tsx$/.test(filename)) return { ...React, useState: initial => { const index=requestStateIndex++; return React.useState(initial==='overview' ? agreementPanel : index===2 && variant==='menu' ? true : initial); } };
      if (name === 'react' && inlinePanel && variant === 'report-form' && /PhysicalgoodsTransaction\.tsx$/.test(filename)) return {...React,useState:initial=>React.useState(requestStateIndex++===0?true:initial)};
      if (name === 'react' && mode === 'transaction' && /PhysicalgoodsCoordination\.tsx$/.test(filename) && variant==='coord-poi-menu') return {...React,useState:initial=>React.useState(initial===null?'poi':initial)};
      if (name === 'react' && mode === 'transaction' && /PhysicalgoodsCoordination\.tsx$/.test(filename) && ['coord-building-menu','coord-building-selected-menu'].includes(variant)) return {...React,useState:initial=>React.useState(initial===null?'building':initial)};
      if (name === 'react' && mode === 'transaction' && /PhysicalgoodsCoordination\.tsx$/.test(filename) && ['coord-cabin-floors','coord-cabin-floor-selected'].includes(variant)) return {...React,useState:initial=>React.useState(initial===null?'floor':initial)};
      if (name === 'react' && mode === 'request' && /(?:PhysicalgoodsDetail|DigitalResourceDetail)\.tsx$/.test(filename)) return { ...React, useState: initial => [requestStateIndex++ === 2 ? true : initial, noop] };
      if (name === 'react' && mode === 'report' && /MarketplaceReportForm\.tsx$/.test(filename)) return { ...React, useState: initial => [requestStateIndex++ === 0 && variant !== 'empty' ? 'misleading' : initial, noop] };
      if (name === 'react' && mode === 'transaction' && variant === 'rating-confirm' && /DigitalTransactionDetail\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(initial === false ? true : initial) };
      if (name === 'react' && refreshing && /[\\/]components[\\/]RefreshScrollView\.tsx$/.test(filename)) return { ...React, useState: initial => React.useState(requestStateIndex++ === 0 ? { onRefresh: noop, refreshing: true, enabled: true, label: physical ? 'mi actividad' : 'mi biblioteca' } : initial === false ? true : initial) };
      if (name === 'react-native') return browserNative;
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
      if (name === 'expo-router') return { useLocalSearchParams: () => ({}), usePathname: () => physical ? '/physicalgoods' : '/elibrary', router: { replace: noop } };
      if (name === 'expo-blur') return { BlurView: () => null };
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? path.join(sourceRoot, name.slice(2)) : path.resolve(path.dirname(filename), name);
        const candidate = [base, base + '.web.tsx', base + '.tsx', base + '.ts', path.join(base, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
        assert.ok(candidate, `Unresolved source ${name}`); return load(candidate);
      }
      return require(name);
    }, module, filename, path.dirname(filename));
    return module.exports;
  }
  try {
    const target = mode === 'request-detail' ? 'physicalgoods/components/PhysicalgoodsHistory.tsx' : mode === 'filters' ? physical ? 'physicalgoods/components/PhysicalgoodsSearchFilters.tsx' : 'elibrary/components/DigitalSearchForm.tsx' : mode === 'report' ? 'components/MarketplaceReportForm.tsx' : mode === 'transaction' ? physical ? 'physicalgoods/components/PhysicalgoodsTransaction.tsx' : 'elibrary/components/DigitalTradeCenter.tsx' : !physical && personalMode ? 'elibrary/components/DigitalPersonalLibrary.tsx' : mode === 'transactions' ? 'physicalgoods/components/PhysicalgoodsHistory.tsx' : mode === 'requests' ? physical ? 'physicalgoods/components/PhysicalgoodsRequests.tsx' : 'elibrary/components/DigitalRequests.tsx'
      : physical ? detailMode ? 'physicalgoods/components/PhysicalgoodsDetail.tsx' : 'physicalgoods/components/PublishPhysicalgoods.tsx' : 'elibrary/components/DigitalLibraryScreen.tsx';
    const exports = load(path.join(sourceRoot, 'features/marketplace', target));
    const Screen = mode === 'request-detail' ? () => React.createElement(exports.PhysicalgoodsHistoryDetail, { target: { publicationId: 'physical-0', requestId: 'request-0' }, onClose: noop, onOpen: noop, onAgreement: noop }) : mode === 'filters' ? () => {
      const careers = [{ id: 'career', name: 'Ingeniería en Informática', code: 'INF' }, { id: 'adm', name: 'Ingeniería en Administración', code: 'ADM' }, { id: 'design', name: 'Diseño gráfico', code: 'DIS' }, { id: 'construction', name: 'Construcción civil', code: 'CON' }, { id: 'tourism', name: 'Turismo', code: 'TUR' }];
      const subjects = [{ id: 'subject', name: 'Cálculo integral', code: 'MAT' }, { id: 'db', name: 'Bases de datos', code: 'BD' }, { id: 'prog', name: 'Programación de aplicaciones', code: 'PROG' }, { id: 'algebra', name: 'Álgebra lineal', code: 'ALG' }];
      const resourceState = mocks.get(path.join(sourceRoot, 'features/marketplace/physicalgoods/hooks/usePhysicalgoodsResources.ts')).usePhysicalgoodsResources();
      const content = physical ? React.createElement(exports.PhysicalgoodsSearchFilters, { resources: { ...resourceState, options: { ...resourceState.options, careers, subjects, categories: [{ id: 'notes', name: 'Apuntes' }, { id: 'books', name: 'Libros' }, { id: 'calculators', name: 'Calculadoras' }, { id: 'other', name: 'Otros' }] } } })
        : React.createElement(exports.DigitalSearchForm, { catalog: { careers, subjects }, filters: { q: '', careerId: '', subjectId: '', modality: '' }, onSearch: noop, catalogLoading: false, catalogError: null, reloadCatalog: noop });
      return React.createElement(native.View, { style: { flex: 1, padding: 20, backgroundColor: '#F4F7F9' } }, content);
    } : mode === 'report' ? () => React.createElement(native.ScrollView, { contentContainerStyle: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 20 } }, React.createElement(load(path.join(sourceRoot, 'features/marketplace/components/CatalogUI.tsx')).ScreenHeader, { title: physical ? 'Mercado' : 'Biblioteca', subtitle: 'Denuncia un recurso o intercambio', onBack: noop }), React.createElement(exports.MarketplaceReportForm, { target: { type: physical ? variant === 'transaction' ? 'TRANSACCION' : 'PUBLICACION_FISICA' : variant === 'transaction' ? 'TRANSACCION_DIGITAL' : 'PUBLICACION_DIGITAL', publicationId: 'publication', transactionId: 'trade', campusId: 'qa' }, title: physical ? 'Calculadora científica' : 'Guía de cálculo integral', onBack: noop })) : mode === 'transaction' ? physical ? () => React.createElement(exports.PhysicalgoodsTransaction, { target: { publicationId: 'publication', transactionId: 'trade' }, onClose: noop, onChanged: noop, onOpen: noop }) : () => React.createElement(native.ScrollView, { contentContainerStyle: { padding: 20, width: '100%', maxWidth: 760, alignSelf: 'center' } }, React.createElement(exports.DigitalTradeCenter, { embedded: true, onAcquired: noop }))
      : !physical && personalMode ? () => React.createElement(native.ScrollView, { contentContainerStyle: { padding: 20, paddingBottom: 60, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 20 } }, React.createElement(load(path.join(sourceRoot, 'features/marketplace/components/CatalogUI.tsx')).ScreenHeader, { title: 'Mi biblioteca', subtitle: 'Tus materiales, publicaciones y acuerdos', onBack: noop }), React.createElement(exports.DigitalPersonalLibrary, { onExplore: noop, onPublish: noop, initialTab: mode === 'owned' ? 'owned' : mode === 'agreements' ? 'trades' : 'acquired' }))
      : mode === 'transactions' ? () => React.createElement(native.ScrollView, { contentContainerStyle: { padding: 20, width: '100%', maxWidth: 760, alignSelf: 'center' } }, React.createElement(exports.PhysicalgoodsHistory, { active: true, transactions: true, onDetail: noop, onAgreement: noop }))
      : mode === 'requests' ? () => React.createElement(native.ScrollView, { contentContainerStyle: { padding: 20, width: '100%', maxWidth: 760, alignSelf: 'center' } }, physical
      ? React.createElement(exports.PhysicalgoodsRequests, { active: true, received: requestState.received, onResolved: noop, onDetail: noop, onAgreement: noop, onOpen: noop, onExplore: noop, onModeChange: noop })
      : React.createElement(exports.DigitalRequests, { state: { ...requestState, page: 1 } }))
      : physical ? detailMode ? () => React.createElement(exports.PhysicalgoodsDetail, { resources: mocks.get(path.join(sourceRoot, 'features/marketplace/physicalgoods/hooks/usePhysicalgoodsResources.ts')).usePhysicalgoodsResources(), onClose: noop, onBusyChange: noop, onRequestDetail: noop }) : exports.PhysicalGoodsScreen : exports.default;
    const Refresh = refreshing && (mode === 'requests' || (!physical && (personalMode || mode === 'transaction'))) ? load(path.join(sourceRoot, 'components/RefreshScrollView.tsx')).RefreshScrollView : null;
    native.AppRegistry.registerComponent('CatalogQA', () => Refresh ? () => React.createElement(Refresh, { onRefresh: noop, refreshing: true, refreshLabel: mode === 'requests' ? 'las solicitudes recibidas' : mode === 'transaction' ? 'el acuerdo digital' : 'mi biblioteca' }, React.createElement(Screen)) : Screen);
    const { element, getStyleElement } = native.AppRegistry.getApplication('CatalogQA');
    const markup = renderToStaticMarkup(element);
    const css = renderToStaticMarkup(getStyleElement());
    return { markup, html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}<style>html,body,#root{height:100%;margin:0}body{background:#F4F7F9}#root{width:${width}px;max-width:100vw;display:flex;flex-direction:column}</style></head><body><div id="root">${markup}</div><script>document.querySelectorAll('[data-qa-modal-portal]').forEach(node=>document.body.appendChild(node));</script></body></html>` };
  } finally { Module._load = originalLoad; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[2] ?? path.join(project, 'dist/catalog-qa'));
  fs.mkdirSync(output, { recursive: true });
  for (const screen of ['physical', 'digital']) for (const state of ['ready', 'loading', 'empty', 'error']) {
    const { html } = renderCatalog(screen, { state });
    fs.writeFileSync(path.join(output, `${screen}-${state}.html`), html);
  }
  console.log(`Rendered catalog fixtures: ${output}`);
}
