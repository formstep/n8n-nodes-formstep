export const DEFAULT_FORMSTEP_API_URL = 'https://api.formstep.io'

export const FORMSTEP_API_PATH = '/api/v1'

export const FORMSTEP_API_RESOURCE_URL = `${DEFAULT_FORMSTEP_API_URL}${FORMSTEP_API_PATH}`

export const FORMSTEP_CREDENTIAL_TYPE = 'formstepOAuth2Api'

export const FORMSTEP_WEBHOOK_EVENTS = {
  submissionCreated: 'submission_created',
  submissionUpdated: 'submission_updated',
  submissionAbandoned: 'submission_abandoned',
  requestCompleted: 'request_completed',
  requestExpired: 'request_expired',
  requestCanceled: 'request_canceled',
} as const

export type FormstepWebhookEvent = (typeof FORMSTEP_WEBHOOK_EVENTS)[keyof typeof FORMSTEP_WEBHOOK_EVENTS]

/** Shortest first: a duration list reads by length, not alphabetically. */
export const FORMSTEP_IDLE_WINDOW_OPTIONS = [
  { name: '12 Hours', value: '12h' },
  { name: '1 Day', value: '1d' },
  { name: '3 Days', value: '3d' },
  { name: '1 Week', value: '1w' },
] as const

export type FormstepIdleWindow = (typeof FORMSTEP_IDLE_WINDOW_OPTIONS)[number]['value']

const FORMSTEP_IDLE_WINDOW_VALUES: ReadonlySet<string> = new Set(
  FORMSTEP_IDLE_WINDOW_OPTIONS.map((option) => option.value)
)

export function isFormstepIdleWindow(value: unknown): value is FormstepIdleWindow {
  return typeof value === 'string' && FORMSTEP_IDLE_WINDOW_VALUES.has(value)
}
