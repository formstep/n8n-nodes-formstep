import { NodeApiError, NodeOperationError } from 'n8n-workflow'

import { formstepApiRequest, type FormstepRpcContext } from './GenericFunctions'

export interface FormSummary {
  id: string
  name: string
  isPublished: boolean
}

export interface WorkspaceSummary {
  id: string
  name: string
}

export interface ListResponse<T> {
  items: T[]
  hasMore: boolean
  nextCursor?: string | null
}

/** An option of a choice field, or a row or column of a matrix: its stable key and the label a person sees. */
export interface KeyedLabel {
  key: string
  label: string
}

/** One row of `fields.list`: a keyed field of the form's current published version. */
export interface FormField {
  key: string
  type: string
  title?: string
  prefillable?: boolean
  context?: boolean
  calculated?: boolean
  options?: KeyedLabel[]
  rows?: KeyedLabel[]
  columns?: KeyedLabel[]
  members?: FormField[]
}

/** A request as `requests.list` summarizes it, as far as a picker needs it. */
export interface RequestSummary {
  id: string
  status: string
  externalId: string | null
  recipient: { email: string | null; name: string | null }
}

const PAGE_SIZE = 100
const REQUEST_PAGE_SIZE = 25

/**
 * Every item of a cursor-paged list method, up to `max`. Formstep answers
 * `hasMore` with a `nextCursor`; a page that claims more without one is a
 * broken page, not the end of the list.
 */
export async function collectPages<T>(
  context: FormstepRpcContext,
  method: string,
  params: Record<string, unknown>,
  max = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const page = await formstepApiRequest<ListResponse<T>>(context, method, {
      ...params,
      limit: Math.min(PAGE_SIZE, max - items.length),
      ...(cursor ? { cursor } : {}),
    })
    items.push(...page.items)
    if (page.hasMore && !page.nextCursor) {
      throw new NodeApiError(context.getNode(), { message: `Formstep returned an incomplete ${method} page` })
    }
    cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined
  } while (cursor && items.length < max)

  return items.slice(0, max)
}

/**
 * The connected workspace. A Formstep OAuth token is scoped to the one
 * workspace the user picked on the consent screen, so `workspaces.list`
 * answers with exactly that workspace.
 */
export async function readWorkspace(context: FormstepRpcContext): Promise<WorkspaceSummary> {
  const workspaces = await formstepApiRequest<ListResponse<WorkspaceSummary>>(context, 'workspaces.list')
  const workspace = workspaces.items[0]
  if (!workspace) {
    throw new NodeOperationError(context.getNode(), 'This Formstep credential has no workspace. Reconnect it and pick one.')
  }
  return workspace
}

/** Every form of the connected workspace, across every `forms.list` page. */
export async function listForms(context: FormstepRpcContext): Promise<FormSummary[]> {
  const workspace = await readWorkspace(context)
  return collectPages<FormSummary>(context, 'forms.list', { workspaceId: workspace.id })
}

/**
 * The forms of the connected workspace whose name fuzzily matches `query`, up
 * to one page. Formstep answers a name search with one capped page and no
 * cursor, so a picker asks the user to type more instead of paging.
 */
export async function searchFormsByName(context: FormstepRpcContext, query: string): Promise<FormSummary[]> {
  const workspace = await readWorkspace(context)
  const page = await formstepApiRequest<ListResponse<FormSummary>>(context, 'forms.list', {
    workspaceId: workspace.id,
    query,
    limit: PAGE_SIZE,
  })
  return page.items
}

/** One page of the workspace's requests, newest first, from `cursor` on. */
export async function listRequestsPage(
  context: FormstepRpcContext,
  cursor: string | undefined
): Promise<ListResponse<RequestSummary>> {
  const workspace = await readWorkspace(context)
  return formstepApiRequest<ListResponse<RequestSummary>>(context, 'requests.list', {
    workspaceId: workspace.id,
    limit: REQUEST_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  })
}

/** The keyed fields of a form's current published version; empty while the form is unpublished. */
export async function listFields(context: FormstepRpcContext, formId: string): Promise<FormField[]> {
  const fields = await formstepApiRequest<ListResponse<FormField>>(context, 'fields.list', { formId })
  return fields.items
}
