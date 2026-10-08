// Read-only rendering of the frozen development baseline. No candidate or holdout reads.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {validateAdjudicationLedger,qualityDimensions} from './programming-quality-adjudication.ts';

const source = new URL('../docs/verification/programming-quality/baseline-report.json', import.meta.url);
const text = fs.readFileSync(source, 'utf8');
const baseline = JSON.parse(text);
const reviewRoot=new URL('../docs/verification/programming-quality/',import.meta.url);
const ledger=JSON.parse(fs.readFileSync(new URL('development-adjudication.json',reviewRoot),'utf8'));
const validation=validateAdjudicationLedger(text,
  fs.readFileSync(new URL('baseline-and-rubric.md',reviewRoot),'utf8'),
  fs.readFileSync(new URL('signal-review-decisions.md',reviewRoot),'utf8'),ledger);
if(!validation.valid)throw Error(`Adjudication evidence rejected: ${validation.issues.join(', ')}`);
if (baseline.cases.length !== 24 || new Set(baseline.cases.map(item => item.id)).size !== 24) throw Error('Unexpected baseline roster');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const json = value => `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;
const dimensions = ['Evidence fidelity', 'Outcome and athlete fit', 'Prescription suitability', 'Whole-week feasibility', 'Monitoring/adaptation judgment', 'Executable clarity and consistency'];
const cards = baseline.cases.map((item, index) => {
  const review=ledger.cases.find(row=>row.caseId===item.id).review;
  const reviewState=review?.status==='partial'?'partial':review?'complete':'unreviewed';
  const reviewText=review
    ? `<section data-review-state="${reviewState}"><h3>${reviewState==='partial'?'Partially reviewed — not complete':'Complete review record'}</h3>
      <p>Reviewer: ${escape(review.reviewer)}; ${escape(review.reviewedAt)}. Source: ${escape(review.decisionSource)}</p>
      <ul>${qualityDimensions.map((key,i)=>`<li>${dimensions[i]}: ${review.scores[key]===null?(reviewState==='partial'?'Not reviewed':'Not applicable'):`${review.scores[key]} — ${['unacceptable','material correction needed','usable within stated scope'][review.scores[key]]}`}</li>`).join('')}</ul>
      <p>${escape(review.rationale)}</p><p>Expected decision: ${escape(review.expectedDecision)}</p>
      <ul>${review.prohibitedInferences.map(value=>`<li>${escape(value)}</li>`).join('')}</ul></section>`
    : '<p data-review-state="unreviewed">Unreviewed.</p>';
  const summary = item.plan
    ? item.plan.sessions.map(session => `${session.day}: ${session.title} (${session.scheduledMinutes} minutes)`).join('; ')
    : `Blocked: ${item.error}`;
  return `<article id="case-${index + 1}"><h2>${index + 1}. ${escape(item.id)}</h2><p>${escape(item.question)}</p>
    <p><strong>Frozen compiler result, not an approved prescription:</strong> ${escape(summary)}</p>
    <details><summary>Complete inputs and source evidence</summary>${json(item.input)}</details>
    <details><summary>Retrieved context and prepared profile</summary>${json({ context: item.context, preparedProfile: item.preparedProfile })}</details>
    <details><summary>Complete frozen output, including every set and instruction</summary>${json({ plan: item.plan, error: item.error })}</details>
    ${reviewText}<p>Remaining review: expected action; prohibited inference; unreviewed dimensions; reason; what would change the decision.</p></article>`;
}).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Programming baseline review</title><style>body{font:17px/1.5 system-ui;margin:0 auto;padding:24px;max-width:980px;background:#f4f7f6;color:#182722}article{background:white;border:1px solid #ccd7d1;padding:20px;margin:20px 0;border-radius:12px}h1{font-size:28px}h2{font-size:20px;overflow-wrap:anywhere}summary{cursor:pointer;padding:12px;min-height:24px}pre{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f4;padding:12px}li{margin:8px 0}a{color:#126044}nav a{display:block;padding:8px}</style></head><body>
  <h1>Programming baseline: 24 development cases</h1><p>Historical synthetic compiler output for coaching review. These are not workouts prescribed to you and not candidate results. No holdout content is included. This page stores no responses and makes no network requests.</p>
  <p>Score 0: unacceptable; 1: material correction needed; 2: usable within stated scope. A blocker is not a usable week. Partial records keep unknown dimensions unreviewed and never count as complete or usable. Not-applicable scores are allowed only in complete reviews where no program exists.</p>
  <p>Recorded complete reviews: ${validation.reviewedCases}. Partial reviews: ${validation.partiallyReviewedCases}. Usable compiled weeks: ${validation.usableCompiledCases}. Calibration recorded: ${validation.calibrationRecorded?'yes':'no'}.</p>
  <ol>${dimensions.map(d => `<li>${escape(d)}</li>`).join('')}</ol><p>Review complete inputs and output before judging. A generated explanation, a compiled result, or a passing test is not a coaching-quality score.</p>
  <nav>${baseline.cases.map((item, index) => `<a href="#case-${index + 1}">${index + 1}. ${escape(item.id)}</a>`).join('')}</nav>${cards}</body></html>`;
const directory = new URL('../output/programming-quality-review/', import.meta.url);
fs.mkdirSync(directory, { recursive: true });
const output = new URL('development-review.html', directory);
fs.writeFileSync(output, html);
console.log(JSON.stringify({ output: output.pathname, cases: 24, baselineCanonicalSha256: createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex'), reviewedCases:validation.reviewedCases,partiallyReviewedCases:validation.partiallyReviewedCases,usableCompiledCases:validation.usableCompiledCases, holdoutReads: 0, networkCalls: 0 }));
