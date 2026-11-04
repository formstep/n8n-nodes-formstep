import type { IDataObject, IExecuteFunctions } from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

import { collectPages, readWorkspace } from '../FormstepCatalog'
import { formstepApiRequest } from '../GenericFunctions'
import { buildCreateParams, type FieldLookup } from './RequestCreate'
import type { RequestOperation } from './RequestDescription'

interface ListFilters {
  externalId?: string
  includeTest?: boolean
  outcome?: string
  status?: string
}

type OperationRunner = (context: IExecuteFunctions, itemIndex: number, fieldsOf: FieldLookup) => Promise<IDataObject | IDataObject[]>

/** How an operation shapes the whole request Formstep answered with. */
type RequestShape = (request: IDataObject) => IDataObject

const rawRequest: RequestShape = (request) => request

/** A Formstep timestamp, Unix milliseconds, as ISO 8601; unset stays null. */
function toIsoTimestamp(value: unknown): string | null {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

/**
 * What 'Simplify' and the 'Simplified' output return for a request: the fields
 * most workflows read, flattened, with ISO 8601 timestamps. `answers` comes
 * with Get, which has them once the request is completed; no other operation
 * answers with them.
 */
export function simplifyRequest(request: IDataObject): IDataObject {
  const recipient = (request.recipient ?? {}) as IDataObject
  return {
    id: request.id,
    status: request.status,
    outcome: request.outcome ?? null,
    externalId: request.externalId ?? null,
    formId: request.formId,
    recipientEmail: recipient.email ?? null,
    ...('answers' in request ? { answers: request.answers } : {}),
    createdAt: toIsoTimestamp(request.createdAt),
    expiresAt: toIsoTimestamp(request.expiresAt),
    completedAt: toIsoTimestamp(request.completedAt),
  }
}

/** The 'Selected Fields' output: the request ID and the picked fields the response has, as Formstep sent them. */
function pickFields(request: IDataObject, fields: string[]): IDataObject {
  const picked: IDataObject = { id: request.id }
  for (const field of fields) {
    if (field in request) picked[field] = request[field]
  }
  return picked
}

/** The 'Output' parameter, version 5 on. */
function outputShape(context: IExecuteFunctions, itemIndex: number): RequestShape {
  const output = context.getNodeParameter('output', itemIndex, 'simplified') as string
  switch (output) {
    case 'simplified':
      return simplifyRequest
    case 'raw':
      return rawRequest
    case 'selected': {
      const fields = context.getNodeParameter('outputFields', itemIndex, []) as string[]
      return (request) => pickFields(request, fields)
    }
    default:
      throw new NodeOperationError(context.getNode(), `'Output' value ${output} is not supported`, {
        itemIndex,
        description: "Pick 'Simplified', 'Raw' or 'Selected Fields' under 'Output'.",
      })
  }
}

/** Get and Get Many: 'Simplify' on versions 3 and 4; earlier versions keep the raw response their workflows read. */
function readShape(context: IExecuteFunctions, itemIndex: number): RequestShape {
  const { typeVersion } = context.getNode()
  if (typeVersion >= 5) return outputShape(context, itemIndex)
  if (typeVersion < 3) return rawRequest
  return context.getNodeParameter('simplify', itemIndex, true) ? simplifyRequest : rawRequest
}

/** Cancel and Remind: versions before 5 keep the raw response their workflows read. */
function writeShape(context: IExecuteFunctions, itemIndex: number): RequestShape {
  return context.getNode().typeVersion >= 5 ? outputShape(context, itemIndex) : rawRequest
}

function readRequestId(context: IExecuteFunctions, itemIndex: number): string {
  return context.getNodeParameter('requestId', itemIndex, '', { extractValue: true }) as string
}

async function listRequests(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
  const returnAll = context.getNodeParameter('returnAll', itemIndex) as boolean
  const max = returnAll ? Number.POSITIVE_INFINITY : (context.getNodeParameter('limit', itemIndex) as number)
  const scope = context.getNodeParameter('scope', itemIndex) as 'form' | 'workspace'
  const filters = context.getNodeParameter('filters', itemIndex, {}) as ListFilters
  const shape = readShape(context, itemIndex)

  const scopeParams =
    scope === 'form'
      ? { formId: context.getNodeParameter('formId', itemIndex, '', { extractValue: true }) as string }
      : { workspaceId: (await readWorkspace(context)).id }

  const requests = await collectPages<IDataObject>(
    context,
    'requests.list',
    {
      ...scopeParams,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.outcome ? { outcome: filters.outcome } : {}),
      ...(filters.externalId ? { externalId: filters.externalId } : {}),
      ...(filters.includeTest ? { includeTest: true } : {}),
    },
    max
  )
  return requests.map(shape)
}

/** Each operation and the Formstep call it makes for one input item. */
export const REQUEST_OPERATIONS: Record<RequestOperation, OperationRunner> = {
  create: async (context, itemIndex, fieldsOf) =>
    formstepApiRequest<IDataObject>(context, 'requests.create', await buildCreateParams(context, itemIndex, fieldsOf)),
  get: async (context, itemIndex) => {
    const shape = readShape(context, itemIndex)
    return shape(await formstepApiRequest<IDataObject>(context, 'requests.get', { requestId: readRequestId(context, itemIndex) }))
  },
  getAll: listRequests,
  // The shape is read first: a parameter mistake must stop the node before the reminder goes out.
  remind: async (context, itemIndex) => {
    const shape = writeShape(context, itemIndex)
    return shape(await formstepApiRequest<IDataObject>(context, 'requests.remind', { requestId: readRequestId(context, itemIndex) }))
  },
  replayCallback: async (context, itemIndex) =>
    formstepApiRequest<IDataObject>(context, 'requests.replayCallback', { requestId: readRequestId(context, itemIndex) }),
  cancel: async (context, itemIndex) => {
    const reason = context.getNodeParameter('reason', itemIndex, '') as string
    const shape = writeShape(context, itemIndex)
    return shape(
      await formstepApiRequest<IDataObject>(context, 'requests.cancel', {
        requestId: readRequestId(context, itemIndex),
        ...(reason ? { reason } : {}),
      })
    )
  },
}

const REQUEST_OPERATION_NAMES: ReadonlySet<string> = new Set(Object.keys(REQUEST_OPERATIONS))

/** An own key of the dispatch table; `in` would also accept inherited keys such as `toString`. */
export function isRequestOperation(operation: string): operation is RequestOperation {
  return REQUEST_OPERATION_NAMES.has(operation)
}
