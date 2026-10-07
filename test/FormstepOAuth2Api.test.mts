import { describe, expect, it } from 'vitest'

import { FormstepOAuth2Api } from '../credentials/FormstepOAuth2Api.credentials'

describe('FormstepOAuth2Api', () => {
  it('uses n8n dynamic client registration against the Formstep API resource', () => {
    const credential = new FormstepOAuth2Api()

    expect(credential.name).toBe('formstepOAuth2Api')
    expect(credential.displayName).toBe('Formstep OAuth2 API')
    expect(credential.extends).toEqual(['oAuth2Api'])
    expect(credential.properties).toEqual([
      expect.objectContaining({
        name: 'useDynamicClientRegistration',
        type: 'hidden',
        default: true,
      }),
      expect.objectContaining({
        name: 'serverUrl',
        type: 'hidden',
        default: 'https://api.formstep.io/api/v1',
        required: true,
      }),
    ])
  })

  it('tests the OAuth bearer token against me.get', () => {
    const credential = new FormstepOAuth2Api()

    expect(credential.test).toEqual({
      request: {
        url: '={{$credentials.serverUrl}}',
        method: 'POST',
        body: {
          method: 'me.get',
          params: {},
        },
      },
    })
  })
})
