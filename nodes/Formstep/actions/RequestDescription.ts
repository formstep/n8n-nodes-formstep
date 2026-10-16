import type { IDisplayOptions, INodeProperties } from 'n8n-workflow'

export type RequestOperation = 'cancel' | 'create' | 'get' | 'getAll' | 'remind' | 'replayCallback'

const REQUEST_ID_OPERATIONS: RequestOperation[] = ['cancel', 'get', 'remind', 'replayCallback']

const EXPRESSION_HINT = 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>'

/**
 * Version 1 keeps the parameters its workflows were saved with: a form
 * dropdown, a Request ID text box, and key/value Prefill and Context lists.
 * Version 2 picks the form and the request with a searchable list or an ID,
 * and maps every field of the form in one typed Fields mapper.
 */
const V1: IDisplayOptions['show'] = { '@version': [1] }
const V2: IDisplayOptions['show'] = { '@version': [{ _cnd: { gte: 2 } }] }

function showFor(operations: RequestOperation[], extra: IDisplayOptions['show'] = {}): IDisplayOptions {
  return { show: { resource: ['request'], operation: operations, ...extra } }
}

/**
 * Create on version 2 either sends a published form or builds a new one in the
 * same call (`form` instead of `formId`); the parameters of each show for its
 * source only. Version 1 always sends a published form.
 */
const EXISTING_FORM: IDisplayOptions['show'] = { ...V2, formSource: ['existing'] }
const INLINE_FORM: IDisplayOptions['show'] = { ...V2, formSource: ['inline'] }

/**
 * A Create parameter that only makes sense for a published form: once as
 * version 1 had it, once for version 2 with a published form picked.
 */
function forExistingForm(property: INodeProperties): INodeProperties[] {
  return [
    { ...property, displayOptions: showFor(['create'], V1) },
    { ...property, displayOptions: showFor(['create'], EXISTING_FORM) },
  ]
}

/** The Form parameter of the given operations, in both versions' shapes. `v2Extra` narrows the version 2 one further. */
function formIdProperties(
  operations: RequestOperation[],
  extra: IDisplayOptions['show'] = {},
  v2Extra: IDisplayOptions['show'] = {}
): INodeProperties[] {
  return [
    {
      displayName: 'Form Name or ID',
      name: 'formId',
      type: 'options',
      typeOptions: { loadOptionsMethod: 'getForms' },
      displayOptions: showFor(operations, { ...extra, ...V1 }),
      default: '',
      required: true,
      description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
    },
    {
      displayName: 'Form',
      name: 'formId',
      type: 'resourceLocator',
      displayOptions: showFor(operations, { ...extra, ...v2Extra, ...V2 }),
      default: { mode: 'list', value: '' },
      required: true,
      description: 'The form of the credential\'s workspace. A request needs a published one.',
      modes: [
        {
          displayName: 'From List',
          name: 'list',
          type: 'list',
          placeholder: 'Select a form...',
          typeOptions: { searchListMethod: 'searchForms', searchable: true },
        },
        {
          displayName: 'ID',
          name: 'id',
          type: 'string',
          placeholder: 'e.g. j57d3kq9y8x2m1n0p4r6s5t7v9w8',
        },
      ],
    },
  ]
}

/** One row of a version 1 Prefill or Context list. */
function keyValueCollection(name: 'prefill' | 'context'): INodeProperties {
  const isPrefill = name === 'prefill'
  return {
    displayName: isPrefill ? 'Prefill' : 'Context',
    name,
    type: 'fixedCollection',
    placeholder: isPrefill ? 'Add Answer' : 'Add Context Value',
    typeOptions: { multipleValues: true },
    displayOptions: showFor(['create'], V1),
    default: {},
    description: isPrefill
      ? 'Initial answers the recipient sees, keyed by field key'
      : 'Hidden-field values the recipient never sees or edits, keyed by field key and echoed in every callback',
    options: [
      {
        name: 'values',
        displayName: isPrefill ? 'Answer' : 'Context Value',
        values: [
          {
            displayName: 'Field Name or ID',
            name: 'key',
            type: 'options',
            typeOptions: {
              loadOptionsMethod: isPrefill ? 'getPrefillKeys' : 'getContextKeys',
              loadOptionsDependsOn: ['formId'],
            },
            default: '',
            description: EXPRESSION_HINT,
          },
          {
            displayName: 'Value',
            name: 'value',
            type: 'string',
            default: '',
            description: "Sent as text, or as the value it decodes to when 'Parse as JSON' is on",
          },
          {
            displayName: 'Parse as JSON',
            name: 'json',
            type: 'boolean',
            default: false,
            description: isPrefill
              ? 'Whether to decode the value as JSON: a number, true or false, a list of option keys, a matrix object or the rows of a repeating group'
              : 'Whether to decode the value as JSON instead of sending it as text',
          },
        ],
      },
    ],
  }
}

