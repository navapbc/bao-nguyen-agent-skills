export const meta = {
  name: 'strata-model-discovery',
  description: 'Locate the Rails app, verify Ruby, detect and read the Strata SDK, return SDK facts',
  phases: [{ title: 'Discovery', detail: 'read gem source, return structured SDK facts', model: 'haiku' }],
}

const SDK_FACTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rails_dir: { type: 'string', description: 'Absolute path to the Rails app, or empty string if none found' },
    ruby_ok: { type: 'boolean' },
    sdk_present: { type: 'boolean' },
    gem_path: { type: 'string' },
    variants: {
      type: 'object',
      description: 'Per-variant facts keyed by kind (application_form, case, business_process, task)',
      additionalProperties: {
        type: 'object',
        properties: {
          generator_cmd: { type: 'string' },
          verified_flags: { type: 'array', items: { type: 'string' } },
          produces: { type: 'string' },
          base_class_summary: { type: 'string' },
          base_attrs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    type_catalog: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['rails_dir', 'ruby_ok', 'sdk_present'],
}

phase('Discovery')

const facts = await agent(
  [
    'You are the discovery agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/discovery.md and follow them exactly.`,
    `Begin searching for the Rails app from: ${args.start_dir}`,
    'Do not ask questions and do not write files. Record any ambiguity in the notes field.',
    'Return the structured SDK facts object.',
  ].join('\n'),
  { label: 'discovery', agentType: 'general-purpose', schema: SDK_FACTS_SCHEMA, model: 'haiku', effort: 'high' },
)

return facts
