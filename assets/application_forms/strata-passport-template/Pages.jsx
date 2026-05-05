// Page-level components for the passport application flow.
// Pages mirror the Strata "question_page" pattern: one focused question
// per page (with a tweak to allow grouping name + DOB together).

const FLOW_TOTAL = 6; // 1 Intro, 2 Name (+DOB), 3 DOB (or skipped if grouped), 4 Place of birth, 5 Address, 6 Review

const Dashboard = ({ applications, onResume, onStart, onView }) => {
  const inProgress = applications.filter(a => a.status === 'in_progress');
  const actionNeeded = applications.filter(a => a.status === 'action_needed');
  const inReview = applications.filter(a => a.status === 'in_review');
  const submitted = applications.filter(a => a.status === 'submitted');
  const decided = applications.filter(a => a.status === 'approved' || a.status === 'denied');

  const renderCard = (app) => {
    const tagClass = {
      in_progress: 'usa-tag--in-progress',
      action_needed: 'usa-tag--action-needed',
      in_review: 'usa-tag--in-review',
      submitted: 'usa-tag--submitted',
      approved: 'usa-tag--approved',
      denied: 'usa-tag--denied',
    }[app.status];
    const tagLabel = {
      in_progress: 'In progress',
      action_needed: 'Action needed',
      in_review: 'Under review',
      submitted: 'Submitted',
      approved: 'Approved',
      denied: 'Decision issued',
    }[app.status];
    const meta = app.status === 'in_progress' ? `Started ${app.startedAt} · Application #${app.id}`
      : app.status === 'action_needed' ? `Response needed by ${app.dueAt} · Application #${app.id}`
      : app.status === 'in_review' ? `Submitted ${app.submittedAt} · Confirmation #${app.confirmation}`
      : `Submitted ${app.submittedAt} · Confirmation #${app.confirmation}`;
    const actionLabel = app.status === 'in_progress' ? 'Continue'
      : app.status === 'action_needed' ? 'Provide response'
      : 'View';
    const actionPrimary = app.status === 'in_progress' || app.status === 'action_needed';
    const onClick = app.status === 'in_progress' ? () => onResume(app.id) : () => onView(app.id);
    return (
      <li className="app-card" key={app.id}>
        <div className="app-card__main">
          <span className={'usa-tag ' + tagClass}>{tagLabel}</span>
          <h3 className="app-card__title">Passport application</h3>
          <p className="app-card__meta">{meta}</p>
          {app.status === 'in_progress' && (
            <div className="app-card__progress" aria-label={`${app.percent}% complete`}>
              <div className="app-card__progress-bar">
                <div className="app-card__progress-fill" style={{width: app.percent + '%'}} />
              </div>
              <span>{app.percent}% complete</span>
            </div>
          )}
          {app.status === 'action_needed' && app.actionDetail && (
            <p className="app-card__meta" style={{color: 'var(--color-error-dark)', fontWeight: 700, margin: '0.25rem 0 0'}}>{app.actionDetail}</p>
          )}
        </div>
        <div className="app-card__action">
          <button
            className={'usa-button' + (actionPrimary ? '' : ' usa-button--outline')}
            onClick={onClick}
          >{actionLabel}</button>
        </div>
      </li>
    );
  };

  const sections = [
    { key: 'action', title: 'Action needed', items: actionNeeded },
    { key: 'in_progress', title: 'In progress', items: inProgress },
    { key: 'in_review', title: 'Under review', items: inReview },
    { key: 'submitted', title: 'Submitted', items: submitted },
    { key: 'decided', title: 'Past applications', items: decided },
  ].filter(s => s.items.length > 0);

  return (
    <React.Fragment>
      <section className="dashboard-hero">
        <div className="dashboard-hero__inner">
          <h1>Your applications</h1>
          <p className="dashboard-hero__lede">
            Apply for a U.S. passport. You can save your progress and return at any time before submitting.
          </p>
        </div>
      </section>
      <main className="app-main">
        <div className="app-container">
          <button className="usa-button" onClick={onStart} style={{marginTop: '0.5rem'}}>
            Start a new application
          </button>

          {sections.map(section => (
            <React.Fragment key={section.key}>
              <h2 className="section-heading">{section.title}</h2>
              <ul className="app-card-list">{section.items.map(renderCard)}</ul>
            </React.Fragment>
          ))}

          {applications.length === 0 && (
            <p style={{marginTop: '2rem', color: 'var(--fg-muted)'}}>You don't have any applications yet.</p>
          )}
        </div>
      </main>
    </React.Fragment>
  );
};

const FormPageShell = ({ stepIndex, label, onSave, children }) => (
  <main className="app-main">
    <div className="app-container app-container--narrow form-page">
      <SaveExitButton onSave={onSave} />
      <StepIndicator current={stepIndex} total={FLOW_TOTAL} label={label} />
      {children}
    </div>
  </main>
);