const operationProperty: INodeProperties = {
  displayName: 'Operation',
  name: 'operation',
  type: 'options',
  noDataExpression: true,
  displayOptions: { show: { resource: ['request'] } },
  options: [
    {
      name: 'Cancel',
      value: 'cancel',
      action: 'Cancel request',
      description: 'Withdraw a pending request so its link stops working',
    },
    {
      name: 'Create',
      value: 'create',
      action: 'Create request',
      description: 'Ask one recipient to complete a published form, or a new form built in the same call',
    },
    {
      name: 'Get',
      value: 'get',
      action: 'Get request',
      description: 'Read a request, with its answers once it is completed',
    },
    {
      name: 'Get Many',
      value: 'getAll',
      action: 'Get many requests',
      description: 'List the requests of a form or of the workspace',
    },
    {
      name: 'Remind',
      value: 'remind',
      action: 'Remind request recipient',
      description: 'Email the recipient a reminder now, outside the reminder schedule',
    },
    {
      name: 'Replay Callback',
      value: 'replayCallback',
      action: 'Replay request callback',
      description: 'Send the callback of a completed, expired or canceled request again',
    },
  ],
  default: 'create',
}

const BLOCKS_EXAMPLE = `[
  { "type": "paragraph", "content": "Hi {{first_name}}, please upload your payslips." },
  { "type": "hiddenField", "key": "first_name" },
  { "type": "file", "key": "payslips", "title": "Your last three payslips", "maxFiles": 3 }
]`

/** Create on version 2 with Form Source "New Form": the `form` object and the values keyed by its block keys. */
const inlineFormProperties: INodeProperties[] = [
  {
    displayName: 'Form Name',
    name: 'formName',
    type: 'string',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: '',
    required: true,
    placeholder: 'e.g. Documents for your mortgage application',
    description:
      'The name on the dashboard and in the browser tab, 1 to 100 characters. Keep it the same for every recipient: a name that changes per item makes a new form per item.',
  },
  {
    displayName: 'Form Blocks',
    name: 'formBlocks',
    type: 'json',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: BLOCKS_EXAMPLE,
    required: true,
    description:
      'JSON array of 1 to 200 blocks in form order, each { "type", "key", ...the parameters of its type }. Set a key on every question: the answers come back under it. Types and parameters: <a href="https://docs.formstep.io/requests/inline-forms/">Create a form and a request in one call</a>.',
  },
  {
    displayName: 'Prefill',
    name: 'inlinePrefill',
    type: 'json',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: '{}',
    description:
      'Starting answers keyed by block key. A choice question takes option keys derived from the labels: "Self-employed" becomes self_employed.',
  },
  {
    displayName: 'Context',
    name: 'inlineContext',
    type: 'json',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: '{}',
    description:
      'Hidden-field values keyed by the hiddenField block keys. Personalise the form here, never in its name or blocks, so every item reuses one form.',
  },
  {
    displayName: 'Read-Only Field Keys',
    name: 'inlineReadonly',
    type: 'string',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: '',
    placeholder: 'e.g. company_name, plan',
    description: 'Comma-separated block keys the recipient may see but not change. Each one must also be in Prefill.',
  },
  {
    displayName: 'Form Options',
    name: 'formOptions',
    type: 'collection',
    placeholder: 'Add Option',
    displayOptions: showFor(['create'], INLINE_FORM),
    default: {},
    options: [
      {
        displayName: 'Cover',
        name: 'cover',
        type: 'json',
        default: '',
        placeholder: '{ "type": "image", "url": "https://example.com/cover.jpg", "offsetY": 50 }',
        description:
          'JSON object: a color, { "type": "color", "color": "#0f4c81" }, or an image as in the placeholder, where offsetY from 0 to 100 picks the part that shows',
      },
      {
        displayName: 'Emoji',
        name: 'emoji',
        type: 'string',
        default: '',
        description: 'One emoji, shown beside the form name',
      },
      {
        displayName: 'Form Language',
        name: 'language',
        type: 'string',
        default: '',
        placeholder: 'e.g. de',
        description: "The form's UI language. Defaults to English.",
      },
      {
        displayName: 'Logo',
        name: 'logo',
        type: 'json',
        default: '',
        placeholder: '{ "type": "image", "url": "https://example.com/logo.png" }',
        description:
          'JSON object: an icon, { "type": "icon", "name": "HeartIcon" }, or an image as in the placeholder. An image must be a public JPEG, PNG or WebP; Formstep keeps its own copy.',
      },
      {
        displayName: 'Settings',
        name: 'settings',
        type: 'json',
        default: '{}',
        description: 'JSON object of form settings, such as { "showBranding": false }. Fields are named by key; email copy may use {{key}}.',
      },
      {
        displayName: 'Theme',
        name: 'theme',
        type: 'json',
        default: '{}',
        description: 'JSON object with a look per color mode, such as { "light": "solarized-light", "dark": "dracula" }',
      },
      {
        displayName: 'Translations',
        name: 'translations',
        type: 'json',
        default: '{}',
        description:
          'JSON object that publishes the form in more languages: { "de": { "text as written in the blocks": "translation" } }. Every string of the form must be there.',
      },
    ],
  },
]

