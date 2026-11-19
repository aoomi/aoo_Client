#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name}=REQUIRED`);
  return process.argv[index + 1];
}

const input = option('--input');
const output = option('--output');
const bytes = await readFile(input);
const registrySha256 = createHash('sha256').update(bytes).digest('hex');
const registry = JSON.parse(bytes.toString('utf8'));
const rows = Array.isArray(registry.rows) ? registry.rows : [];
if (registry.manifestKind !== 'canonical-identity-runtime-registry' || registry.schemaVersion !== 1) {
  throw new Error('IDENTITY_REGISTRY_KIND_OR_SCHEMA_INVALID');
}
if (rows.length !== 32) throw new Error(`IDENTITY_REGISTRY_ROW_COUNT_INVALID rows=${rows.length}`);
const seen = new Set();
for (const row of rows) {
  for (const field of registry.requiredFields ?? []) {
    if (!(field in row)) throw new Error(`IDENTITY_REGISTRY_FIELD_MISSING gameId=${row.gameId} field=${field}`);
  }
  if (seen.has(row.gameId) || row.gameId === 516) throw new Error(`IDENTITY_REGISTRY_ID_INVALID gameId=${row.gameId}`);
  seen.add(row.gameId);
  if (typeof row.clientRuntimeEntry !== 'string' || row.clientRuntimeEntry.trim() === '') {
    throw new Error(`IDENTITY_REGISTRY_CLIENT_ENTRY_MISSING gameId=${row.gameId}`);
  }
  if (row.providerKey !== null && (typeof row.providerKey !== 'string' || row.providerKey.trim() === '')) {
    throw new Error(`IDENTITY_REGISTRY_PROVIDER_KEY_INVALID gameId=${row.gameId}`);
  }
  if (row.contractVersion === 'compatibility-v1') throw new Error(`IDENTITY_REGISTRY_COMPATIBILITY_CONTRACT gameId=${row.gameId}`);
  if (row.contractVersion === null && !row.failureCodes?.includes('CONTRACT_VERSION_MISSING_FROM_FORMAL_RELEASE_SOURCE')) {
    throw new Error(`IDENTITY_REGISTRY_CONTRACT_FAILURE_CODE_MISSING gameId=${row.gameId}`);
  }
}

const literal = value => JSON.stringify(value);
const bindingLiteral = row => `  Object.freeze({gameId:${row.gameId},gameCode:${literal(row.gameCode)},family:${literal(row.family)},playVersion:${literal(row.playVersion)},regionCode:${literal(row.regionCode)},providerKey:${literal(row.providerKey)},clientRuntimeEntry:${literal(row.clientRuntimeEntry)},contractVersion:${literal(row.contractVersion)},status:${literal(row.status)},failureCodes:Object.freeze(${literal(row.failureCodes ?? [])})})`;
const content = `/* GENERATED FILE. Source: explicit signed canonical identity registry. Do not hand edit. */
export type CanonicalIdentityRuntimeStatus = 'CONSUMABLE' | 'FAIL_CLOSED';

export interface CanonicalRuntimeMetadataBinding {
    readonly gameId: number;
    readonly gameCode: string;
    readonly family: string;
    readonly playVersion: string;
    readonly regionCode: string;
    readonly providerKey: string | null;
    readonly clientRuntimeEntry: string;
    readonly contractVersion: string | null;
    readonly status: CanonicalIdentityRuntimeStatus;
    readonly failureCodes: readonly string[];
}

export const CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256 = ${literal(registrySha256)} as const;
export const CANONICAL_RUNTIME_METADATA_RELEASE_EDITION = ${literal(registry.releaseEdition)} as const;
export const CANONICAL_RUNTIME_METADATA_BINDINGS: readonly CanonicalRuntimeMetadataBinding[] = Object.freeze([
${rows.map(bindingLiteral).join(',\n')}
]);

const BY_GAME_ID = new Map(CANONICAL_RUNTIME_METADATA_BINDINGS.map(binding => [binding.gameId, binding]));

export interface CanonicalIdentityProjection {
    readonly serverDescriptor: CanonicalRuntimeMetadataBinding;
    readonly provider: CanonicalRuntimeMetadataBinding;
    readonly lobby: CanonicalRuntimeMetadataBinding;
    readonly gateway: CanonicalRuntimeMetadataBinding;
    readonly client: CanonicalRuntimeMetadataBinding;
}

export function requireCanonicalRuntimeMetadata(gameId: number, gameCode: string, family: string, playVersion: string, regionCode: string): CanonicalRuntimeMetadataBinding {
    if (gameId === 516) throw new Error('IDENTITY_CONTRACT_COMPATIBILITY_IDENTITY');
    const binding = BY_GAME_ID.get(gameId);
    if (!binding || binding.gameCode !== gameCode || binding.family !== family
        || binding.playVersion !== playVersion || binding.regionCode !== regionCode) {
        throw new Error('IDENTITY_CONTRACT_PROJECTION_MISMATCH gameId=' + gameId);
    }
    if (binding.status !== 'CONSUMABLE' || binding.providerKey === null || binding.contractVersion === null) {
        throw new Error('IDENTITY_CONTRACT_PROJECTION_FAIL_CLOSED gameId=' + gameId + ' reasons=' + binding.failureCodes.join(','));
    }
    return binding;
}

export function projectCanonicalIdentity(binding: CanonicalRuntimeMetadataBinding): CanonicalIdentityProjection {
    return Object.freeze({serverDescriptor: binding, provider: binding, lobby: binding, gateway: binding, client: binding});
}

export function assertCanonicalManifest(expectedSha256: string, expectedEdition: string): void {
    if (expectedSha256 !== CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256) throw new Error('IDENTITY_CONTRACT_MANIFEST_SHA_MISMATCH');
    if (expectedEdition !== CANONICAL_RUNTIME_METADATA_RELEASE_EDITION) throw new Error('IDENTITY_CONTRACT_MANIFEST_EDITION_MISMATCH');
}
`;

