import { createHash } from 'node:crypto'

import type { IExecuteFunctions, ResourceMapperValue } from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

import type { FormField } from '../FormstepCatalog'
import { splitFieldValues, type FieldValues } from '../FormFields'
import { formstepApiRequest } from '../GenericFunctions'

/** A form's live field list, fetched once per form per execution. */
export type FieldLookup = (formId: string) => Promise<FormField[]>

/** One row of a version 1 Prefill or Context list: a field key and the value to send under it. */
interface KeyValuePair {
  key?: string
  value?: unknown
  json?: boolean
}

/** One row of the documents collection: a binary field of the input item and where it goes. */
interface DocumentRow {
  binaryProperty?: string
  name?: string
  field?: string
}

/** What `documents.create` answers: the reserved document and the presigned URL its bytes go to. */
interface ReservedDocument {
  id: string
  uploadUrl: string
}

interface CreateAdditionalFields {
  callbackUrl?: string
  delivery?: 'none' | 'email'
  expiresAt?: string
  externalId?: string
  language?: string
  metadata?: unknown
  recipientName?: string
  reminders?: string
  test?: boolean
}

/** The Form Options collection of a new form. */
interface InlineFormOptions {
  cover?: unknown
  emoji?: string
  language?: string
  logo?: unknown
  settings?: unknown
  theme?: unknown
  translations?: unknown
}

/** A JSON-typed parameter, whether n8n handed over its text or an expression already produced the object. */
function parseJsonValue(context: IExecuteFunctions, value: unknown, what: string, itemIndex: number): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new NodeOperationError(context.getNode(), `The ${what} is not valid JSON`, { itemIndex })
  }
}

/** The key/value pairs of a version 1 Prefill or Context list as the object `requests.create` takes. */
function readPairs(context: IExecuteFunctions, parameter: 'prefill' | 'context', itemIndex: number): Record<string, unknown> {
  const collection = context.getNodeParameter(parameter, itemIndex, {}) as { values?: KeyValuePair[] }
  const values: Record<string, unknown> = {}
  for (const pair of collection.values ?? []) {
    if (!pair.key) {
      throw new NodeOperationError(context.getNode(), `Every ${parameter} entry needs a field key`, { itemIndex })
    }
    if (pair.key in values) {
      throw new NodeOperationError(context.getNode(), `Field key "${pair.key}" is listed twice in ${parameter}`, { itemIndex })
    }
    values[pair.key] = pair.json ? parseJsonValue(context, pair.value, `${parameter} value for "${pair.key}"`, itemIndex) : pair.value
  }
  return values
}

/**
 * The prefill and context values of one item. Version 1 lists them by hand;
 * version 2 maps them in the Fields mapper, either field by field or, with
 * Map Automatically, from the input item's keys. Either way the form's live
 * field list decides which values are context.
 */
async function readFieldValues(
  context: IExecuteFunctions,
  formId: string,
  itemIndex: number,
  fieldsOf: FieldLookup
): Promise<FieldValues> {
  if (context.getNode().typeVersion < 2) {
    return { prefill: readPairs(context, 'prefill', itemIndex), context: readPairs(context, 'context', itemIndex) }
  }

  const mappingMode = context.getNodeParameter('fields.mappingMode', itemIndex) as ResourceMapperValue['mappingMode']
  const fields = await fieldsOf(formId)
  if (mappingMode === 'autoMapInputData') {
    return splitFieldValues(fields, context.getInputData()[itemIndex].json, true)
  }
  // `fields.value`, not `fields`: n8n converts each value to its field's type only on this path.
  const values = (context.getNodeParameter('fields.value', itemIndex, null) ?? {}) as Record<string, unknown>
  return splitFieldValues(fields, values, false)
}

/** A JSON parameter that must hold an object; empty is no value. `what` names it in the error, capitalised. */
function readJsonObject(context: IExecuteFunctions, value: unknown, what: string, itemIndex: number): Record<string, unknown> | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = parseJsonValue(context, value, what.toLowerCase(), itemIndex)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new NodeOperationError(context.getNode(), `${what} must be a JSON object`, { itemIndex })
  }
  // Narrowed to a non-array object above.
  return parsed as Record<string, unknown>
}

function readMetadata(context: IExecuteFunctions, metadata: unknown, itemIndex: number): Record<string, unknown> | undefined {
  return readJsonObject(context, metadata, 'Metadata', itemIndex)
}