const createProperties: INodeProperties[] = [
  {
    displayName: 'Form Source',
    name: 'formSource',
    type: 'options',
    noDataExpression: true,
    displayOptions: showFor(['create'], V2),
    options: [
      {
        name: 'Published Form',
        value: 'existing',
        description: 'Send a form built and published in Formstep',
      },
      {
        name: 'New Form',
        value: 'inline',
        description: 'Build the form from blocks in this call; the same blocks again reuse the form',
      },
    ],
    default: 'existing',
  },
  ...formIdProperties(['create'], {}, { formSource: ['existing'] }),
  ...inlineFormProperties,
  {
    displayName: 'Recipient Email',
    name: 'recipientEmail',
    type: 'string',
    placeholder: 'e.g. name@example.com',
    displayOptions: showFor(['create']),
    default: '',
    description: 'Who the request is for. Needed to send the invitation email and reminders.',
  },
  keyValueCollection('prefill'),
  keyValueCollection('context'),
  {
    displayName: 'Fields',
    name: 'fields',
    type: 'resourceMapper',
    noDataExpression: true,
    displayOptions: showFor(['create'], EXISTING_FORM),
    default: { mappingMode: 'defineBelow', value: null },
    description:
      'Initial answers the recipient sees, and context values they never see, keyed by field key. Map Automatically sends every input field named after a field key of the form.',
    typeOptions: {
      loadOptionsDependsOn: ['formId.value'],
      resourceMapper: {
        resourceMapperMethod: 'getMappingFields',
        mode: 'add',
        valuesLabel: 'Values to Send',
        fieldWords: { singular: 'field', plural: 'fields' },
        addAllFields: true,
        multiKeyMatch: false,
        supportAutoMap: true,
        noFieldsError: 'This form has no field a request can fill in. Publish the form first, or pick another one.',
      },
    },
  },
  ...forExistingForm({
    displayName: 'Read-Only Field Names or IDs',
    name: 'readonly',
    type: 'multiOptions',
    typeOptions: { loadOptionsMethod: 'getPrefillKeys', loadOptionsDependsOn: ['formId'] },
    default: [],
    description:
      'Prefilled fields the recipient may see but not change. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
  }),
  ...forExistingForm({
    displayName: 'Documents',
    name: 'documents',
    type: 'fixedCollection',
    placeholder: 'Add Document',
    typeOptions: { multipleValues: true },
    default: {},
    description:
      "Files from the input item the recipient gets in the form's Documents block, below the documents the form already has. PDF or image, up to 25 MB each.",
    options: [
      {
        name: 'values',
        displayName: 'Document',
        values: [
          {
            displayName: 'Input Binary Field',
            name: 'binaryProperty',
            type: 'string',
            default: 'data',
            required: true,
            hint: 'The name of the input binary field containing the file',
          },
          {
            displayName: 'Name',
            name: 'name',
            type: 'string',
            default: '',
            description: 'The name the recipient sees. Defaults to the file name.',
          },
          {
            displayName: 'Documents Block Name or ID',
            name: 'field',
            type: 'options',
            typeOptions: { loadOptionsMethod: 'getDocumentsKeys', loadOptionsDependsOn: ['formId'] },
            default: '',
            description:
              'The Documents block the file goes into. Leave empty when the form has one. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
          },
        ],
      },
    ],
  }),
  {
    displayName: 'Wait for the Outcome',
    name: 'waitForOutcome',
    type: 'boolean',
    displayOptions: showFor(['create']),
    default: false,
    description:
      "Whether to point the request callback at this execution's resume URL. Follow this node with a Wait node set to 'On Webhook Call': the workflow resumes with the request event when the request is completed, expires or is canceled.",
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    displayOptions: showFor(['create']),
    default: {},
    options: [
      {
        displayName: 'Callback URL',
        name: 'callbackUrl',
        type: 'string',
        default: '',
        description: 'An HTTPS URL of your own that receives the signed request callback. Leave empty when Wait for the Outcome is on.',
      },
      {
        displayName: 'Delivery',
        name: 'delivery',
        type: 'options',
        options: [
          {
            name: 'Email the Invitation',
            value: 'email',
            description: 'Sends the recipient the link by email; needs a recipient email',
          },
          {
            name: 'None',
            value: 'none',
            description: 'You deliver the returned link yourself',
          },
        ],
        default: 'none',
      },
      {
        displayName: 'Expires At',
        name: 'expiresAt',
        type: 'dateTime',
        default: '',
        description: 'When the link stops working. Defaults to 30 days, at most 365.',
      },
      {
        displayName: 'External ID',
        name: 'externalId',
        type: 'string',
        default: '',
        description:
          'Your ID for this request, such as the run or ticket it belongs to. Also used as the idempotency key, so a retried run reuses the request instead of creating a second one.',
      },
      {
        displayName: 'Language',
        name: 'language',
        type: 'string',
        default: '',
        placeholder: 'e.g. en',
        description: 'Language the form opens in and the invitation is written in; must be published for the form',
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'JSON object for your own bookkeeping. Never shown to the recipient, echoed in every callback.',
      },
      {
        displayName: 'Recipient Name',
        name: 'recipientName',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Reminders',
        name: 'reminders',
        type: 'string',
        default: '',
        placeholder: 'e.g. 2d, 5d',
        description:
          "Idle offsets after which to remind the recipient, comma-separated, at most five. Leave empty to send no reminders; remove the field to inherit the form's schedule.",
      },
      {
        displayName: 'Test Mode',
        name: 'test',
        type: 'boolean',
        default: false,
        description:
          'Whether to create a test request: nothing is emailed, the callback carries test: true, and nothing counts against the quota',
      },
    ],
  },
]

