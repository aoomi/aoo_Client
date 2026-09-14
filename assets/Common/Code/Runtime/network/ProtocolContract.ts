/** Compatibility facade. Definitions and IDs are generated from the server machine source. */
export {
    ProtocolDefinitions,
    ProtocolIds,
    type ProtocolDefinition,
    type ProtocolId,
} from './GeneratedProtocolIds';
export const protocolSucceeded = (response: { code?: number }): boolean => (response.code ?? 0) === 0;
