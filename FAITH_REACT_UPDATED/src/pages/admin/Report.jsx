import EvaluationReport from '../shared/EvaluationReport.jsx';

// ADMIN_/HTML/evaluation-ratings.html
const CFG = { pageId: 'ADMIN_/evaluation-ratings', base: '/admin', admin: true };
export default function Report() {
  return <EvaluationReport cfg={CFG} />;
}
