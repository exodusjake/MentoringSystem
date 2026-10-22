// Renders [{ value, label }] / [{ group, options }] lists (e.g. MentorSchools.courseOptions) as
// <option>s and <optgroup>s.
export default function OptionList({ options }) {
  return options.map((o, i) => o.group
    ? <optgroup key={'g' + i} label={o.group}>{o.options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
    : <option key={o.value} value={o.value}>{o.label}</option>);
}
