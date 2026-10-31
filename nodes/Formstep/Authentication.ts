import type { INodeCredentialDescription, INodeProperties } from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

import { FORMSTEP_API_KEY_CREDENTIAL_TYPE, FORMSTEP_SIGN_IN_CREDENTIAL_TYPE } from './constants'
import type { FormstepRpcContext } from './GenericFunctions'

/**
 * Each Authentication choice and the credential it signs requests with. An
 * API key works on n8n Cloud and self-hosted n8n; the OAuth2 credential
 * registers itself with Formstep, which n8n supports on self-hosted n8n only.
 */
const AUTHENTICATIONS = [
  {
    value: 'apiKey',
    name: 'API Key',
    description: 'Works on n8n Cloud and self-hosted n8n',
    credentialType: FORMSTEP_API_KEY_CREDENTIAL_TYPE,
  },
  {
    value: 'oAuth2',
    name: 'OAuth2',
    description: 'Sign in to Formstep instead of pasting a key. Self-hosted n8n only.',
    credentialType: FORMSTEP_SIGN_IN_CREDENTIAL_TYPE,
  },
] as const

const AUTHENTICATION_OPTIONS = AUTHENTICATIONS.map(({ value, name, description }) => ({ value, name, description }))

export const formstepCredentials: INodeCredentialDescription[] = AUTHENTICATIONS.map(({ value, credentialType }) => ({
  name: credentialType,
  required: true,
  displayOptions: { show: { authentication: [value] } },
}))

/**
 * The Authentication parameter, defined twice so a node saved before it
 * existed keeps its OAuth2 credential: versions before `firstApiKeyVersion`
 * default to OAuth2, and that version on defaults to an API key.
 */
export function authenticationProperties(firstApiKeyVersion: number): INodeProperties[] {
  return [
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'options',
      noDataExpression: true,
      options: AUTHENTICATION_OPTIONS,
      default: 'oAuth2',
      displayOptions: { show: { '@version': [{ _cnd: { lt: firstApiKeyVersion } }] } },
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'options',
      noDataExpression: true,
      options: AUTHENTICATION_OPTIONS,
      default: 'apiKey',
      displayOptions: { show: { '@version': [{ _cnd: { gte: firstApiKeyVersion } }] } },
    },
  ]
}

/** The credential type the node's Authentication parameter picks. */
export function credentialTypeOf(context: FormstepRpcContext): string {
  // An execution reads parameters per item; the other contexts have no items.
  const value = 'getInputData' in context ? context.getNodeParameter('authentication', 0) : context.getNodeParameter('authentication')
  const authentication = AUTHENTICATIONS.find((candidate) => candidate.value === value)
  if (!authentication) {
    throw new NodeOperationError(context.getNode(), `The authentication "${String(value)}" is not supported`)
  }
  return authentication.credentialType
}
