import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

export function createDebuggingEngine({ database }) {
  function record({ taskId, hypothesis, evidenceFor = [], evidenceAgainst = [], experiment = '', confidence = 0.5 }) { return database.putHypothesis({ taskId, hypothesis, evidenceFor, evidenceAgainst, experiment, confidence, status: 'OPEN' }); }
  function resolve({ id, outcome, status }) { return database.updateHypothesis(id, { outcome, status }); }
  return { record, resolve, list: database.listHypotheses,
    definitions: [
      defineTool({ name: 'debug.hypothesis', description: 'Registra hipótese de causa, evidências e experimento antes de modificar código.', risk: RISK.READ, inputSchema: { type: 'object', required: ['taskId', 'hypothesis', 'experiment'], additionalProperties: false, properties: { taskId: { type: 'string', minLength: 10, maxLength: 100 }, hypothesis: { type: 'string', minLength: 5, maxLength: 1200 }, evidenceFor: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 1000 } }, evidenceAgainst: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 1000 } }, experiment: { type: 'string', minLength: 3, maxLength: 1200 }, confidence: { type: 'number', minimum: 0, maximum: 1 } } }, execute: record }),
      defineTool({ name: 'debug.resolve', description: 'Fecha uma hipótese com o resultado observado do experimento.', risk: RISK.READ, inputSchema: { type: 'object', required: ['id', 'outcome', 'status'], additionalProperties: false, properties: { id: { type: 'string', minLength: 10, maxLength: 100 }, outcome: { type: 'string', minLength: 3, maxLength: 2000 }, status: { type: 'string', enum: ['CONFIRMED', 'REJECTED', 'INCONCLUSIVE'] } } }, execute: resolve }),
    ], health: () => ({ hypothesisDriven: true, persistent: true }) };
}