const IntroPage = ({ onStart, onSave }) => (
  <FormPageShell stepIndex={1} label="Start" onSave={onSave}>
    <h1>Apply for a U.S. passport</h1>
    <p className="form-page__lede">
      We'll ask for your name, date and place of birth, and a current mailing address. You can save your answers and finish later.
    </p>
    <div className="form-actions" style={{borderTop: 0, marginTop: '1rem', paddingTop: 0}}>
      <button type="button" className="usa-button" onClick={onStart}>Start</button>
    </div>
  </FormPageShell>
);

const NameDobPage = ({ data, setData, onBack, onContinue, onSave, grouped }) => {
  // grouped=true: name + DOB on one page (step 2). grouped=false: name on step 2, DOB on step 3.
  return (
    <FormPageShell stepIndex={2} label="Personal information" onSave={onSave}>
      <h1>{grouped ? 'Tell us about yourself' : "What's your full legal name?"}</h1>
      <p className="form-page__hint">
        {grouped
          ? 'Enter your name exactly as it appears on a government-issued ID, and your date of birth.'
          : 'Enter your name exactly as it appears on a government-issued ID.'}
      </p>
      <NameFields value={data.name} onChange={(v) => setData({ ...data, name: v })} />
      {grouped && (
        <React.Fragment>
          <hr style={{border: 0, borderTop: '1px solid var(--color-base-lighter)', margin: '2rem 0 1.5rem'}} />
          <MemorableDate
            legend="Date of birth"
            hint="For example: 04 28 1986"
            value={data.dob}
            onChange={(v) => setData({ ...data, dob: v })}
          />
        </React.Fragment>
      )}
      <FormActions onBack={onBack} onContinue={onContinue} />
    </FormPageShell>
  );
};

const DobPage = ({ data, setData, onBack, onContinue, onSave }) => (
  <FormPageShell stepIndex={3} label="Personal information" onSave={onSave}>
    <h1>What's your date of birth?</h1>
    <MemorableDate
      hint="For example: 04 28 1986"
      value={data.dob}
      onChange={(v) => setData({ ...data, dob: v })}
    />
    <FormActions onBack={onBack} onContinue={onContinue} />
  </FormPageShell>
);

const PlaceOfBirthPage = ({ data, setData, onBack, onContinue, onSave, stepIndex }) => {
  const setField = (k, v) => setData({ ...data, placeOfBirth: { ...data.placeOfBirth, [k]: v } });
  const pob = data.placeOfBirth || {};
  const inUS = pob.country === 'US' || pob.country === undefined;
  return (
    <FormPageShell stepIndex={stepIndex} label="Place of birth" onSave={onSave}>
      <h1>Where were you born?</h1>
      <p className="form-page__hint">This information must match your birth certificate or other proof of citizenship.</p>

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Country of birth</legend>
        <RadioTile
          id="pob-us" name="pob-country" value="US"
          checked={pob.country === 'US' || !pob.country}
          onChange={(v) => setField('country', v)}
          label="United States"
        />
        <RadioTile
          id="pob-other" name="pob-country" value="other"
          checked={pob.country === 'other'}
          onChange={(v) => setField('country', v)}
          label="Another country"
          description="You'll be asked for the country and any additional documentation needed."
        />
      </fieldset>

      {inUS ? (
        <React.Fragment>
          <TextField
            id="pob-city"
            label="City of birth"
            value={pob.city}
            onChange={(v) => setField('city', v)}
          />
          <div className="usa-form-group">
            <label className="usa-label" htmlFor="pob-state">State or U.S. territory</label>
            <select id="pob-state" className="usa-select" value={pob.state || ''} onChange={(e) => setField('state', e.target.value)}>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <TextField
            id="pob-foreign-country"
            label="Country"
            value={pob.foreignCountry}
            onChange={(v) => setField('foreignCountry', v)}
          />
          <TextField
            id="pob-foreign-city"
            label="City of birth"
            value={pob.city}
            onChange={(v) => setField('city', v)}
          />
        </React.Fragment>
      )}

      <FormActions onBack={onBack} onContinue={onContinue} />
    </FormPageShell>
  );
};

const AddressPage = ({ data, setData, onBack, onContinue, onSave, stepIndex }) => (
  <FormPageShell stepIndex={stepIndex} label="Mailing address" onSave={onSave}>
    <h1>What's your mailing address?</h1>
    <p className="form-page__hint">
      We'll send your passport book and any letters about your application to this address.
    </p>
    <AddressFields value={data.address} onChange={(v) => setData({ ...data, address: v })} />
    <FormActions onBack={onBack} onContinue={onContinue} />
  </FormPageShell>
);

