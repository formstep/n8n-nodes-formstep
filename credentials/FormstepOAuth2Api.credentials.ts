import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow'

import { FORMSTEP_API_RESOURCE_URL, FORMSTEP_CREDENTIAL_TYPE } from '../nodes/Formstep/constants'

export class FormstepOAuth2Api implements ICredentialType {
  name = FORMSTEP_CREDENTIAL_TYPE

  extends = ['oAuth2Api']

  displayName = 'Formstep OAuth2 API'

  icon: Icon = {
    light: 'file:../nodes/Formstep/formstep-logo.svg',
    dark: 'file:../nodes/Formstep/formstep-logo.dark.svg',
  }

  documentationUrl = 'https://docs.formstep.io/guides/n8n/connect/'

  properties: INodeProperties[] = [
    {
      displayName: 'Use Dynamic Client Registration',
      name: 'useDynamicClientRegistration',
      type: 'hidden',
      default: true,
    },
    {
      displayName: 'Server URL',
      name: 'serverUrl',
      type: 'hidden',
      default: FORMSTEP_API_RESOURCE_URL,
      required: true,
    },
  ]

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
