import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../../shared/health/health-response.js';
import { getElibraryHealth } from '../services/elibrary.service.js';
import { authorizeDigitalAccess, createDigitalPublication, getDigitalPublications } from '../services/elibrary.service.js';
import { sendSuccess } from '../../../../shared/http/api-response.js';
import type { AuthLocals } from '../../../auth/types/auth.types.js';
import { readDigitalUpload } from '../middleware/elibrary.upload.js';
import { addDigitalAttachment, getDigitalOriginal } from '../services/elibrary.files.service.js';
import { getDigitalAcademicCatalog, updateDigitalAcademics } from '../services/elibrary.academics.service.js';
import { invalidDigital } from '../validators/elibrary.validation.js';
import { searchDigitalPublications } from '../services/elibrary.search.service.js';
import { sendSuccess as sendEnvelope } from '../../../../shared/http/api-response.js';
import { getDigitalPreview } from '../services/elibrary.preview.service.js';
import { createDigitalRequest, digitalAction, getDigitalRequestOptions, getDigitalRequests, getDigitalTrade, resolveDigitalRequest, transitionDigitalTrade } from '../services/elibrary.trades.service.js';
import { getAcquiredDigitalResources,getOwnedDigitalResources } from '../services/elibrary.acquired.service.js';
import { editDigitalPublication } from '../services/elibrary.edit.service.js';
import { getDigitalRecommendations } from '../services/elibrary.recommendations.service.js';
import { rateDigitalOwner } from '../services/elibrary.rating.service.js';
import {getDigitalActivity} from '../services/elibrary.activity.service.js';
import { getDigitalMessages, sendDigitalMessage } from '../services/elibrary.messages.service.js';

type DigitalHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const digitalMessagesController: DigitalHandler = async (request, response) => {
  const result = await getDigitalMessages(response.locals.auth, request.params.publicationId, request.params.transactionId, request.query);
  sendEnvelope(response, result.data, { meta: result.meta });
};
export const sendDigitalMessageController: DigitalHandler = async (request, response) => {
  digitalAction(request.query);
  sendSuccess(response, await sendDigitalMessage(response.locals.auth, request.params.publicationId, request.params.transactionId, request.body), 201);
};
export const digitalActivityController=(kind:Parameters<typeof getDigitalActivity>[2]):DigitalHandler=>async(request,response)=>{
 const result=await getDigitalActivity(response.locals.auth,request.query,kind,request.params.publicationId);
 if('data' in result&&'meta' in result)sendEnvelope(response,result.data,{meta:result.meta});else sendSuccess(response,result);
};
export const rateDigitalController:DigitalHandler=async(request,response)=>{digitalAction(request.query);sendSuccess(response,await rateDigitalOwner(response.locals.auth,request.params.publicationId,request.params.transactionId,request.body),201);};
export const recommendationsDigitalController:DigitalHandler=async(request,response)=>{const result=await getDigitalRecommendations(response.locals.auth,request.query);sendEnvelope(response,result.data,{meta:result.meta});};
export const ownedDigitalController:DigitalHandler=async(request,response)=>{const result=await getOwnedDigitalResources(response.locals.auth,request.query);sendEnvelope(response,result.data,{meta:result.meta});};
export const ownedDigitalDetailController:DigitalHandler=async(request,response)=>{digitalAction(request.query);const result=await getOwnedDigitalResources(response.locals.auth,{},request.params.publicationId);sendSuccess(response,result.data[0]);};
export const editDigitalController=(retiring:boolean):DigitalHandler=>async(request,response)=>{digitalAction(request.query);sendSuccess(response,await editDigitalPublication(response.locals.auth,request.params.publicationId,request.body,retiring));};
export const acquiredDigitalController:DigitalHandler=async(request,response)=>{
  const result=await getAcquiredDigitalResources(response.locals.auth,request.query);sendEnvelope(response,result.data,{meta:result.meta});
};
export const acquiredDigitalDetailController:DigitalHandler=async(request,response)=>{
  digitalAction(request.query);const result=await getAcquiredDigitalResources(response.locals.auth,{},request.params.publicationId);sendSuccess(response,result.data[0]);
};
export const digitalRequestOptionsController: DigitalHandler = async(request,response)=>{
  digitalAction(request.query);sendSuccess(response,await getDigitalRequestOptions(response.locals.auth,request.params.publicationId));
};
export const createDigitalRequestController: DigitalHandler = async(request,response)=>{
  digitalAction(request.query);sendSuccess(response,await createDigitalRequest(response.locals.auth,request.params.publicationId,request.body,request.get('Idempotency-Key')),201);
};
export const receivedDigitalRequestsController: DigitalHandler = async(request,response)=>{
  const result=await getDigitalRequests(response.locals.auth,request.query,true);sendEnvelope(response,result.data,{meta:result.meta});
};
export const sentDigitalRequestsController: DigitalHandler = async(request,response)=>{
  const result=await getDigitalRequests(response.locals.auth,request.query,false);sendEnvelope(response,result.data,{meta:result.meta});
};
export const resolveDigitalRequestController: DigitalHandler = async(request,response)=>{
  digitalAction(request.query);sendSuccess(response,await resolveDigitalRequest(response.locals.auth,request.params.publicationId,request.params.requestId,request.body));
};
export const detailDigitalTradeController: DigitalHandler = async(request,response)=>{
  digitalAction(request.query);sendSuccess(response,await getDigitalTrade(response.locals.auth,request.params.publicationId,request.params.transactionId));
};
export const transitionDigitalTradeController = (action:'CONFIRMAR'|'CANCELAR'):DigitalHandler=>async(request,response)=>{
  digitalAction(request.query);sendSuccess(response,await transitionDigitalTrade(response.locals.auth,request.params.publicationId,request.params.transactionId,request.body,action));
};
export const digitalPreviewController: DigitalHandler = async (request,response) => {
  if (Object.keys(request.query).length) invalidDigital('query','La vista previa no admite parámetros adicionales.');
  sendSuccess(response,await getDigitalPreview(response.locals.auth,request.params.publicationId,request.params.fileId));
};
export const digitalAcademicCatalogController: DigitalHandler = async (request, response) => {
  if (Object.keys(request.query).length) invalidDigital('query', 'La consulta no admite parámetros adicionales.');
  sendSuccess(response, await getDigitalAcademicCatalog(response.locals.auth));
};
export const updateDigitalAcademicsController: DigitalHandler = async (request, response) => {
  if (Object.keys(request.query).length) invalidDigital('query', 'La solicitud no admite parámetros adicionales.');
  sendSuccess(response, await updateDigitalAcademics(response.locals.auth, request.params.publicationId, request.body));
};
export const addDigitalFileController: DigitalHandler = async (request, response) => {
  authorizeDigitalAccess(response.locals.auth);
  const { file } = await readDigitalUpload(request, false);
  sendSuccess(response, await addDigitalAttachment(response.locals.auth, request.params.publicationId, file), 201);
};
export const downloadDigitalFileController: DigitalHandler = async (request, response) => {
  const file = await getDigitalOriginal(response.locals.auth, request.params.publicationId, request.params.fileId);
  const name = encodeURIComponent(file.name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16));
  response.setHeader('Content-Type', 'application/octet-stream');
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
  response.setHeader('Content-Length', file.bytes.length);
  response.send(file.bytes);
};
export const createDigitalController: DigitalHandler = async (request, response) => {
  authorizeDigitalAccess(response.locals.auth);
  const { metadata, file } = await readDigitalUpload(request);
  sendSuccess(response, await createDigitalPublication(response.locals.auth, metadata, file), 201);
};
export const listDigitalController: DigitalHandler = async (request, response) => {
  const result = await searchDigitalPublications(response.locals.auth, request.query);
  sendEnvelope(response, result.data, { meta: result.meta });
};
export const detailDigitalController: DigitalHandler = async (request, response) => {
  const publication=(await getDigitalPublications(response.locals.auth, request.params.publicationId))[0];
  sendSuccess(response,publication);
};

export const getElibraryHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getElibraryHealth());
};
