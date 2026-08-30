import { validateSchema } from '../tools/contracts.mjs';
import { createNexoError, ERROR_CATEGORIES, normalizeErrorCategory } from '../contracts/errors.mjs';

export const CAPABILITY_TYPES=Object.freeze(['TOOL','SKILL','MCP','PROVIDER','WORKFLOW','CONNECTOR']);
export const CAPABILITY_STATUS=Object.freeze(['AVAILABLE','DEGRADED','UNAVAILABLE','MISCONFIGURED']);
export const TRUST_LEVELS=Object.freeze(['BUILT_IN','TRUSTED','LOCAL','UNVERIFIED']);
export const ERROR_KINDS=ERROR_CATEGORIES;
export function defineCapability(input){if(!input?.id||!CAPABILITY_TYPES.includes(input.type))throw new Error('Capability inválida.');if(!input.name||!input.version)throw new Error(`Capability ${input.id} sem nome/versão.`);return Object.freeze({provider:'nexo',description:'',inputs:{type:'object'},outputs:{type:'object'},permissions:[],risk:'read',status:'AVAILABLE',health:{},trust:'LOCAL',quality:.5,latency:1,enabled:true,lazy:true,...input});}
export function defineConnector(input){if(typeof input?.execute!=='function')throw new Error('Connector precisa de execute().');return defineCapability({...input,type:'CONNECTOR'});}
export function defineProvider(input){return defineCapability({...input,type:'PROVIDER'});}
export function validateCapabilityInput(capability,input){return validateSchema(input||{},capability.inputs,capability.id);}
export function capabilityError(kind,message,details={}){const category=normalizeErrorCategory(kind);return createNexoError({code:`CAPABILITY_${String(kind||category).toUpperCase()}`,category,message,details});}
