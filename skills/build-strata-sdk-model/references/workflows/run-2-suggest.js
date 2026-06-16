export const meta = {
  name: 'strata-model-suggest',
  description: 'Suggest attributes likely missing from the model spec, based on app type and SDK facts',
  phases: [{ title: 'Suggest', detail: 'propose missing attributes' }],
}

const PROPOSALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          typed: { type: 'boolean', description: 'true if mapped to a Strata typed widget, false if a Rails primitive' },
          rationale: { type: 'string' },
        },
        required: ['name', 'type', 'typed', 'rationale'],
      },
    },
  },
  required: ['proposals'],
}

phase('Suggest')

const result = await agent(
  [
    'You are the suggestion agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/suggestion.md and follow them exactly.`,
    `Read the model spec at ${args.spec_path} (model definition + SDK facts).`,
    'Propose attributes likely MISSING but important for this kind of application.',
    'Never propose base attributes already provided by the SDK base class.',
    'Return the proposals array (empty if nothing to add).',
  ].join('\n'),
  { label: 'suggestion', agentType: 'general-purpose', schema: PROPOSALS_SCHEMA },
)

return result
