#!/usr/bin/env node
/**
 * Codegen script: reads OpenAPI spec from the running Armature backend
 * and regenerates sdk/src/generated/ with typed TypeScript modules.
 *
 * Usage:
 *   ARMATURE_BASE_URL=http://localhost:3000 npm run generate
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, '../src/generated');
const MODULES_DIR = join(GENERATED_DIR, 'modules');

const BASE_URL = process.env['ARMATURE_BASE_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// OpenAPI types (subset)
// ---------------------------------------------------------------------------

interface OpenApiSpec {
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
  summary?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { content: { 'application/json': { schema: OpenApiSchemaRef } } };
  responses: Record<string, { content?: { 'application/json': { schema: OpenApiSchemaRef } } }>;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required?: boolean;
  schema?: OpenApiSchema;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  nullable?: boolean;
  properties?: Record<string, OpenApiSchemaRef>;
  required?: string[];
  items?: OpenApiSchemaRef;
  allOf?: OpenApiSchemaRef[];
  enum?: string[];
  description?: string;
}

interface OpenApiSchemaRef extends OpenApiSchema {
  $ref?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function refName(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

function schemaToTs(schema: OpenApiSchemaRef, schemas: Record<string, OpenApiSchema>, nullable = false): string {
  const suffix = nullable ? ' | null' : '';

  if (schema.$ref) return refName(schema.$ref) + suffix;

  if (schema.allOf?.length) {
    const resolved = schema.allOf[0];
    if (resolved) return schemaToTs(resolved, schemas, nullable || !!schema.nullable);
  }

  const isNullable = nullable || !!schema.nullable;
  const nullSuffix = isNullable ? ' | null' : '';

  switch (schema.type) {
    case 'string':
      if (schema.enum) return schema.enum.map(v => `'${v}'`).join(' | ') + nullSuffix;
      if (schema.format === 'date-time') return 'string' + nullSuffix;
      return 'string' + nullSuffix;
    case 'number':
    case 'integer':
      return 'number' + nullSuffix;
    case 'boolean':
      return 'boolean' + nullSuffix;
    case 'array':
      if (schema.items) return `${schemaToTs(schema.items, schemas)}[]` + nullSuffix;
      return 'unknown[]' + nullSuffix;
    case 'object':
      return `Record<string, unknown>${nullSuffix}`;
    default:
      return 'unknown' + suffix;
  }
}

function generateInterface(name: string, schema: OpenApiSchema, schemas: Record<string, OpenApiSchema>): string {
  if (schema.type !== 'object' || !schema.properties) {
    return `export type ${name} = ${schemaToTs(schema, schemas)};\n`;
  }

  const required = new Set(schema.required ?? []);
  const props = Object.entries(schema.properties)
    .map(([key, propSchema]) => {
      const isRequired = required.has(key);
      const isNullable = !!propSchema.nullable;
      const tsType = schemaToTs(propSchema, schemas, isNullable);
      return `  ${key}${isRequired ? '' : '?'}: ${tsType};`;
    })
    .join('\n');

  return `export interface ${name} {\n${props}\n}\n`;
}

// ---------------------------------------------------------------------------
// Method generation per tag
// ---------------------------------------------------------------------------

interface MethodDef {
  name: string;
  httpMethod: string;
  path: string;
  summary: string;
  pathParams: string[];
  queryParams: OpenApiParameter[];
  bodyType: string | null;
  returnType: string;
  isPublic: boolean;
}

function operationIdToMethodName(operationId: string, tag: string): string {
  const tagLower = tag.toLowerCase();
  let name = operationId
    .replace(new RegExp(`^${tagLower}_?`, 'i'), '')
    .replace(/_([a-z])/g, (_, c: string) => (c as string).toUpperCase());
  name = name.charAt(0).toLowerCase() + name.slice(1);
  return name || operationId;
}

function getReturnType(operation: OpenApiOperation): string {
  const successResponse = operation.responses['200'] ?? operation.responses['201'];
  if (!successResponse) return 'void';
  const schema = successResponse.content?.['application/json']?.schema;
  if (!schema) return 'void';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === 'array' && schema.items?.$ref) return `${refName(schema.items.$ref)}[]`;
  return 'unknown';
}

function getBodyType(operation: OpenApiOperation): string | null {
  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  if (!bodySchema) return null;
  if (bodySchema.$ref) return refName(bodySchema.$ref);
  return 'Record<string, unknown>';
}

function buildMethodDefs(
  tag: string,
  paths: Record<string, Record<string, OpenApiOperation>>,
): MethodDef[] {
  const methods: MethodDef[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [httpMethod, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(httpMethod)) continue;
      if (!operation.tags?.some(t => t.toLowerCase() === tag.toLowerCase())) continue;

      const pathParams = (operation.parameters ?? [])
        .filter(p => p.in === 'path')
        .map(p => p.name);

      const queryParams = (operation.parameters ?? []).filter(p => p.in === 'query');

      const operationId = operation.operationId ?? `${httpMethod}_${path.replace(/\//g, '_')}`;
      const methodName = operationIdToMethodName(operationId, tag);

      methods.push({
        name: methodName,
        httpMethod,
        path,
        summary: operation.summary ?? '',
        pathParams,
        queryParams,
        bodyType: getBodyType(operation),
        returnType: getReturnType(operation),
        isPublic: !path.includes('/api/auth/me') && !path.includes('/api/resources'),
      });
    }
  }

  return methods;
}

function renderMethod(m: MethodDef): string {
  const args: string[] = [];

  for (const param of m.pathParams) {
    args.push(`${param}: string`);
  }

  if (m.bodyType) {
    const argName = m.httpMethod === 'patch' ? 'body' : 'body';
    args.push(`${argName}: ${m.bodyType}`);
  }

  if (m.queryParams.length > 0) {
    const queryFields = m.queryParams
      .map(p => {
        const tsType = p.schema?.type === 'integer' ? 'number' : (p.schema?.type ?? 'string');
        return `${p.name}?: ${tsType}`;
      })
      .join('; ');
    args.push(`query?: { ${queryFields} }`);
  }

  const returnTypeFull = m.returnType === 'void' ? 'Promise<void>' : `Promise<${m.returnType}>`;

  let pathExpr = `\`${m.path.replace(/{(\w+)}/g, '${$1}')}\``;

  let body = '';

  if (m.queryParams.length > 0) {
    body += `    const params = new URLSearchParams();\n`;
    for (const qp of m.queryParams) {
      body += `    if (query?.${qp.name} !== undefined) params.set('${qp.name}', String(query.${qp.name}));\n`;
    }
    body += `    const queryString = params.toString();\n`;
    pathExpr = `queryString ? \`${m.path.replace(/{(\w+)}/g, '${$1}')}?\${queryString}\` : \`${m.path.replace(/{(\w+)}/g, '${$1}')}\``;
  }

  const skipAuth = m.isPublic ? ', true' : '';
  const httpArgs = m.bodyType ? `, ${m.httpMethod === 'get' || m.httpMethod === 'delete' ? '' : 'body'}` : '';

  switch (m.httpMethod) {
    case 'get':
      body += `    return this.http.get<${m.returnType}>(${pathExpr});`;
      break;
    case 'post':
      body += `    return this.http.post<${m.returnType}>(${pathExpr}${httpArgs}${skipAuth});`;
      break;
    case 'patch':
      body += `    return this.http.patch<${m.returnType}>(${pathExpr}${httpArgs});`;
      break;
    case 'put':
      throw new Error(`PUT operations are not supported by the generated HttpClient: ${m.name} (${m.path})`);
    case 'delete':
      body += `    return this.http.delete<void>(${pathExpr});`;
      break;
  }

  const sig = `  ${m.name}(${args.join(', ')}): ${returnTypeFull}`;

  return `${sig} {\n${body}\n  }`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tagToClassName(tag: string): string {
  return `${capitalize(tag)}Module`;
}

function tagToFileName(tag: string): string {
  return tag.toLowerCase();
}

// ---------------------------------------------------------------------------
// Schema filtering
// ---------------------------------------------------------------------------

function schemasUsedByTag(
  tag: string,
  paths: Record<string, Record<string, OpenApiOperation>>,
  allSchemas: Record<string, OpenApiSchema>,
): Set<string> {
  const used = new Set<string>();

  function collect(schema: OpenApiSchemaRef) {
    if (schema.$ref) {
      const name = refName(schema.$ref);
      if (!used.has(name)) {
        used.add(name);
        const s = allSchemas[name];
        if (s?.properties) Object.values(s.properties).forEach(collect);
        if (s?.items) collect(s.items);
      }
    }
    if (schema.properties) Object.values(schema.properties).forEach(collect);
    if (schema.items) collect(schema.items);
    if (schema.allOf) schema.allOf.forEach(collect);
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [, operation] of Object.entries(pathItem)) {
      if (!operation.tags?.some(t => t.toLowerCase() === tag.toLowerCase())) continue;
      if (operation.requestBody) collect(operation.requestBody.content['application/json']?.schema ?? {});
      for (const response of Object.values(operation.responses)) {
        collect(response.content?.['application/json']?.schema ?? {});
      }
    }
  }

  return used;
}

// ---------------------------------------------------------------------------
// File generators
// ---------------------------------------------------------------------------

function generateSchemaFile(schemas: Record<string, OpenApiSchema>): string {
  const lines = ['// AUTO-GENERATED — do not edit. Run `npm run generate` to update.\n'];
  for (const [name, schema] of Object.entries(schemas)) {
    lines.push(generateInterface(name, schema, schemas));
  }
  return lines.join('\n');
}

function generateModuleFile(
  tag: string,
  methods: MethodDef[],
  usedSchemas: Set<string>,
  allSchemas: Record<string, OpenApiSchema>,
): string {
  const className = tagToClassName(tag);
  const isAuth = tag.toLowerCase() === 'auth';

  const schemaImports = [...usedSchemas].filter(s => allSchemas[s]);
  const schemaImportLine = schemaImports.length
    ? `import type {\n${schemaImports.map(s => `  ${s},`).join('\n')}\n} from '../schema.js';`
    : '';

  const coreImports = [`import type { HttpClient } from '../../http.js';`];

  if (methods.some(m => m.queryParams.length > 0)) {
    coreImports.push(`import type { PaginatedResponse, PaginationQuery } from '../../types.js';`);
  }

  let classHead = `export class ${className}`;
  let ctorArgs = 'private readonly http: HttpClient';
  let ctorBody = '';

  if (isAuth) {
    coreImports.push(`import { AuthOAuthMixin } from '../../modules/auth-oauth.js';`);
    classHead += ' extends AuthOAuthMixin';
    ctorArgs = 'http: HttpClient, baseUrl: string';
    ctorBody = '    super(http, baseUrl);';
  }

  const renderedMethods = methods.map(renderMethod).join('\n\n');

  return `// AUTO-GENERATED — do not edit. Run \`npm run generate\` to update.

${coreImports.join('\n')}
${schemaImportLine}

${classHead} {
  constructor(${ctorArgs}) {
${ctorBody || `    this.http = http;`}
  }

${renderedMethods}
}
`;
}

function generateIndexFile(tags: string[]): string {
  const lines = ['// AUTO-GENERATED — do not edit. Run `npm run generate` to update.\n'];
  lines.push("export * from './schema.js';");
  for (const tag of tags) {
    lines.push(`export * from './modules/${tagToFileName(tag)}.js';`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Fetching OpenAPI spec from ${BASE_URL}/api/docs-json ...`);

  let spec: OpenApiSpec;
  try {
    const res = await fetch(`${BASE_URL}/api/docs-json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = (await res.json()) as OpenApiSpec;
  } catch (err) {
    console.error('Could not fetch OpenAPI spec. Is the backend running?');
    console.error(err);
    process.exit(1);
  }

  const allSchemas = spec.components?.schemas ?? {};
  const allTags = (spec.tags ?? []).map(t => t.name);

  // Discover tags that actually have paths
  const activeTags = allTags.filter(tag =>
    Object.values(spec.paths).some(pathItem =>
      Object.values(pathItem).some(op => op.tags?.includes(tag)),
    ),
  );

  mkdirSync(MODULES_DIR, { recursive: true });

  // Generate schema.ts
  writeFileSync(join(GENERATED_DIR, 'schema.ts'), generateSchemaFile(allSchemas));
  console.log('  ✓ schema.ts');

  // Generate one module per tag
  for (const tag of activeTags) {
    const methods = buildMethodDefs(tag, spec.paths);
    const usedSchemas = schemasUsedByTag(tag, spec.paths, allSchemas);
    const content = generateModuleFile(tag, methods, usedSchemas, allSchemas);
    const fileName = `${tagToFileName(tag)}.ts`;
    writeFileSync(join(MODULES_DIR, fileName), content);
    console.log(`  ✓ modules/${fileName} (${methods.length} method${methods.length === 1 ? '' : 's'})`);
  }

  // Generate index.ts
  writeFileSync(join(GENERATED_DIR, 'index.ts'), generateIndexFile(activeTags));
  console.log('  ✓ index.ts');

  console.log(`\nDone — ${activeTags.length} module(s) generated: ${activeTags.join(', ')}`);
}

void main();
