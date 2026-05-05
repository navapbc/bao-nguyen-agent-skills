// Form primitives: step indicator, fields, radio tile, memorable date,
// address group, action row, save modal.

const StepIndicator = ({ current, total, label }) => (
  <div className="step-indicator" aria-label={`Step ${current} of ${total}`}>
    <div className="step-indicator__bar" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            'step-indicator__seg' +
            (i + 1 < current ? ' step-indicator__seg--complete' :
             i + 1 === current ? ' step-indicator__seg--current' : '')
          }
        />
      ))}
    </div>
    <div className="step-indicator__heading">
      <span className="step-indicator__counter">{current}</span>
      <span className="step-indicator__of">of {total}</span>
      <span className="step-indicator__label">{label}</span>
    </div>
  </div>
);

const SaveExitButton = ({ onSave }) => (
  <div className="save-exit-row">
    <button type="button" className="save-exit" onClick={onSave}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save and exit
    </button>
  </div>
);

const TextField = ({ id, label, hint, value, onChange, error, type = 'text', maxWidth, autoComplete, inputMode, placeholder }) => (
  <div className={'usa-form-group' + (error ? ' usa-form-group--error' : '')}>
    <label className={'usa-label' + (error ? ' usa-label--error' : '')} htmlFor={id}>{label}</label>
    {hint && <span className="usa-hint">{hint}</span>}
    {error && (
      <span className="usa-error-message" role="alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M11 7h2v6h-2zm0 8h2v2h-2z" fill="#fff"/></svg>
        {error}
      </span>
    )}
    <input
      id={id}
      type={type}
      className={'usa-input' + (error ? ' usa-input--error' : '') + (maxWidth ? ' ' + maxWidth : '')}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      inputMode={inputMode}
      placeholder={placeholder}
    />
  </div>
);

const RadioTile = ({ name, value, checked, onChange, label, description, id }) => (
  <label className={'usa-radio usa-radio--tile' + (checked ? ' is-checked' : '')} htmlFor={id}>
    <input
      id={id}
      type="radio"
      className="usa-radio__input"
      name={name}
      value={value}
      checked={checked}
      onChange={() => onChange(value)}
    />
    <span className="usa-radio__label">{label}</span>
    {description && <span className="usa-radio__description">{description}</span>}
  </label>
);

const MemorableDate = ({ legend, hint, value = {}, onChange, error }) => {
  const update = (k, v) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="usa-fieldset">
      {legend && <legend className="usa-legend">{legend}</legend>}
      {hint && <span className="usa-hint">{hint}</span>}
      {error && (
        <span className="usa-error-message" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M11 7h2v6h-2zm0 8h2v2h-2z" fill="#fff"/></svg>
          {error}
        </span>
      )}
      <div className="memorable-date">
        <div className="memorable-date__group">
          <label className="memorable-date__label" htmlFor="dob-month">Month</label>
          <input id="dob-month" type="text" inputMode="numeric" maxLength="2" className="usa-input usa-input--xs" placeholder="MM" value={value.month || ''} onChange={(e) => update('month', e.target.value)} />
        </div>
        <div className="memorable-date__group">
          <label className="memorable-date__label" htmlFor="dob-day">Day</label>
          <input id="dob-day" type="text" inputMode="numeric" maxLength="2" className="usa-input usa-input--xs" placeholder="DD" value={value.day || ''} onChange={(e) => update('day', e.target.value)} />
        </div>
        <div className="memorable-date__group">
          <label className="memorable-date__label" htmlFor="dob-year">Year</label>
          <input id="dob-year" type="text" inputMode="numeric" maxLength="4" className="usa-input usa-input--year" placeholder="YYYY" value={value.year || ''} onChange={(e) => update('year', e.target.value)} />
        </div>
      </div>
    </fieldset>
  );
};

const NameFields = ({ value = {}, onChange }) => {
  const update = (k, v) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="usa-fieldset">
      <TextField
        id="name-first"
        label="First name"
        value={value.first}
        onChange={(v) => update('first', v)}
        autoComplete="given-name"
      />
      <TextField
        id="name-middle"
        label="Middle name"
        hint="Optional"
        value={value.middle}
        onChange={(v) => update('middle', v)}
        autoComplete="additional-name"
      />
      <TextField
        id="name-last"
        label="Last name"
        value={value.last}
        onChange={(v) => update('last', v)}
        autoComplete="family-name"
      />
      <TextField
        id="name-suffix"
        label="Suffix"
        hint="For example, Jr., Sr., II"
        value={value.suffix}
        onChange={(v) => update('suffix', v)}
        maxWidth="usa-input--small"
      />
    </fieldset>
  );
};

const US_STATES = [
  ['', '- Select -'],
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
  ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
  ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
  ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

const AddressFields = ({ value = {}, onChange }) => {
  const update = (k, v) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="usa-fieldset">
      <TextField id="addr-1" label="Street address" value={value.line1} onChange={(v) => update('line1', v)} autoComplete="address-line1" />
      <TextField id="addr-2" label="Street address line 2" hint="Apartment, suite, unit, etc. Optional." value={value.line2} onChange={(v) => update('line2', v)} autoComplete="address-line2" />
      <TextField id="addr-city" label="City" value={value.city} onChange={(v) => update('city', v)} autoComplete="address-level2" />
      <div className="usa-form-group">
        <label className="usa-label" htmlFor="addr-state">State</label>
        <select id="addr-state" className="usa-select" value={value.state || ''} onChange={(e) => update('state', e.target.value)}>
          {US_STATES.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>
      <TextField id="addr-zip" label="ZIP code" value={value.zip} onChange={(v) => update('zip', v)} autoComplete="postal-code" inputMode="numeric" maxWidth="usa-input--medium" />
    </fieldset>
  );
};

const FormActions = ({ onBack, onContinue, continueLabel = 'Continue', continueDisabled }) => (
  <div className="form-actions">
    {onBack && (
      <button type="button" className="usa-button usa-button--outline btn-back" onClick={onBack}>
        Back
      </button>
    )}
    <button
      type="button"
      className="usa-button"
      onClick={onContinue}
      disabled={continueDisabled}
      aria-disabled={continueDisabled || undefined}
    >
      {continueLabel}
    </button>
  </div>
);

const SaveModal = ({ open, onClose, onConfirm }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="save-title">Your progress is saved</h2>
        <p>You can return to this application from your dashboard at any time. We'll save your answers as you go.</p>
        <ul className="usa-button-group">
          <li><button className="usa-button" onClick={onConfirm}>Return to dashboard</button></li>
          <li><button className="usa-button usa-button--outline" onClick={onClose}>Keep going</button></li>
        </ul>
      </div>
    </div>
  );
};

Object.assign(window, {
  StepIndicator, SaveExitButton, TextField, RadioTile,
  MemorableDate, NameFields, AddressFields, FormActions, SaveModal,
});