const formatName = (n = {}) => {
  const parts = [n.first, n.middle, n.last, n.suffix].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
};
const formatDob = (d = {}) => {
  if (!d.month || !d.day || !d.year) return null;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const m = parseInt(d.month, 10);
  if (isNaN(m) || m < 1 || m > 12) return `${d.month}/${d.day}/${d.year}`;
  return `${months[m - 1]} ${parseInt(d.day, 10)}, ${d.year}`;
};
const formatPob = (p = {}) => {
  if (p.country === 'other') {
    return [p.city, p.foreignCountry].filter(Boolean).join(', ') || null;
  }
  return [p.city, p.state].filter(Boolean).join(', ') || null;
};
const formatAddress = (a = {}) => {
  if (!a.line1) return null;
  const line2 = a.line2 ? `\n${a.line2}` : '';
  const cityState = [a.city, a.state].filter(Boolean).join(', ');
  return `${a.line1}${line2}\n${cityState} ${a.zip || ''}`.trim();
};

const ReviewPage = ({ data, stepIndex, onBack, onSubmit, onSave, onEdit, grouped }) => {
  const sections = [
    {
      key: 'name',
      title: grouped ? 'Personal information' : 'Name',
      editTo: grouped ? 'name-dob' : 'name',
      rows: [
        ['Full legal name', formatName(data.name)],
        grouped ? ['Date of birth', formatDob(data.dob)] : null,
      ].filter(Boolean),
    },
    !grouped && {
      key: 'dob',
      title: 'Date of birth',
      editTo: 'dob',
      rows: [['Date of birth', formatDob(data.dob)]],
    },
    {
      key: 'pob',
      title: 'Place of birth',
      editTo: 'pob',
      rows: [
        ['Country', data.placeOfBirth?.country === 'other' ? data.placeOfBirth?.foreignCountry || null : 'United States'],
        ['City and state', formatPob(data.placeOfBirth)],
      ],
    },
    {
      key: 'addr',
      title: 'Mailing address',
      editTo: 'address',
      rows: [['Address', formatAddress(data.address)]],
    },
  ].filter(Boolean);

  return (
    <FormPageShell stepIndex={stepIndex} label="Review and submit" onSave={onSave}>
      <h1>Review your answers</h1>
      <p className="form-page__hint">
        Check everything carefully. You can change any answer before submitting. After you submit, you'll need to contact the agency to make corrections.
      </p>

      {sections.map(section => (
        <section className="review-summary" key={section.key} aria-labelledby={`rs-${section.key}`}>
          <header className="review-summary__header">
            <h2 className="review-summary__title" id={`rs-${section.key}`}>{section.title}</h2>
            <button type="button" className="usa-button--unstyled review-summary__edit" onClick={() => onEdit(section.editTo)}>
              Edit<span className="usa-sr-only"> {section.title}</span>
            </button>
          </header>
          <dl className="review-summary__list">
            {section.rows.map(([label, value]) => (
              <div className="review-summary__row" key={label}>
                <dt>{label}</dt>
                <dd className={value ? '' : 'empty'}>{value || 'Not provided'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <div className="form-actions">
        <button type="button" className="usa-button usa-button--outline btn-back" onClick={onBack}>Back</button>
        <button type="button" className="usa-button" onClick={onSubmit}>Submit application</button>
      </div>
    </FormPageShell>
  );
};

const ConfirmationPage = ({ data, onDashboard }) => (
  <main className="app-main">
    <div className="app-container app-container--narrow form-page">
      <div className="confirmation">
        <h2>Your application has been submitted</h2>
        <p>Thanks, {data.name?.first || 'applicant'}. We've received your passport application.</p>
      </div>

      <div className="confirmation-meta">
        <div>
          <p className="confirmation-meta__label">Confirmation number</p>
          <p className="confirmation-meta__value">{data.confirmation}</p>
        </div>
        <div>
          <p className="confirmation-meta__label">Submitted on</p>
          <p className="confirmation-meta__value" style={{fontFamily: 'var(--font-sans)'}}>{data.submittedAt}</p>
        </div>
      </div>

      <h2 style={{fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginTop: '2rem'}}>What happens next</h2>
      <ol style={{lineHeight: 1.6, fontSize: '1rem', maxWidth: '60ex'}}>
        <li>You'll get an email confirmation within 1 hour.</li>
        <li>An agent will review your application within 10 business days.</li>
        <li>If we need anything else, we'll send a letter to the mailing address you provided.</li>
      </ol>

      <ul className="usa-button-group" style={{marginTop: '2rem'}}>
        <li><button className="usa-button" onClick={onDashboard}>Return to dashboard</button></li>
        <li><a href="#" className="usa-button usa-button--outline" onClick={(e) => { e.preventDefault(); window.print(); }}>Print this page</a></li>
      </ul>
    </div>
  </main>
);

Object.assign(window, {
  Dashboard, IntroPage, NameDobPage, DobPage, PlaceOfBirthPage,
  AddressPage, ReviewPage, ConfirmationPage, FLOW_TOTAL,
});