/** A JSON object parameter, or nothing when it is empty or `{}`. */
function readNonEmptyObject(context: IExecuteFunctions, value: unknown, what: string, itemIndex: number): Record<string, unknown> | undefined {
  const parsed = readJsonObject(context, value, what, itemIndex)
  return parsed && Object.keys(parsed).length > 0 ? parsed : undefined
}

/**
 * The `form` object of `requests.create` for Form Source "New Form": Formstep
 * builds the form from the blocks, publishes it and creates the request in one
 * call, and the same definition again reuses that form.
 */
function readInlineForm(context: IExecuteFunctions, itemIndex: number): Record<string, unknown> {
  const name = context.getNodeParameter('formName', itemIndex, '') as string
  const blocks = parseJsonValue(context, context.getNodeParameter('formBlocks', itemIndex, ''), 'form blocks', itemIndex)
  if (!Array.isArray(blocks)) {
    throw new NodeOperationError(context.getNode(), 'Form Blocks must be a JSON array of blocks', { itemIndex })
  }
  const options = context.getNodeParameter('formOptions', itemIndex, {}) as InlineFormOptions
  const logo = readNonEmptyObject(context, options.logo, 'Logo', itemIndex)
  const cover = readNonEmptyObject(context, options.cover, 'Cover', itemIndex)
  const theme = readNonEmptyObject(context, options.theme, 'Theme', itemIndex)
  const settings = readNonEmptyObject(context, options.settings, 'Settings', itemIndex)
  const translations = readNonEmptyObject(context, options.translations, 'Translations', itemIndex)
  return {
    name,
    blocks,
    ...(options.language ? { language: options.language } : {}),
    ...(logo ? { logo } : {}),
    ...(cover ? { cover } : {}),
    ...(options.emoji ? { emoji: options.emoji } : {}),
    ...(theme ? { theme } : {}),
    ...(settings ? { settings } : {}),
    ...(translations ? { translations } : {}),
  }
}

/** `"a, b"` → `["a", "b"]`. */
function readKeyList(value: string): string[] {
  return value
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
}

/**
 * What a request sends about its form: a published form's id with the values
 * of its live fields and the documents for its Documents block, or a new form's
 * definition with values keyed by its block keys. A new form has no id to
 * reserve documents against yet, so it takes none.
 */
async function readFormParams(context: IExecuteFunctions, itemIndex: number, fieldsOf: FieldLookup): Promise<Record<string, unknown>> {
  const formSource = context.getNode().typeVersion < 2 ? 'existing' : (context.getNodeParameter('formSource', itemIndex, 'existing') as string)
  if (formSource === 'inline') {
    const form = readInlineForm(context, itemIndex)
    const prefill = readNonEmptyObject(context, context.getNodeParameter('inlinePrefill', itemIndex, ''), 'Prefill', itemIndex)
    const requestContext = readNonEmptyObject(context, context.getNodeParameter('inlineContext', itemIndex, ''), 'Context', itemIndex)
    const readonly = readKeyList(context.getNodeParameter('inlineReadonly', itemIndex, '') as string)
    return {
      form,
      ...(prefill ? { prefill } : {}),
      ...(requestContext ? { context: requestContext } : {}),
      ...(readonly.length > 0 ? { readonly } : {}),
    }
  }

  const formId = context.getNodeParameter('formId', itemIndex, '', { extractValue: true }) as string
  const readonly = context.getNodeParameter('readonly', itemIndex, []) as string[]
  const { prefill, context: requestContext } = await readFieldValues(context, formId, itemIndex, fieldsOf)
  // Last, so a parameter mistake above never leaves an uploaded document behind.
  const documents = await uploadDocuments(context, formId, itemIndex)
  return {
    formId,
    ...(Object.keys(prefill).length > 0 ? { prefill } : {}),
    ...(Object.keys(requestContext).length > 0 ? { context: requestContext } : {}),
    ...(readonly.length > 0 ? { readonly } : {}),
    ...(documents.length > 0 ? { documents } : {}),
  }
}

function readExpiresAt(context: IExecuteFunctions, expiresAt: string, itemIndex: number): number {
  const timestamp = Date.parse(expiresAt)
  if (Number.isNaN(timestamp)) {
    throw new NodeOperationError(context.getNode(), `'Expires At' value ${expiresAt} is not a date`, { itemIndex })
  }
  return timestamp
}

