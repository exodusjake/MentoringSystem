// <option>/<optgroup> children from [{ label: group label or null, options: [{ value, label }] }]
// (the shape MentorSchools.courseOptionGroups / deptOptionGroups return).
export default function OptionGroups({ groups }) {
  return groups.map((g, i) => g.label === null
    ? g.options.map(o => <option key={`${i}:${o.value}`} value={o.value}>{o.label}</option>)
    : <optgroup key={i} label={g.label}>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>);
}
