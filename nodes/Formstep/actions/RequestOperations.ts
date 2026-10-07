import type { IDataObject, IExecuteFunctions } from 'n8n-workflow'

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

function readRequestId(context: IExecuteFunctions, itemIndex: number): string {
  return context.getNodeParameter('requestId', itemIndex, '', { extractValue: true }) as string
}

async function listRequests(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
  const returnAll = context.getNodeParameter('returnAll', itemIndex) as boolean
  const max = returnAll ? Number.POSITIVE_INFINITY : (context.getNodeParameter('limit', itemIndex) as number)
  const scope = context.getNodeParameter('scope', itemIndex) as 'form' | 'workspace'
  const filters = context.getNodeParameter('filters', itemIndex, {}) as ListFilters

  const scopeParams =
    scope === 'form'
      ? { formId: context.getNodeParameter('formId', itemIndex, '', { extractValue: true }) as string }
      : { workspaceId: (await readWorkspace(context)).id }

  return collectPages<IDataObject>(
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
}

/** Each operation and the Formstep call it makes for one input item. */
export const REQUEST_OPERATIONS: Record<RequestOperation, OperationRunner> = {
  create: async (context, itemIndex, fieldsOf) =>
    formstepApiRequest<IDataObject>(context, 'requests.create', await buildCreateParams(context, itemIndex, fieldsOf)),
  get: async (context, itemIndex) => formstepApiRequest<IDataObject>(context, 'requests.get', { requestId: readRequestId(context, itemIndex) }),
  getAll: listRequests,
  remind: async (context, itemIndex) =>
    formstepApiRequest<IDataObject>(context, 'requests.remind', { requestId: readRequestId(context, itemIndex) }),
  replayCallback: async (context, itemIndex) =>
    formstepApiRequest<IDataObject>(context, 'requests.replayCallback', { requestId: readRequestId(context, itemIndex) }),
  cancel: async (context, itemIndex) => {
    const reason = context.getNodeParameter('reason', itemIndex, '') as string
    return formstepApiRequest<IDataObject>(context, 'requests.cancel', {
      requestId: readRequestId(context, itemIndex),
      ...(reason ? { reason } : {}),
    })
  },
}

const REQUEST_OPERATION_NAMES: ReadonlySet<string> = new Set(Object.keys(REQUEST_OPERATIONS))

/** An own key of the dispatch table; `in` would also accept inherited keys such as `toString`. */
export function isRequestOperation(operation: string): operation is RequestOperation {
  return REQUEST_OPERATION_NAMES.has(operation)
}
