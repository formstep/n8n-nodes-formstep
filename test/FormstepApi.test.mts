import { describe, expect, it } from 'vitest'

import { FormstepApi } from '../credentials/FormstepApi.credentials'

describe('FormstepApi', () => {
  it('asks for an API key and keeps the Formstep API resource fixed', () => {
    const credential = new FormstepApi()

    expect(credential.name).toBe('formstepApi')
    expect(credential.displayName).toBe('Formstep API')
    expect(credential.properties).toEqual([
      expect.objectContaining({ name: 'apiKey', type: 'string', typeOptions: { password: true }, required: true }),
      expect.objectContaining({ name: 'serverUrl', type: 'hidden', default: 'https://api.formstep.io/api/v1', required: true }),
    ])
  })

  it('sends the key as a bearer token, the way the Formstep API reads it', () => {
    const credential = new FormstepApi()

    expect(credential.authenticate).toEqual({
      type: 'generic',
      properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
    })
  })

  it('tests the key against me.get', () => {
    const credential = new FormstepApi()

    expect(credential.test).toEqual({
      request: { url: '={{$credentials.serverUrl}}', method: 'POST', body: { method: 'me.get', params: {} } },
    })
  })
})
