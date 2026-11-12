/** Committed accuracy-check data files and their shapes. */
import fs from "node:fs";
import path from "node:path";
import type { ExpectationEntry, FiledPoint, FigureUnit, ReferenceKind } from "./lib";
import type { CompanyConfig } from "./recipes";

const DIR = __dirname;
export const COMPANIES_FILE = path.join(DIR, "companies.json");
export const REFERENCE_FILE = path.join(DIR, "reference.json");
export const EXPECTATION_FILE = path.join(DIR, "expectation.json");

export interface ReferenceEntry {
  case: string;
  figure: string;
  period: string | null;
  value?: number;
  kind?: ReferenceKind;
  /** What the filed value measures once scaled and translated for comparison (P3, P4); required on an established entry. */
  unit?: FigureUnit;
  /** The comparison currency: the filed currency, or the report's valuation currency after the stated translation; null for shares and percents. */
  currency?: string | null;
  formula?: string;
  operands?: number[];
  points?: (FiledPoint & { role: string; sign: 1 | -1 })[];
  notes?: string[];
  /** Why the filed value could not be established. */
  unresolved?: string;
  /** Why this company uses a non-default recipe. */
  recipeWhy?: string;
}

export interface ReferenceFile {
  about: string;
  source: string;
  builtFrom: string;
  cases: Record<string, { ticker: string; cik: number; entityName: string | null; cutoffAt: string; currency: string }>;
  entries: ReferenceEntry[];
}

export interface ExpectationFile {
  about: string;
  entries: ExpectationEntry[];
}

export function readCompanies(file = COMPANIES_FILE): CompanyConfig[] {
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { companies: CompanyConfig[] }).companies;
}

export function readReference(file = REFERENCE_FILE): ReferenceFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as ReferenceFile;
}

export function readExpectation(file = EXPECTATION_FILE): ExpectationFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as ExpectationFile;
}
