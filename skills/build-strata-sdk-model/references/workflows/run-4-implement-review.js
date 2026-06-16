export const meta = {
  name: 'strata-model-implement-review',
  description: 'Implement the confirmed model via the SDK generator + TDD, then review and fix autonomously',
  phases: [
    { title: 'Implement', detail: 'plan, generate, TDD-strengthen, lint + test green' },
    { title: 'Review', detail: 'autonomous test-first fix loop until clean' },
  ],
}

phase('Implement')

const implReport = await agent(
  [
    'You are the implementation agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/implementation.md and follow them exactly.`,
    `Read the confirmed model spec at ${args.spec_path}.`,
    `Work inside the Rails app at ${args.rails_dir}.`,
    'Convert the confirmed spec into the committed plan, run the SDK generator, strengthen the model test-first,',
    'and get `make lint` and `make test` green. Then delete the temp spec file.',
    'Return a concise report: files written, generator command run, plan path, and final lint/test status.',
  ].join('\n'),
  { label: 'implementation', agentType: 'general-purpose' },
)

phase('Review')

const reviewReport = await agent(
  [
    'You are the review agent for the build-strata-sdk-model skill.',
    `Read your full instructions at ${args.refs_dir}/agents/review.md and follow them exactly.`,
    `Work inside the Rails app at ${args.rails_dir}.`,
    'Review the code changes just implemented. Fix clear correctness/lint/test issues TEST-FIRST and re-run',
    '`make lint` + `make test` until clean. Flag (do not silently apply) any change to intended public behavior.',
    'Implementation report for context:',
    implReport,
    'Return a report of findings and the fixes you applied.',
  ].join('\n'),
  { label: 'review', agentType: 'general-purpose' },
)

return { implReport, reviewReport }
