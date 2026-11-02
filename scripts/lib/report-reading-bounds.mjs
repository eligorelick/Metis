// Pure recorded-measurement guard; no browser or network access.
export const CLEARANCE_SLACK_PX = 48;
export function readingCheckFailures(s) {
 const failures=[];
 if(s.top<s.stickyBottom-2) failures.push("section under sticky strip");
 if(s.doc.scroll>s.doc.client+1) failures.push("document overflow");
 if(s.main && s.main.scroll>s.main.client+1) failures.push("main overflow");
 if(s.top>s.stickyBottom+CLEARANCE_SLACK_PX) failures.push("jump outside landing bound");
 if(s.hashAfter!=="#report-valuation" && s.scrollAfter===s.scrollBefore) failures.push("jump did not move");
 return failures;
}
