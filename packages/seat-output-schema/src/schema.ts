/**
 * Seat output schema — a closed, minimal schema language for machine-checkable
 * seat outputs (OMP→MAD Evolve Pack v0, Lane A, Founder act of 2026-09-13).
 *
 * Deliberately NOT JSON Schema and NOT a vendored validator: no `$ref`, no
 * `oneOf`, no format registry, no third-party dependency (the lockfile is
 * pinned by AE-01 T18 and no dependency may be added). The language is small
 * enough that its own well-formedness is checked before any output is judged
 * against it. A malformed schema is a verdict-shaped hole — it is refused by
 * `checkSchema`, never treated as "accepts anything".
 *
 * Evolved from the OMP mechanism named in the act ("outputSchema on spawned
 * agent results"); the language, its bounds, and the fail-closed
 * well-formedness pass are this repository's own.
 */

export interface StringSchema {
  readonly type: 'string';
  /** A `u`-flag ECMAScript pattern, compiled once at `checkSchema` time. */
  readonly pattern?: string;
  readonly min_length?: number;
  readonly max_length?: number;
  readonly enum?: readonly string[];
}

export interface IntegerSchema {
  readonly type: 'integer';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface NumberSchema {
  readonly type: 'number';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface BooleanSchema {
  readonly type: 'boolean';
  /** Pins the value — used to make a claim unassertable (e.g. `production: false`). */
  readonly const?: boolean;
}

export interface NullSchema {
  readonly type: 'null';
}

export interface ArraySchema {
  readonly type: 'array';
  readonly items: OutputSchema;
  readonly min_items?: number;
  readonly max_items?: number;
}

export interface ObjectSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, OutputSchema>>;
  readonly required: readonly string[];
  /** `false` makes an unlisted key a violation; there is no default. */
  readonly additional_properties: boolean;
}

export type OutputSchema =
  | StringSchema
  | IntegerSchema
  | NumberSchema
  | BooleanSchema
  | NullSchema
  | ArraySchema
  | ObjectSchema;

export const SCHEMA_TYPES = ['string', 'integer', 'number', 'boolean', 'null', 'array', 'object'] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

/** Nesting bound for both schemas and the values judged against them. */
export const MAX_SCHEMA_DEPTH = 32;
/** Pattern source bound — a pattern is data from a handoff author, not trusted code. */
export const MAX_PATTERN_LENGTH = 512;

export type ViolationCode =
  | 'type_mismatch'
  | 'required_missing'
  | 'additional_property'
  | 'pattern_mismatch'
  | 'enum_mismatch'
  | 'length'
  | 'range'
  | 'const_mismatch'
  | 'depth_exceeded';

export interface Violation {
  /** JSON-pointer-like path from the output root; `''` is the root itself. */
  readonly path: string;
  readonly code: ViolationCode;
  readonly message: string;
}

export interface SchemaDefect {
  readonly path: string;
  readonly message: string;
}

const KNOWN_KEYS: Readonly<Record<SchemaType, readonly string[]>> = {
  string: ['type', 'pattern', 'min_length', 'max_length', 'enum'],
  integer: ['type', 'minimum', 'maximum'],
  number: ['type', 'minimum', 'maximum'],
  boolean: ['type', 'const'],
  null: ['type'],
  array: ['type', 'items', 'min_items', 'max_items'],
  object: ['type', 'properties', 'required', 'additional_properties'],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Well-formedness of a schema value. Returns every defect found; an empty
 * array means the value is a valid `OutputSchema`. This runs before any
 * output is validated, so a defective schema can never yield a verdict.
 */
export function checkSchema(schema: unknown): SchemaDefect[] {
  const defects: SchemaDefect[] = [];
  walkSchema(schema, '', 0, defects);
  return defects;
}

function walkSchema(schema: unknown, path: string, depth: number, defects: SchemaDefect[]): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    defects.push({ path, message: `schema nesting exceeds ${MAX_SCHEMA_DEPTH}` });
    return;
  }
  if (!isPlainObject(schema)) {
    defects.push({ path, message: 'schema must be a plain object' });
    return;
  }
  const type = schema.type;
  if (typeof type !== 'string' || !(SCHEMA_TYPES as readonly string[]).includes(type)) {
    defects.push({ path, message: `type must be one of ${SCHEMA_TYPES.join(', ')}, got ${JSON.stringify(type)}` });
    return;
  }
  const known = KNOWN_KEYS[type as SchemaType];
  for (const key of Object.keys(schema)) {
    if (!known.includes(key)) {
      defects.push({ path, message: `unknown key ${JSON.stringify(key)} for type ${type}` });
    }
  }
  switch (type as SchemaType) {
    case 'string': {
      if (schema.pattern !== undefined) {
        if (typeof schema.pattern !== 'string') {
          defects.push({ path, message: 'pattern must be a string' });
        } else if (schema.pattern.length > MAX_PATTERN_LENGTH) {
          defects.push({ path, message: `pattern exceeds ${MAX_PATTERN_LENGTH} characters` });
        } else {
          try {
            new RegExp(schema.pattern, 'u');
          } catch (error) {
            defects.push({ path, message: `pattern does not compile: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
      }
      if (schema.min_length !== undefined && !isNonNegativeInteger(schema.min_length)) {
        defects.push({ path, message: 'min_length must be a non-negative integer' });
      }
      if (schema.max_length !== undefined && !isNonNegativeInteger(schema.max_length)) {
        defects.push({ path, message: 'max_length must be a non-negative integer' });
      }
      if (
        isNonNegativeInteger(schema.min_length) &&
        isNonNegativeInteger(schema.max_length) &&
        schema.min_length > schema.max_length
      ) {
        defects.push({ path, message: 'min_length exceeds max_length' });
      }
      if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
          defects.push({ path, message: 'enum must be a non-empty array' });
        } else if (!schema.enum.every((member) => typeof member === 'string')) {
          defects.push({ path, message: 'enum members must be strings' });
        }
      }
      return;
    }
    case 'integer':
    case 'number': {
      if (schema.minimum !== undefined && !isFiniteNumber(schema.minimum)) {
        defects.push({ path, message: 'minimum must be a finite number' });
      }
      if (schema.maximum !== undefined && !isFiniteNumber(schema.maximum)) {
        defects.push({ path, message: 'maximum must be a finite number' });
      }
      if (isFiniteNumber(schema.minimum) && isFiniteNumber(schema.maximum) && schema.minimum > schema.maximum) {
        defects.push({ path, message: 'minimum exceeds maximum' });
      }
      return;
    }
    case 'boolean': {
      if (schema.const !== undefined && typeof schema.const !== 'boolean') {
        defects.push({ path, message: 'const must be a boolean' });
      }
      return;
    }
    case 'null':
      return;
    case 'array': {
      if (schema.min_items !== undefined && !isNonNegativeInteger(schema.min_items)) {
        defects.push({ path, message: 'min_items must be a non-negative integer' });
      }
      if (schema.max_items !== undefined && !isNonNegativeInteger(schema.max_items)) {
        defects.push({ path, message: 'max_items must be a non-negative integer' });
      }
      if (isNonNegativeInteger(schema.min_items) && isNonNegativeInteger(schema.max_items) && schema.min_items > schema.max_items) {
        defects.push({ path, message: 'min_items exceeds max_items' });
      }
      if (schema.items === undefined) {
        defects.push({ path, message: 'array schema requires items' });
      } else {
        walkSchema(schema.items, `${path}/items`, depth + 1, defects);
      }
      return;
    }
    case 'object': {
      if (!isPlainObject(schema.properties)) {
        defects.push({ path, message: 'object schema requires a properties map' });
      }
      if (!Array.isArray(schema.required) || !schema.required.every((key) => typeof key === 'string')) {
        defects.push({ path, message: 'object schema requires a required list of strings' });
      }
      if (typeof schema.additional_properties !== 'boolean') {
        defects.push({ path, message: 'object schema requires additional_properties: true | false (no default)' });
      }
      if (isPlainObject(schema.properties)) {
        for (const [key, child] of Object.entries(schema.properties)) {
          walkSchema(child, `${path}/properties/${key}`, depth + 1, defects);
        }
        if (Array.isArray(schema.required)) {
          for (const key of schema.required) {
            if (typeof key === 'string' && !(key in schema.properties)) {
              defects.push({ path, message: `required key ${JSON.stringify(key)} is not declared in properties` });
            }
          }
        }
      }
      return;
    }
    default: {
      const exhaust: never = type as never;
      defects.push({ path, message: `unreachable schema type ${String(exhaust)}` });
    }
  }
}

/**
 * Judge `value` against a schema that has already passed `checkSchema`.
 * Returns every violation found, in document order; an empty array means the
 * value conforms. This function never throws on any `value`.
 *
 * Callers must run `checkSchema` first: this function assumes structural
 * well-formedness and treats a malformed schema node as a type mismatch on
 * the value, which is the fail-closed direction.
 */
export function validateOutput(schema: OutputSchema, value: unknown): Violation[] {
  const violations: Violation[] = [];
  walkValue(schema, value, '', 0, violations);
  return violations;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function walkValue(schema: OutputSchema, value: unknown, path: string, depth: number, out: Violation[]): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    out.push({ path, code: 'depth_exceeded', message: `value nesting exceeds ${MAX_SCHEMA_DEPTH}` });
    return;
  }
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') {
        out.push({ path, code: 'type_mismatch', message: `expected string, got ${describe(value)}` });
        return;
      }
      if (schema.min_length !== undefined && value.length < schema.min_length) {
        out.push({ path, code: 'length', message: `length ${value.length} is below min_length ${schema.min_length}` });
      }
      if (schema.max_length !== undefined && value.length > schema.max_length) {
        out.push({ path, code: 'length', message: `length ${value.length} exceeds max_length ${schema.max_length}` });
      }
      if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
        out.push({ path, code: 'pattern_mismatch', message: `value does not match pattern ${schema.pattern}` });
      }
      if (schema.enum !== undefined && !schema.enum.includes(value)) {
        out.push({ path, code: 'enum_mismatch', message: `value is not one of ${schema.enum.map((m) => JSON.stringify(m)).join(', ')}` });
      }
      return;
    }
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        out.push({ path, code: 'type_mismatch', message: `expected finite ${schema.type}, got ${describe(value)}` });
        return;
      }
      if (schema.type === 'integer' && !Number.isInteger(value)) {
        out.push({ path, code: 'type_mismatch', message: `expected integer, got ${value}` });
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        out.push({ path, code: 'range', message: `${value} is below minimum ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        out.push({ path, code: 'range', message: `${value} exceeds maximum ${schema.maximum}` });
      }
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        out.push({ path, code: 'type_mismatch', message: `expected boolean, got ${describe(value)}` });
        return;
      }
      if (schema.const !== undefined && value !== schema.const) {
        out.push({ path, code: 'const_mismatch', message: `expected the constant ${schema.const}, got ${value}` });
      }
      return;
    }
    case 'null': {
      if (value !== null) {
        out.push({ path, code: 'type_mismatch', message: `expected null, got ${describe(value)}` });
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        out.push({ path, code: 'type_mismatch', message: `expected array, got ${describe(value)}` });
        return;
      }
      if (schema.min_items !== undefined && value.length < schema.min_items) {
        out.push({ path, code: 'length', message: `${value.length} items is below min_items ${schema.min_items}` });
      }
      if (schema.max_items !== undefined && value.length > schema.max_items) {
        out.push({ path, code: 'length', message: `${value.length} items exceeds max_items ${schema.max_items}` });
      }
      value.forEach((item, index) => walkValue(schema.items, item, `${path}/${index}`, depth + 1, out));
      return;
    }
    case 'object': {
      if (!isPlainObject(value)) {
        out.push({ path, code: 'type_mismatch', message: `expected object, got ${describe(value)}` });
        return;
      }
      for (const key of schema.required) {
        if (!(key in value)) {
          out.push({ path: `${path}/${key}`, code: 'required_missing', message: `required key ${JSON.stringify(key)} is missing` });
        }
      }
      for (const [key, child] of Object.entries(value)) {
        const childSchema = schema.properties[key];
        if (childSchema === undefined) {
          if (!schema.additional_properties) {
            out.push({ path: `${path}/${key}`, code: 'additional_property', message: `key ${JSON.stringify(key)} is not declared and additional_properties is false` });
          }
          continue;
        }
        walkValue(childSchema, child, `${path}/${key}`, depth + 1, out);
      }
      return;
    }
    default: {
      const exhaust: never = schema;
      out.push({ path, code: 'type_mismatch', message: `unreachable schema node ${String(exhaust)}` });
    }
  }
}
