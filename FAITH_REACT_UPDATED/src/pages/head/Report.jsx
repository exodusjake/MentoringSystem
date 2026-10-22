import EvaluationReport from '../shared/EvaluationReport.jsx';

// HEAD/HTML/evaluation-ratings.html
const CFG = { pageId: 'HEAD/evaluation-ratings', base: '/head', admin: false };
export default function Report() {
  return <EvaluationReport cfg={CFG} />;
}
