export type Mutation = {
  /** The invariant code this mutation must trip. */
  code: string;
  /** Plain-words description of the defect being introduced. */
  why: string;
  mutate: (spec: Record<string, unknown>) => Record<string, unknown>;
};

export declare const MUTATIONS: Mutation[];
export declare const COVERED: string[];
export declare function run(): number;
