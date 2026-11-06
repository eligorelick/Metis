import { conceptFactsSchema, CORE_FACT_FORMS, parseFactPoints, type CompanyFacts } from "./xbrl";
import { REVENUE_TAGS, BROAD_REVENUE_TOTAL_TAGS, CONTRACT_REVENUE_TAGS, INCOME_BEFORE_TAX_TAGS } from "./tagSynonyms";
import { derivedRoundingAllowance, vendorAgreesWithFiled } from "./vendorAgreement";
import type { FmpIncomeStatementRow, StatementFieldProvenance } from "@/providers/fmp";

/** Bounded proof, not a general table extractor. Every printed amount between
 * sales and pretax must have a known role, including subtotal checks. Unknown
 * rows, overlapping totals, dates, or columns close the proof. */
export interface PrimaryIncomeStatement {
  periodEnd: string; months: number; revenue: number; totalIncome: number;
  operatingIncome: number; pretax: number; grossProfit?: number; costOfRevenue?: number;
  components: { label: string; role: string; value: number }[];
  roundingResidual: number; scale: number;
  /** Nonzero changed-operations result in this statement's own period column. */
  presentationChange?: boolean;
}
export interface PrimaryIncomeDocument {
  text: string; accession: string; filed: string; form: string; url: string;
}
export interface BoundPrimaryIncome extends PrimaryIncomeStatement {
  proof: StatementFieldProvenance;
  /** Historical proof remains evidence, but cannot override a later recast. */
  superseded?: boolean;
}
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const monthWords: Record<string,number> = { three:3, six:6, nine:9, twelve:12 };
const amount = String.raw`(?:\(?-?\d[\d,]*(?:\.\d+)?\)?%?|-)`;
const number = (s: string) => s === "-" ? 0 : (s.startsWith("(") ? -1 : 1) * Number(s.replace(/[(),%]/g,""));
type Role = "sales" | "sales-part" | "income-total" | "income" | "cost" | "cost-part" | "sga" | "sga-part" | "operating" | "operating-income" | "expense" | "cost-total" | "gross" | "pretax";
function role(label: string): Role | null {
  const s = label.toLowerCase().replace(/&/g,"and").replace(/[,():/]/g," ").replace(/\s+/g," ").trim();
  if (/^(?:income|earnings|profit).*(?:before|pre.tax).*(?:tax|equity)/.test(s)) return "pretax";
  if (/^total (?:revenues?|income) and other income$/.test(s)) return "income-total";
  if (/^(?:(?:net|total) )?(?:sales|revenues?)(?: to customers| and other operating revenues?)?$/.test(s)) return "sales";
  if (/^(?:product|service|alliance|royalty|products|services)(?: sales| revenues?)?$/.test(s)) return "sales-part";
  if (/^gross profit$/.test(s)) return "gross";
  if (/^(?:total )?cost(?:s)? of (?:sales|revenues?|products and services sold|goods and services sold)$/.test(s)) return "cost";
  if (/^cost(?:s)? of (?:products sold|services sold|services|sales of products)$/.test(s)) return "cost-part";
  if (/^(?:total )?(?:selling.*administrative|marketing.*selling.*administrative|general and administrative)(?: expenses?| costs?)?$/.test(s)) return "sga";
  if (/^(?:demand creation|operating overhead) expense$/.test(s)) return "sga-part";
  if (!s || /^total costs?(?: expenses)?(?: and other(?: deductions)?)?$/.test(s)) return "cost-total";
  // Word order identifies the printed sign convention. An explicit operating
  // qualifier cannot be swallowed by the generic nonoperating other-net role.
  if (/^other operating (?:income )?expenses?(?: net)?$|^other operating costs?(?: net)?$/.test(s)) return "operating";
  if (/^other operating (?:expense )?income(?: net)?$/.test(s)) return "operating-income";
  if (/^other operating\b/.test(s)) return null;
  if (/^interest(?: and other)? (?:income|and other income)$/.test(s) || /^interest & other income$/.test(s)) return "income";
  if (/^(?:income loss from (?:equity|unconsolidated) affiliates|income from equity affiliates|equity (?:income|earnings)|other income(?: loss)?)$/.test(s)) return "income";
  if (/^(?:interest$|interest.*expense|interest and other financial charges|loss on debt extinguishment|gain on deconsolidation of subsidiary|other.*income.*expense|other income.*deductions.*net|other components of net periodic benefit costs|non.service.*benefit expense|non.service.*benefit cost)/.test(s)) return "expense";
  if (/^(?:research and (?:development|engineering)|acquired in.process research and development|in.process research and development impairments|asset impairment.*|impairment.*|restructuring.*|merger.*integration.*|amortization of intangible.*|purchased crude oil and products|crude oil and product purchases|production and manufacturing|operating expenses|exploration.*|depreciation.*|taxes other than.*|other taxes and duties)(?: expenses?| costs?)?$/.test(s)) return "operating";
  return null;
}
function columns(header: string): { end: string; months: number }[] | null {
  const datePattern = new RegExp(`(${months.join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?`,"gi");
  const dates = [...header.matchAll(datePattern)];
  const years = [...header.matchAll(/\b20\d{2}\b/g)].map(m=>m[0]);
  if (years.length < 2 || years.length > 4 || !dates.length) return null;
  const windows = [...header.matchAll(/\b(Three|Six|Nine|Twelve) Months Ended\b/gi)].map(m=>monthWords[m[1]!.toLowerCase()]!);
  if (!windows.length && /\b(?:years? ended|fiscal years?)\b/i.test(header)) windows.push(12);
  if (!windows.length && /\b(?:fiscal )?(?:first|second|third|fourth) quarter ended\b/i.test(header)) windows.push(3);
  if (!windows.length || windows.length > 2 || windows.length === 2 && years.length !== 4) return null;
  if (dates.length !== 1 && dates.length !== years.length && dates.length !== windows.length) return null;
  return years.map((y,i)=>{
    const d = dates.length === years.length ? dates[i]! : dates.length === 1 ? dates[0]! : dates[Math.floor(i/2)]!;
    return { end:`${y}-${String(months.findIndex(m=>m.toLowerCase()===d[1]!.toLowerCase())+1).padStart(2,"0")}-${d[2]!.padStart(2,"0")}`,
      months:windows.length===1 ? windows[0]! : windows[Math.floor(i/2)]! };
  });
}
export function parsePrimaryIncomeStatements(raw: string): PrimaryIncomeStatement[] {
  const text = raw.replace(/stateme\s+nt/gi,"statement").replace(/[\u2010-\u2015\u2212\ufffd]/g,"-")
    .replace(/\(\s+/g,"(").replace(/\s+\)/g,")").replace(/\s+/g," ");
  const headings = [...text.matchAll(/\b(?:condensed )?consolidated (?:condensed )?statements? of (?:income|operations|earnings)\b/gi)];
  const out: PrimaryIncomeStatement[] = [];
  for (const h of headings) {
    const section = text.slice(h.index!,h.index!+6500);
    const start = /\b(?:(?:Net|Total) (?:sales|revenues?)|Sales(?: to customers| and other operating revenues?)?|Revenues?(?: Services)?|Product sales|Product revenues?)\s*(?:\(Note \d+\))?\s+\$?\s*[\d(]/i.exec(section);
    if (!start || start.index > 900) continue;
    const header = section.slice(0,start.index), cols = columns(header);
    if (!cols || /\bsegment|adjusted|non.gaap\b/i.test(header)) continue;
    if(/\b(?:Canadian|Australian|Hong Kong|Singapore|New Zealand) dollars\b|\b(?:CAD|AUD|HKD|SGD|NZD|EUR|GBP|JPY|CNY|RMB|euros?|yuan|yen|pounds)\b/i.test(header)) continue;
    const scale = /\b(?:in|of) millions\b|\(millions\b/i.test(header) ? 1e6 : /\b(?:in|of) thousands\b/i.test(header) ? 1e3 : null;
    if (!scale || !/\$|dollars/i.test(section.slice(0,start.index+start[0].length))) continue;
    const percent = /percent to sales/i.test(header), n = cols.length * (percent ? 2 : 1);
    const endPattern = /\b(?:Income|Earnings|Profit)(?:\/? ?\(Loss\))? (?:from continuing operations )?before (?:provision(?:\/\(benefit\))? for )?(?:income )?tax(?:es| expense)?(?: on income)?(?: and equity (?:losses|income))?\b/i;
    const body = section.slice(start.index), end = endPattern.exec(body);
    if (!end) continue;
    const rest = body.slice(end.index + end[0].length).replace(/\$/g,"").trimStart();
    const endNums = new RegExp(`^${amount}(?:\\s+${amount}){${n-1}}`).exec(rest);
    if (!endNums) continue;
    const cells = new RegExp(`^([^\\d]*?)(${amount}(?:\\s+${amount}){${n-1}})(?=\\s|$)`);
    // An affirmative financial row belongs to the statement/period. A remote
    // narrative mention (including "no discontinued operations") does not.
    let followingRows = rest.slice(endNums[0].length).replace(/\(Note\s*\d+\)|\([a-z]\)/gi, "").trim();
    let discontinuedValues: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = cells.exec(followingRows);
      if (!next) break;
      const label = next[1]!.trim();
      if (/^Net (?:\(loss\) income|income(?: \(loss\))?|loss(?: \(income\))?) from discontinued operations(?:,? net of (?:income )?tax(?:es)?)?$/i.test(label)) {
        discontinuedValues = next[2]!.match(new RegExp(amount, "g"))!.map(number);
        if (percent) discontinuedValues = discontinuedValues.filter((_, j) => j % 2 === 0);
        break;
      }
      if (!/^(?:Tax expense|Income tax(?:es| expense| benefit)(?: \((?:expense|benefit)\))?|Provision for (?:income )?taxes|Equity (?:loss|income)|Net (?:income(?: \(loss\))?|\(loss\) income) from continuing operations)$/i.test(label)) break;
      followingRows = followingRows.slice(next[0].length).trim();
    }
    let table = body.slice(0,end.index)+end[0]+" "+endNums[0];
    table = table.replace(/\$/g,"").replace(/\(Note\s*\d+\)|\([a-z]\)/gi,"")
      .replace(/(?<!Total )\bCosts?,? expenses?,? and other:?|(?<!Total )\bCosts and Other Deductions:?|(?<!Total )\bCosts and expenses:?|\bExpenses (?=Cost of)/gi,"")
      .replace(/\s+%/g,"%").trim();
    const rows: { label: string; role: Role; values: number[] }[] = [];
    let bad = false;
    while (table) {
      const m = cells.exec(table);
      if (!m) { bad=true; break; }
      const label=m[1]!.trim().replace(/^Revenue\s+(?=Services)/i,"").replace(/^Costs and expenses\s+/i,"");
      const r=role(label);
      if (!r) { bad=true; break; }
      let values=m[2]!.match(new RegExp(amount,"g"))!.map(number);
      if (percent) values=values.filter((_,i)=>i%2===0);
      rows.push({label,role:r,values});
      table=table.slice(m[0].length).trim();
      if(rows.length>30){bad=true;break;}
    }
    if(bad || rows.at(-1)?.role!=="pretax") continue;
    for(let col=0;col<cols.length;col++) {
      const groups=(r:Role)=>rows.filter(x=>x.role===r);
      const sum=(rs:typeof rows)=>rs.reduce((a,r)=>a+r.values[col]!,0);
      const single=(r:Role)=>groups(r).length===1 ? groups(r)[0]!.values[col]! : null;
      const sales=single("sales") ?? (groups("sales-part").length>=2 ? sum(groups("sales-part")) : null);
      if(sales===null || groups("sales").length>1 || groups("cost").length>1 || groups("sga").length>1 || groups("cost-total").length>1 || groups("income-total").length>1) continue;
      if(groups("sales-part").length && single("sales")!==null && sum(groups("sales-part"))!==sales) continue;
      const splitProductCost=groups("sales-part").some(r=>/^product sales$/i.test(r.label)) && groups("sales-part").some(r=>/^services$/i.test(r.label)) &&
        groups("cost-part").length===1 && /^cost of services$/i.test(groups("cost-part")[0]!.label) && groups("cost").length===1 && /^cost of sales$/i.test(groups("cost")[0]!.label);
      const gross=single("gross");
      const grossProvesFullCost=groups("cost-part").length===1 && gross!==null && sales-sum(groups("cost-part"))===gross;
      const cost=splitProductCost ? single("cost")!+sum(groups("cost-part")) : single("cost") ?? (groups("cost-part").length>=2 || grossProvesFullCost ? sum(groups("cost-part")) : null);
      if(!splitProductCost && groups("cost-part").length && single("cost")!==null && sum(groups("cost-part"))!==cost) continue;
      if(cost!==null && gross!==null && sales-cost!==gross) continue;
      const sga=single("sga") ?? (groups("sga-part").length>=2 ? sum(groups("sga-part")) : 0);
      if(groups("sga-part").length && single("sga")!==null && sum(groups("sga-part"))!==sga) continue;
      // Interest income printed inside the expense block is signed as a
      // deduction (e.g. (186)); above the cost block it is positive income.
      const firstCost=rows.findIndex(r=>["cost","cost-part","operating","operating-income","sga","gross"].includes(r.role));
      const income=sum(groups("income").map(r=>rows.indexOf(r)>firstCost && /^interest income$/i.test(r.label) ? {...r,values:r.values.map(v=>-v)} : r));
      const opCosts=(cost ?? (gross!==null ? sales-gross : 0))+sga+sum(groups("operating"))-sum(groups("operating-income"));
      const expenses=opCosts+sum(groups("expense"));
      if(firstCost<0 || !groups("expense").length && !groups("income").length || groups("cost-part").length===1 && cost===null) continue;
      const total=single("income-total") ?? sales+income;
      if(single("income-total")!==null && total!==sales+income) continue;
      const printedCosts=single("cost-total"), pretax=single("pretax")!;
      const residual=pretax-(total-expenses);
      // Use only the existing filed-operand rounding allowance, capped at 1%.
      // Retain the actual residual; never describe a rounded bridge as exact.
      const allowance=Math.min(derivedRoundingAllowance(rows.filter(r=>!["gross","cost-total","income-total","sales-part","cost-part","sga-part"].includes(r.role)).map(r=>r.values[col]!*scale)), Math.abs(pretax*scale)/100);
      if(Math.abs(residual*scale)>allowance || printedCosts!==null && Math.abs((printedCosts-expenses)*scale)>allowance) continue;
      out.push({periodEnd:cols[col]!.end,months:cols[col]!.months,revenue:sales*scale,totalIncome:total*scale,
        operatingIncome:(sales-opCosts)*scale,pretax:pretax*scale,
        ...(gross!==null ? {grossProfit:gross*scale} : {}),...(cost!==null ? {costOfRevenue:cost*scale} : {}),
        components:rows.map(r=>({label:r.label,role:r.role,value:r.values[col]!*scale})),roundingResidual:residual*scale,scale,
        presentationChange: (Number.isFinite(discontinuedValues[col]) && discontinuedValues[col]!==0) ||
          rows.some(r=>/^gain on deconsolidation of subsidiary$/i.test(r.label) && r.values[col]!==0)});
    }
  }
  return out;
}

/** Two independent duration anchors bind printed columns to the actual start,
 * currency and core filing. A release also needs later core duration facts;
 * its preliminary identity is retained, never relabelled as the later 10-Q. */
export function bindPrimaryIncome(doc: PrimaryIncomeDocument, facts: CompanyFacts, cutoff: string, observedAt: string): BoundPrimaryIncome[] {
  if(doc.filed>cutoff || Number(/\/edgar\/data\/(\d+)\//.exec(doc.url)?.[1])!==facts.cik) return [];
  const revenueTags=[...REVENUE_TAGS,...BROAD_REVENUE_TOTAL_TAGS];
  const allValues=Object.entries(facts.facts["us-gaap"] ?? {}).flatMap(([tag,raw])=>{
    if(!revenueTags.includes(tag) && tag!=="OperatingIncomeLoss" && !INCOME_BEFORE_TAX_TAGS.includes(tag)) return [];
    const parsed=conceptFactsSchema.safeParse(raw);
    return parsed.success ? parseFactPoints(parsed.data.units.USD ?? []).filter(p=>p.start && p.filed<=cutoff && CORE_FACT_FORMS.has(p.form)).map(p=>({...p,tag})) : [];
  });
  const values=allValues.filter(p=>CORE_FACT_FORMS.has(doc.form) ? p.accn===doc.accession && p.filed===doc.filed : p.filed>=doc.filed);
  const superseded=(anchor:typeof allValues[number]):boolean=>{
    const later=allValues.filter(p=>p.tag===anchor.tag && p.start===anchor.start && p.end===anchor.end && p.filed>anchor.filed);
    const latest=later.map(p=>p.filed).sort().at(-1);
    return latest!==undefined && later.some(p=>p.filed===latest && !vendorAgreesWithFiled(p.val,anchor.val));
  };
  return parsePrimaryIncomeStatements(doc.text).flatMap(p=>{
    if(p.months!==3 && p.months!==12) return [];
    const anchors=values.filter(v=>v.end===p.periodEnd && (Date.parse(v.end)-Date.parse(v.start!))/86400000 >= (p.months===12?300:60) &&
      (Date.parse(v.end)-Date.parse(v.start!))/86400000 <= (p.months===12?400:100));
    const pairs=anchors.filter(v=>revenueTags.includes(v.tag) && (vendorAgreesWithFiled(v.val,p.revenue)||vendorAgreesWithFiled(v.val,p.totalIncome)))
      .flatMap(r=>anchors.filter(v=>INCOME_BEFORE_TAX_TAGS.includes(v.tag) && v.start===r.start && v.accn===r.accn && v.filed===r.filed && vendorAgreesWithFiled(v.val,p.pretax)).map(t=>({r,t})));
    if(!pairs.length || new Set(pairs.map(x=>x.r.start)).size!==1) return [];
    const pair=pairs.sort((a,b)=>b.r.filed.localeCompare(a.r.filed))[0]!;
    const priorOperating=allValues.filter(v=>v.tag==="OperatingIncomeLoss" && v.start===pair.r.start && v.end===pair.r.end && v.filed<=pair.r.filed);
    const lastOperatingDate=priorOperating.map(v=>v.filed).sort().at(-1);
    const oldOperating=priorOperating.filter(v=>v.filed===lastOperatingDate);
    const operatingAnchors=oldOperating.length ? oldOperating : [{...pair.r,tag:"OperatingIncomeLoss",val:p.operatingIncome}];
    const isSuperseded=superseded(pair.r)||superseded(pair.t)||operatingAnchors.some(superseded);
    return [{...p,...(isSuperseded?{superseded:true}:{}),proof:{source:"edgar" as const,unit:"USD",periodStart:pair.r.start!,periodEnd:p.periodEnd,observedAt,
      tags:[`us-gaap/${pair.r.tag}`,`us-gaap/${pair.t.tag}`],calculation:"complete-operating-reconciliation" as const,
      filings:[{accn:pair.r.accn,filed:pair.r.filed,form:pair.r.form}],documents:[{accession:doc.accession,filed:doc.filed,form:doc.form,url:doc.url}]}}];
  });
}

/** An older tag cannot resolve its own demonstrated scope conflict. Require
 * unchanged same-period sales in that filing, so a legitimate sales recast
 * alone does not indict the operating tag family. */
export function contradictedOperatingTag(primary: readonly BoundPrimaryIncome[], facts: CompanyFacts, cutoff: string): boolean {
  const operating=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.OperatingIncomeLoss);
  if(!operating.success) return false;
  const revenue=[...REVENUE_TAGS,...BROAD_REVENUE_TOTAL_TAGS].flatMap(tag=>{
    const raw=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    return raw.success ? parseFactPoints(raw.data.units.USD ?? []) : [];
  });
  return primary.some(p=>parseFactPoints(operating.data.units.USD ?? []).some(o=>o.start===p.proof.periodStart && o.end===p.periodEnd && o.filed<=cutoff && CORE_FACT_FORMS.has(o.form) &&
    !vendorAgreesWithFiled(o.val,p.operatingIncome) && revenue.some(r=>r.start===o.start && r.end===o.end && r.accn===o.accn && r.filed===o.filed && vendorAgreesWithFiled(r.val,p.revenue))));
}

/** A later comparative with an explicit changed-operations presentation can
 * establish a new perimeter, even when the annual base has not been recast. */
export function primaryPerimeterChange(primary: readonly BoundPrimaryIncome[], facts: CompanyFacts): {filed:string;reason:string} | null {
  const revenue=[...REVENUE_TAGS,...BROAD_REVENUE_TOTAL_TAGS].flatMap(tag=>{
    const raw=conceptFactsSchema.safeParse(facts.facts["us-gaap"]?.[tag]);
    return raw.success ? parseFactPoints(raw.data.units.USD ?? []).map(p=>({...p,tag})) : [];
  });
  const revised=primary.filter(p=>{
    if(p.superseded || p.months!==3 || !p.presentationChange) return false;
    const prior=revenue.filter(r=>r.start===p.proof.periodStart && r.end===p.periodEnd && r.filed<p.proof.documents![0]!.filed && CORE_FACT_FORMS.has(r.form));
    // Statement binding may use total income, not operating sales. Establish
    // sales separately from the same core filing and duration before comparing
    // historical concepts; an unchanged income total is not a sales recast.
    const currentSales=revenue.filter(r=>r.start===p.proof.periodStart && r.end===p.periodEnd && CORE_FACT_FORMS.has(r.form) &&
      p.proof.filings.some(f=>f.accn===r.accn && f.filed===r.filed) && vendorAgreesWithFiled(r.val,p.revenue));
    const candidates=prior.filter(r=>currentSales.some(current=>current.tag===r.tag));
    const latest=candidates.map(r=>r.filed).sort().at(-1);
    const comparable=candidates.filter(r=>r.filed===latest);
    // Nor can a broad historical anchor establish operating-sales scope when
    // that same filing separately reports a different sales/contract amount.
    const sales=prior.filter(r=>r.filed===latest && comparable.some(c=>c.accn===r.accn) &&
      (r.tag==="SalesRevenueNet" || CONTRACT_REVENUE_TAGS.includes(r.tag)));
    if(sales.some(r=>!vendorAgreesWithFiled(r.val,comparable[0]!.val))) return false;
    return comparable.length>0 && comparable.every(r=>vendorAgreesWithFiled(r.val,comparable[0]!.val)) && !vendorAgreesWithFiled(comparable[0]!.val,p.revenue);
  });
  const p=revised.sort((a,b)=>b.proof.documents![0]!.filed.localeCompare(a.proof.documents![0]!.filed))[0];
  if(!p) return null;
  const d=p.proof.documents![0]!;
  return {filed:d.filed,reason:`Current operating perimeter differs from the older annual/quarterly presentation: ${d.form} ${d.accession} filed ${d.filed} presents discontinued or deconsolidated operations and restates comparative sales for ${p.periodEnd} to ${p.revenue} ${p.proof.unit}. A coherent current base on that perimeter is required; the older presentation cannot be published as a matched current valuation.`};
}

export function applyPrimaryIncome(row: FmpIncomeStatementRow, evidence: readonly BoundPrimaryIncome[]): FmpIncomeStatementRow {
  const matches=evidence.filter(p=>!p.superseded && p.periodEnd===row.date && p.proof.unit===row.reportedCurrency &&
    (row.periodStart==null || row.periodStart===p.proof.periodStart) && (row.period==="FY" ? p.months===12 : p.months===3));
  const latest=matches.sort((a,b)=>b.proof.documents![0]!.filed.localeCompare(a.proof.documents![0]!.filed))[0];
  if(!latest || matches.some(p=>p.proof.documents![0]!.filed===latest.proof.documents![0]!.filed && (p.revenue!==latest.revenue||p.operatingIncome!==latest.operatingIncome))) return row;
  return {...row,primaryIncomeProof:latest,revenue:latest.revenue,operatingIncome:latest.operatingIncome,
    ...(latest.grossProfit!==undefined?{grossProfit:latest.grossProfit}:{}),...(latest.costOfRevenue!==undefined?{costOfRevenue:latest.costOfRevenue}:{}),
    fieldProvenance:{...row.fieldProvenance,revenue:latest.proof,operatingIncome:latest.proof,
      ...(latest.grossProfit!==undefined?{grossProfit:{...latest.proof,tags:["primary/GrossProfit"]}}:{}),
      ...(latest.costOfRevenue!==undefined?{costOfRevenue:{...latest.proof,tags:["primary/CostOfRevenue"]}}:{})},
    filedIncomeLines:{...row.filedIncomeLines,"primary-sales":{value:latest.revenue,role:"operating-sales",proof:latest.proof}}};
}
