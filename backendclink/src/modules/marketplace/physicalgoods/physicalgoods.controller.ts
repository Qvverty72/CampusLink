import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getPhysicalgoodsHealth } from './physicalgoods.service.js';
import { createPhysicalgoods, getPhysicalgoodsOptions, getPhysicalgoodsPhoto } from './physicalgoods.service.js';
import { sendSuccess } from '../../../services/api-response.js';
import type { AuthLocals } from '../../auth/auth.types.js';
import { addPhysicalgoodsImage, changePhysicalgoodsCategory, changePhysicalgoodsPrincipal, deletePhysicalgoodsImage, getPhysicalgoodsGallery, getPhysicalgoodsResources } from './physicalgoods.images.service.js';
import { sendSuccess as sendEnvelope } from '../../../services/apiResponse.js';
import { updatePhysicalgoods, withdrawPhysicalgoods } from './physicalgoods.edit.service.js';
import { createPhysicalgoodsRequest, getPhysicalgoodsRequestOptions, getReceivedPhysicalgoodsRequests, getSentPhysicalgoodsRequests, resolvePhysicalgoodsRequest } from './physicalgoods.requests.service.js';
import { getPhysicalgoodsTransaction,getPhysicalgoodsCoordinationOptions,getPhysicalgoodsCoordinationMessages,sendPhysicalgoodsCoordination,transitionPhysicalgoodsTransaction } from './physicalgoods.transactions.service.js';

type PhysicalgoodsHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const getPhysicalgoodsTransactionController:PhysicalgoodsHandler=async(request,response)=>{
  sendSuccess(response,await getPhysicalgoodsTransaction(response.locals.auth,request.params.publicationId,request.params.transactionId));
};
export const getPhysicalgoodsCoordinationOptionsController:PhysicalgoodsHandler=async(request,response)=>{
  sendSuccess(response,await getPhysicalgoodsCoordinationOptions(response.locals.auth,request.params.publicationId,request.params.transactionId));
};
export const getPhysicalgoodsCoordinationMessagesController:PhysicalgoodsHandler=async(request,response)=>{
  const result=await getPhysicalgoodsCoordinationMessages(response.locals.auth,request.params.publicationId,request.params.transactionId,request.query);
  sendEnvelope(response,result.data,{meta:result.meta});
};
export const sendPhysicalgoodsCoordinationController:PhysicalgoodsHandler=async(request,response)=>{
  sendSuccess(response,await sendPhysicalgoodsCoordination(response.locals.auth,request.params.publicationId,request.params.transactionId,request.body),201);
};
export const getReceivedPhysicalgoodsRequestsController: PhysicalgoodsHandler = async (request,response) => {
  const result = await getReceivedPhysicalgoodsRequests(response.locals.auth,request.query);
  sendEnvelope(response,result.data,{ meta:result.meta });
};
export const getSentPhysicalgoodsRequestsController: PhysicalgoodsHandler = async (request,response) => {
  const result = await getSentPhysicalgoodsRequests(response.locals.auth,request.query);
  sendEnvelope(response,result.data,{ meta:result.meta });
};
export const resolvePhysicalgoodsRequestController: PhysicalgoodsHandler = async (request,response) => {
  sendSuccess(response,await resolvePhysicalgoodsRequest(response.locals.auth,request.params.publicationId,request.params.requestId,request.body));
};
export const confirmPhysicalgoodsTransactionController: PhysicalgoodsHandler = async (request,response) => {
  sendSuccess(response,await transitionPhysicalgoodsTransaction(response.locals.auth,request.params.publicationId,request.params.transactionId,request.body,'CONFIRMAR'));
};
export const cancelPhysicalgoodsTransactionController: PhysicalgoodsHandler = async (request,response) => {
  sendSuccess(response,await transitionPhysicalgoodsTransaction(response.locals.auth,request.params.publicationId,request.params.transactionId,request.body,'CANCELAR'));
};
export const getPhysicalgoodsRequestOptionsController: PhysicalgoodsHandler = async (request,response) => {
  sendSuccess(response,await getPhysicalgoodsRequestOptions(response.locals.auth,request.params.publicationId));
};
export const createPhysicalgoodsRequestController: PhysicalgoodsHandler = async (request,response) => {
  sendSuccess(response,await createPhysicalgoodsRequest(response.locals.auth,request.params.publicationId,request.body),201);
};
export const updatePhysicalgoodsController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await updatePhysicalgoods(response.locals.auth, request.params.publicationId, request.body));
};
export const withdrawPhysicalgoodsController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await withdrawPhysicalgoods(response.locals.auth, request.params.publicationId, request.body));
};
export const getPhysicalgoodsResourcesController: PhysicalgoodsHandler = async (request, response) => {
  const result = await getPhysicalgoodsResources(response.locals.auth, request.query);
  sendEnvelope(response, result.data, { meta: result.meta });
};
export const getPhysicalgoodsGalleryController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await getPhysicalgoodsGallery(response.locals.auth, request.params.publicationId));
};
export const addPhysicalgoodsImageController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await addPhysicalgoodsImage(response.locals.auth, request.params.publicationId, request.body), 201);
};
export const changePhysicalgoodsPrincipalController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await changePhysicalgoodsPrincipal(response.locals.auth, request.params.publicationId, request.params.imageId));
};
export const deletePhysicalgoodsImageController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await deletePhysicalgoodsImage(response.locals.auth, request.params.publicationId, request.params.imageId));
};
export const changePhysicalgoodsCategoryController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await changePhysicalgoodsCategory(response.locals.auth, request.params.publicationId, request.body));
};
export const getPhysicalgoodsOptionsController: PhysicalgoodsHandler = async (_request, response) => {
  sendSuccess(response, await getPhysicalgoodsOptions(response.locals.auth));
};
export const createPhysicalgoodsController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await createPhysicalgoods(response.locals.auth, request.body), 201);
};
export const getPhysicalgoodsPhotoController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await getPhysicalgoodsPhoto(response.locals.auth, request.params.publicationId));
};

export const getPhysicalgoodsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getPhysicalgoodsHealth());
};
