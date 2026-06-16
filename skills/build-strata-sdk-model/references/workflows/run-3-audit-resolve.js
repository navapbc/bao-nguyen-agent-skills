export const meta = {
  name: 'strata-model-audit-resolve',
  description: 'Audit the spec attributes for type/standards issues, then adversarially resolve the flags',
  phases: [
    { title: 'Audit', detail: 'flag wrong types / non-standard attrs' },
    { title: 'Resolve', detail: 'adversarially re-check flags and apply confirmed fixes' },
  ],
}

const FLAGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attr: { type: 'string' },
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggested_fix: { type: 'string' },
        },
        required: ['attr', 'issue', 'severity', 'suggested_fix'],
      },
    },
  },
  required: ['flags'],
}

const RESOLUTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revised_attrs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['name', 'type', 'source', 'status'],
      },
    },
    changelog: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attr: { type: 'string' },
          action: { type: 'string' },
          flag_verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
          why: { type: 'string' },
        },
        required: ['attr', 'action', 'flag_verdict', 'why'],
      },
    },
  },
  required: ['revised_attrs', 'changelog'],
}

phase('Audit')

const audit = await agent(
  [
    'You are the audit agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/attribute-audit.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path}.`,
    'Flag every attribute whose type is invalid, is the wrong type for its meaning, duplicates a base attribute, or fails SDK standards.',
    'Return the flags array (empty if nothing is wrong).',
  ].join('\n'),
  { label: 'audit', agentType: 'general-purpose', schema: FLAGS_SCHEMA },
)

phase('Resolve')

const resolution = await agent(
  [
    'You are the resolution agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/resolution.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path}.`,
    'Adjudicate these audit flags (JSON). Decide confirmed or rejected for each, independently:',
    JSON.stringify(audit.flags, null, 2),
    'Apply only confirmed fixes. Return revised_attrs (the full corrected attribute list) and changelog.',
  ].join('\n'),
  { label: 'resolution', agentType: 'general-purpose', schema: RESOLUTION_SCHEMA },
)

return { flags: audit.flags, resolution }
