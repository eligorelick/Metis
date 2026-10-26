import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {VerificationLogEntrySchema,verificationEntryOutcomeLabel} from '@/report/schema';
import {ReportView} from '@/components/report/ReportView';
import {reportToAuditMarkdown} from '@/report/export/auditMarkdown';
import {loadTask28Fixture} from './helpers/task28Report';

// D-62: the verification log is part of the separate audit export; the live
// report links to it instead of rendering the log inline.
describe('numeric support never implies whole-prose verification',()=>{
 it('counts log entries without mislabeling supported prose as uncited in the audit export',()=>{
  const report=loadTask28Fixture();
  report.meta.reportId=7;
  report.appendix.verificationLog=[{claim:'Numeric provenance',outcome:'verified'},{claim:'Cited qualitative prose',outcome:'unverified',claimSupportStatus:'cited'},{claim:'Unchecked',outcome:'unverified',claimSupportStatus:'unreviewed'}];
  const audit=reportToAuditMarkdown(report);
  expect(audit).toContain('### Verification log');
  expect(audit).toContain('| Cited qualitative prose | Cited; prose unchecked |');
  expect(audit).not.toContain('| Cited qualitative prose | uncited |');
  expect(renderToStaticMarkup(createElement(ReportView,{report}))).toContain('href="/api/export/7?format=audit"');
 });
 it('labels cited unchecked prose consistently while retaining removed and legacy outcomes',()=>{
  const entry=VerificationLogEntrySchema.parse({claim:'A cited qualitative claim',outcome:'unverified',claimSupportStatus:'cited'});
  const report=loadTask28Fixture();report.appendix.verificationLog=[entry];
  expect(reportToAuditMarkdown(report)).toContain('Cited; prose unchecked');
  expect(verificationEntryOutcomeLabel({...entry,outcome:'removed'})).toBe('removed');
  expect(verificationEntryOutcomeLabel({claim:'Legacy',outcome:'unverified'})).toBe('uncited');
 });
 // Review of F-22: a contradicted claim was cited; its outcome said "uncited".
 it('labels a contradicted claim cited and contradicted, and a legacy metadata gap cited and unchecked',()=>{
  const contradicted:Parameters<typeof verificationEntryOutcomeLabel>[0]={claim:'Revenue was 9',outcome:'unverified',evidenceKind:'factual-claim',reason:'value-mismatch',validationStatus:'contradicted',claimSupportStatus:'contradicted'};
  expect(verificationEntryOutcomeLabel(contradicted)).toBe('Cited; contradicted by its source');
  expect(verificationEntryOutcomeLabel({...contradicted,reason:'period-word-mismatch'})).toBe('Cited; prose unchecked');
 });
 it('retains separate support dimensions and expresses them in the audit export',()=>{
  const entry=VerificationLogEntrySchema.parse({claim:'Revenue100; unrelated allegation',outcome:'unverified',validationStatus:'validated',numericSupportStatus:'validated',claimSupportStatus:'numeric-only'});
  expect(entry.numericSupportStatus).toBe('validated');
  const report=loadTask28Fixture();report.appendix.verificationLog=[entry];
  expect(reportToAuditMarkdown(report)).toContain('Numeric match; prose unchecked');
 });
});