// Catalog projection uses the same explicit registry identity input.
let catalogProjection = null;
const optionalOption = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const catalogInput = optionalOption('--catalog-input');
const presentationInput = optionalOption('--presentation-input');
const catalogOutput = optionalOption('--catalog-output');
if ([catalogInput, presentationInput, catalogOutput].some(Boolean)) {
  if (![catalogInput, presentationInput, catalogOutput].every(Boolean)) throw new Error('CATALOG_OPTIONS_INCOMPLETE');
  const catalogBytes = await readFile(catalogInput);
  const presentationBytes = await readFile(presentationInput);
  const catalogLines = catalogBytes.toString('utf8').trimEnd().split(/\r?\n/);
  const headers = catalogLines.shift().split('\t');
  const requiredHeaders = ['gameId','code','displayName','category','family','regionScope','provinceCode','cityCode','version','enabled','sourceModule'];
  if (JSON.stringify(headers) !== JSON.stringify(requiredHeaders)) throw new Error('CATALOG_HEADER_INVALID');
  const catalogRows = catalogLines.map(line => {
    const values = line.split('\t');
    if (values.length !== headers.length) throw new Error('CATALOG_COLUMN_COUNT_INVALID');
    return Object.fromEntries(headers.map((key,index) => [key,values[index]]));
  });
  const presentation = JSON.parse(presentationBytes.toString('utf8'));
  const presentationKeys = ['schemaVersion','provenance','regionConfigByCode','capabilityDefaults','capabilityOverrides'];
  if (presentation.schemaVersion !== 1 || Object.keys(presentation).some(key => !presentationKeys.includes(key))) throw new Error('PRESENTATION_SCHEMA_INVALID');
  const capabilityKeys = ['supportsSettings','supportsChat','supportsVoice','supportsDissolve'];
  const verifyCapabilities = value => {
    if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...capabilityKeys].sort()) || capabilityKeys.some(key => typeof value[key] !== 'boolean')) throw new Error('PRESENTATION_CAPABILITIES_INVALID');
  };
  verifyCapabilities(presentation.capabilityDefaults);
  const catalogByCode = new Map(), catalogIds = new Set();
  for (const row of catalogRows) {
    if (!/^[1-9][0-9]*$/.test(row.gameId) || catalogByCode.has(row.code) || catalogIds.has(Number(row.gameId))) throw new Error('CATALOG_IDENTITY_DUPLICATE_OR_INVALID');
    if (!['MAHJONG','POKER','LONG_CARD','WORD_CARD'].includes(row.category) || !['0','1'].includes(row.enabled)) throw new Error('CATALOG_METADATA_INVALID');
    if (typeof presentation.regionConfigByCode?.[row.code] !== 'string') throw new Error('PRESENTATION_REGION_MISSING');
    catalogByCode.set(row.code,row); catalogIds.add(Number(row.gameId));
  }
  if (catalogRows.length !== 557 || Object.keys(presentation.regionConfigByCode).length !== catalogRows.length || Object.keys(presentation.regionConfigByCode).some(code => !catalogByCode.has(code))) throw new Error('CATALOG_PRESENTATION_CODE_SET_INVALID');
  for (const [code,value] of Object.entries(presentation.capabilityOverrides ?? {})) {
    if (!catalogByCode.has(code)) throw new Error('PRESENTATION_CAPABILITY_CODE_UNKNOWN');
    verifyCapabilities(value);
  }
  for (const row of rows) {
    const catalog = catalogByCode.get(row.gameCode);
    if (!catalog || Number(catalog.gameId) !== row.gameId || catalog.family !== row.family || catalog.version !== row.playVersion) throw new Error('CATALOG_CANONICAL_IDENTITY_MISMATCH gameId=' + row.gameId);
  }
  const catalogSha256 = createHash('sha256').update(catalogBytes).digest('hex');
  const presentationSha256 = createHash('sha256').update(presentationBytes).digest('hex');
  const flags = value => '{' + capabilityKeys.map(key => key + ':' + value[key]).join(',') + '}';
  const catalogContent = "import{FamilyRuntimeRegistry,type GameCapabilities,type RegionRuntimeBinding}from './FamilyRuntimeRegistry';\n"
    + '/** GENERATED from canonical registry ' + registrySha256 + '; catalog ' + catalogSha256 + '; presentation ' + presentationSha256 + '. Do not hand edit. */\n'
    + 'export const CATALOG_FAMILY_BINDINGS:readonly RegionRuntimeBinding[]=Object.freeze([\n'
    + catalogRows.map(row => ' {code:' + literal(row.code) + ',family:' + literal(row.family) + ',regionConfig:' + literal(presentation.regionConfigByCode[row.code]) + '},').join('\n')
    + '\n]);\n'
    + "export interface CatalogGameMetadata{readonly gameId:number;readonly displayName:string;readonly category:'MAHJONG'|'POKER'|'LONG_CARD'|'WORD_CARD';readonly enabled:boolean;}\n"
    + 'export const CATALOG_GAME_METADATA:Readonly<Record<string,CatalogGameMetadata>>=Object.freeze({\n'
    + catalogRows.map(row => ' ' + literal(row.code) + ':{gameId:' + row.gameId + ',displayName:' + literal(row.displayName) + ',category:' + literal(row.category) + ',enabled:' + (row.enabled === '1') + '},').join('\n')
    + '\n});\n'
    + 'const DISABLED_GAME_CAPABILITIES:Readonly<GameCapabilities>=Object.freeze(' + flags(presentation.capabilityDefaults) + ');\n'
    + 'const PDK_GAME_CAPABILITIES:Readonly<GameCapabilities>=Object.freeze(' + flags(Object.fromEntries(capabilityKeys.map(key => [key,true]))) + ');\n'
    + 'export const CATALOG_GAME_CAPABILITIES:Readonly<Record<string,GameCapabilities>>=Object.freeze({' + Object.entries(presentation.capabilityOverrides).map(([code,value]) => (capabilityKeys.every(key => value[key]) && /^[a-z][a-z0-9]*$/.test(code)) ? code + ':PDK_GAME_CAPABILITIES' : literal(code) + ':Object.freeze(' + flags(value) + ')').join(',') + '});\n'
    + "export function getCatalogGameMetadata(gameCode:string):CatalogGameMetadata|undefined{return CATALOG_GAME_METADATA[gameCode];}\nexport function getGameCapabilities(gameCode:string):GameCapabilities{return CATALOG_GAME_CAPABILITIES[gameCode]??DISABLED_GAME_CAPABILITIES;}\nexport function populateAuthoritativeGameNames(target:Map<number,string>):void{target.clear();for(const binding of CATALOG_FAMILY_BINDINGS){const metadata=getCatalogGameMetadata(binding.code);if(metadata?.enabled)target.set(metadata.gameId,metadata.displayName);}}\nexport const FAMILY_RUNTIME_REGISTRY=CATALOG_FAMILY_BINDINGS.filter(binding=>binding.family!=='UNCLASSIFIED_MISSING_SOURCE').reduce((registry,binding)=>registry.register(binding),new FamilyRuntimeRegistry());" + '\n';
  catalogProjection = {catalogOutput,catalogContent,rows:catalogRows.length,catalogSha256,presentationSha256};
}

await mkdir(dirname(resolve(output)), { recursive: true });
const temporary = `${output}.tmp.${process.pid}`;
await writeFile(temporary, content, 'utf8');
await rename(temporary, output);
const failClosedRows = rows.filter(row => row.status === 'FAIL_CLOSED').length;
process.stdout.write(JSON.stringify({ ok: true, output, rows: rows.length, failClosedRows, registrySha256 }) + '\n');


if (catalogProjection) {
  const {catalogOutput,catalogContent,rows,catalogSha256,presentationSha256} = catalogProjection;
  await mkdir(dirname(resolve(catalogOutput)),{recursive:true});
  const catalogTemporary = catalogOutput + '.tmp.' + process.pid;
  await writeFile(catalogTemporary,catalogContent,'utf8');
  await rename(catalogTemporary,catalogOutput);
  process.stdout.write(JSON.stringify({ok:true,catalogOutput,rows,registrySha256,catalogSha256,presentationSha256}) + '\n');
}
