import {defineTool}from'../../agent/tools/contracts.mjs';
export default defineTool({name:'example.hello',description:'Retorna uma saudação estruturada sem acesso externo.',risk:'read',inputSchema:{type:'object',required:['name'],additionalProperties:false,properties:{name:{type:'string',minLength:1,maxLength:80}}},execute:({name})=>({message:`Olá, ${name}!`,source:'example.hello'})});
