import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {VerificationLogEntrySchema,verificationEntryOutcomeLabel} from '@/report/schema';
import {ReportView} from '@/components/report/ReportView';
import {reportToMarkdown} from '@/report/export/markdown';
import {reportToPrintBody} from '@/report/export/printHtml';
import {loadTask28Fixture} from './helpers/task28Report';

describe('numeric support never implies whole-prose verification',()=>{
 it('labels cited unchecked prose consistently while retaining removed and legacy outcomes',()=>{
  const entry=VerificationLogEntrySchema.parse({claim:'A cited qualitative claim',outcome:'unverified',claimSupportStatus:'cited'});
  const report=loadTask28Fixture();report.appendix.verificationLog=[entry];
  for(const output of [reportToMarkdown(report),reportToPrintBody(report),renderToStaticMarkup(createElement(ReportView,{report}))])expect(output).toContain('Cited; prose unchecked');
  expect(verificationEntryOutcomeLabel({...entry,outcome:'removed'})).toBe('removed');
  expect(verificationEntryOutcomeLabel({claim:'Legacy',outcome:'unverified'})).toBe('uncited');
 });
 it('retains separate support dimensions and expresses them on all three surfaces',()=>{
  const entry=VerificationLogEntrySchema.parse({claim:'Revenue100; unrelated allegation',outcome:'unverified',validationStatus:'validated',numericSupportStatus:'validated',claimSupportStatus:'numeric-only'});
  expect(entry.numericSupportStatus).toBe('validated');
  const report=loadTask28Fixture();report.appendix.verificationLog=[entry];
  for(const output of [reportToMarkdown(report),reportToPrintBody(report),renderToStaticMarkup(createElement(ReportView,{report}))])expect(output).toContain('Numeric match; prose unchecked');
 });
});