const requestIdProperties: INodeProperties[] = [
  {
    displayName: 'Request ID',
    name: 'requestId',
    type: 'string',
    displayOptions: showFor(REQUEST_ID_OPERATIONS, V1),
    default: '',
    required: true,
    description: 'The ID Formstep returned when the request was created',
  },
  {
    displayName: 'Request',
    name: 'requestId',
    type: 'resourceLocator',
    displayOptions: showFor(REQUEST_ID_OPERATIONS, V2),
    default: { mode: 'list', value: '' },
    required: true,
    description: 'The request: one of the newest requests of the workspace, or the ID an earlier Create node returned',
    modes: [
      {
        displayName: 'From List',
        name: 'list',
        type: 'list',
        placeholder: 'Select a request...',
        typeOptions: { searchListMethod: 'searchRequests' },
      },
      {
        displayName: 'By ID',
        name: 'id',
        type: 'string',
        placeholder: 'e.g. {{ $json.id }}',
      },
    ],
  },
  {
    displayName: 'Reason',
    name: 'reason',
    type: 'string',
    displayOptions: showFor(['cancel']),
    default: '',
    description: 'Why the request is withdrawn; echoed in the request.canceled callback',
  },
]

const getAllProperties: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    displayOptions: showFor(['getAll']),
    default: false,
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    typeOptions: { minValue: 1 },
    displayOptions: showFor(['getAll'], { returnAll: [false] }),
    default: 50,
    description: 'Max number of results to return',
  },
  {
    displayName: 'Scope',
    name: 'scope',
    type: 'options',
    displayOptions: showFor(['getAll']),
    options: [
      {
        name: 'Form',
        value: 'form',
        description: 'The requests of one form',
      },
      {
        name: 'Workspace',
        value: 'workspace',
        description: 'Every request of the connected workspace',
      },
    ],
    default: 'form',
  },
  ...formIdProperties(['getAll'], { scope: ['form'] }),
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    displayOptions: showFor(['getAll']),
    default: {},
    options: [
      {
        displayName: 'External ID',
        name: 'externalId',
        type: 'string',
        default: '',
        description: 'Only the requests created with this external ID',
      },
      {
        displayName: 'Include Test Requests',
        name: 'includeTest',
        type: 'boolean',
        default: false,
        description: 'Whether to include requests created in test mode',
      },
      {
        displayName: 'Outcome',
        name: 'outcome',
        type: 'options',
        options: [
          { name: 'Approve', value: 'approve' },
          { name: 'Changes', value: 'changes' },
          { name: 'Decline', value: 'decline' },
        ],
        default: 'approve',
        description: 'Only completed requests with this verdict from the decision question; takes precedence over Status',
      },
      {
        displayName: 'Status',
        name: 'status',
        type: 'options',
        options: [
          { name: 'Canceled', value: 'canceled' },
          { name: 'Completed', value: 'completed' },
          { name: 'Expired', value: 'expired' },
          { name: 'Pending', value: 'pending' },
        ],
        default: 'pending',
      },
    ],
  },
]

export const requestProperties: INodeProperties[] = [
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    noDataExpression: true,
    options: [{ name: 'Request', value: 'request' }],
    default: 'request',
  },
  operationProperty,
  ...createProperties,
  ...requestIdProperties,
  ...getAllProperties,
]