/** `"2d, 5d"` → `["2d", "5d"]`; an empty string is an explicit `[]`, which turns reminders off. */
function readReminders(reminders: string): string[] {
  return reminders
    .split(',')
    .map((offset) => offset.trim())
    .filter((offset) => offset.length > 0)
}

/**
 * The URL n8n resumes this execution on. n8n exposes it to expressions as
 * `$execution.resumeUrl`; a Wait node set to "On webhook call" parks the
 * execution until Formstep POSTs the request callback to it.
 */
function readResumeUrl(context: IExecuteFunctions, itemIndex: number): string {
  const resumeUrl = context.evaluateExpression('{{ $execution.resumeUrl }}', itemIndex)
  if (typeof resumeUrl !== 'string' || resumeUrl.length === 0) {
    throw new NodeOperationError(
      context.getNode(),
      "n8n did not provide a resume URL for this execution. Turn off 'Wait for the Outcome', or run the workflow where a Wait node set to 'On Webhook Call' can resume it.",
      { itemIndex }
    )
  }
  return resumeUrl
}

/**
 * Upload the input item's files named in the documents collection and return
 * the `documents` entries `requests.create` takes. Formstep reserves each
 * document with `documents.create` and hands back a presigned URL; the bytes
 * go straight to storage and `requests.create` verifies them against the
 * declared size and sha256.
 */
async function uploadDocuments(context: IExecuteFunctions, formId: string, itemIndex: number): Promise<Array<Record<string, string>>> {
  const collection = context.getNodeParameter('documents', itemIndex, {}) as { values?: DocumentRow[] }
  const documents: Array<Record<string, string>> = []
  for (const row of collection.values ?? []) {
    const binaryProperty = row.binaryProperty?.trim()
    if (!binaryProperty) {
      throw new NodeOperationError(context.getNode(), 'Every document needs the name of an input binary field', { itemIndex })
    }
    const binary = context.helpers.assertBinaryData(itemIndex, binaryProperty)
    const bytes = await context.helpers.getBinaryDataBuffer(itemIndex, binaryProperty)
    const name = row.name?.trim() || binary.fileName
    if (!name) {
      throw new NodeOperationError(context.getNode(), `The file in ${binaryProperty} has no file name; set a 'Name' for it`, { itemIndex })
    }

    const reserved = await formstepApiRequest<ReservedDocument>(context, 'documents.create', {
      formId,
      name,
      contentType: binary.mimeType,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    await context.helpers.httpRequest({
      method: 'PUT',
      url: reserved.uploadUrl,
      body: bytes,
      headers: { 'Content-Type': binary.mimeType },
    })
    documents.push({ documentId: reserved.id, ...(row.field ? { field: row.field } : {}) })
  }
  return documents
}

/** The `requests.create` params the node's parameters describe for one item. */
export async function buildCreateParams(context: IExecuteFunctions, itemIndex: number, fieldsOf: FieldLookup): Promise<Record<string, unknown>> {
  const recipientEmail = context.getNodeParameter('recipientEmail', itemIndex, '') as string
  const waitForOutcome = context.getNodeParameter('waitForOutcome', itemIndex, false) as boolean
  const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as CreateAdditionalFields

  if (waitForOutcome && additional.callbackUrl) {
    throw new NodeOperationError(
      context.getNode(),
      "'Wait for the Outcome' already sets the callback URL. Turn it off to use a 'Callback URL' of your own.",
      { itemIndex }
    )
  }
  const callbackUrl = waitForOutcome ? readResumeUrl(context, itemIndex) : additional.callbackUrl

  const metadata = readMetadata(context, additional.metadata, itemIndex)
  const expiresAt = additional.expiresAt ? readExpiresAt(context, additional.expiresAt, itemIndex) : undefined
  // Last, since it may upload documents.
  const formParams = await readFormParams(context, itemIndex, fieldsOf)
  const recipient = {
    ...(recipientEmail ? { email: recipientEmail } : {}),
    ...(additional.recipientName ? { name: additional.recipientName } : {}),
  }

  return {
    ...formParams,
    ...(Object.keys(recipient).length > 0 ? { recipient } : {}),
    ...(additional.language ? { language: additional.language } : {}),
    ...(additional.delivery ? { delivery: additional.delivery } : {}),
    ...(additional.reminders !== undefined ? { reminders: readReminders(additional.reminders) } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(additional.externalId ? { externalId: additional.externalId, idempotencyKey: additional.externalId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(callbackUrl ? { callbackUrl } : {}),
    ...(additional.test ? { test: true } : {}),
  }
}
