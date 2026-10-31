import type { IAuthenticateGeneric, Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow'

import { FORMSTEP_API_KEY_CREDENTIAL_TYPE, FORMSTEP_API_RESOURCE_URL } from '../nodes/Formstep/constants'

/**
 * A Formstep API key, created under OAuth and API Keys in the Formstep
 * dashboard. Works on n8n Cloud and self-hosted n8n alike: unlike the OAuth2
 * credential, it needs no client registration and no redirect URL.
 */
export class FormstepApi implements ICredentialType {
  name = FORMSTEP_API_KEY_CREDENTIAL_TYPE

  displayName = 'Formstep API'

  icon: Icon = {
    light: 'file:../nodes/Formstep/formstep-logo.svg',
    dark: 'file:../nodes/Formstep/formstep-logo.dark.svg',
  }

  documentationUrl = 'https://docs.formstep.io/guides/n8n/connect/'

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description:
        'An API key of the Formstep workspace n8n may use. Create one in Formstep under OAuth and API Keys › Create token, with Expiration set to No expiration. A key reaches one workspace only.',
    },
    {
      displayName: 'Server URL',
      name: 'serverUrl',
      type: 'hidden',
      default: FORMSTEP_API_RESOURCE_URL,
      required: true,
    },
  ]

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  }

  test: ICredentialTestRequest = {
    request: {
      url: '={{$credentials.serverUrl}}',
      method: 'POST',
      body: {
        method: 'me.get',
        params: {},
      },
    },
  }
}
