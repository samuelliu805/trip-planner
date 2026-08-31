import type {
  AppFunctionArgs,
  AppFunctionName,
  AppFunctionResult,
  AppInsert,
  AppRow,
  AppTableName,
  AppUpdate,
} from "./database";

export type RelationalError = Readonly<{
  code?: string;
  message: string;
}>;

export type RelationalResult<Result> = Readonly<{
  count?: number | null;
  data: Result | null;
  error: RelationalError | null;
}>;

type SingleResult<Result> = Result extends ReadonlyArray<infer Item> ? Item : Result;

export interface RelationalQuery<Result, Row extends Record<string, unknown>> extends PromiseLike<
  RelationalResult<Result>
> {
  contains(column: string, value: string | readonly unknown[] | Record<string, unknown>): this;
  eq(column: string, value: unknown): this;
  gt(column: string, value: unknown): this;
  gte(column: string, value: unknown): this;
  ilike(column: string, pattern: string): this;
  in(column: string, values: readonly unknown[]): this;
  is(column: string, value: boolean | null): this;
  like(column: string, pattern: string): this;
  limit(count: number): this;
  lt(column: string, value: unknown): this;
  lte(column: string, value: unknown): this;
  maybeSingle(): RelationalQuery<SingleResult<Result> | null, Row>;
  neq(column: string, value: unknown): this;
  not(column: string, operator: string, value: unknown): this;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this;
  range(from: number, to: number): this;
  select<Selected extends Record<string, unknown> = Row>(
    columns?: string,
  ): RelationalQuery<Selected[], Row>;
  single(): RelationalQuery<SingleResult<Result>, Row>;
}

export interface RelationalTable<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
  Update extends Record<string, unknown>,
> {
  delete(options?: { count?: "estimated" | "exact" | "planned" }): RelationalQuery<null, Row>;
  insert(
    values: Insert | readonly Insert[],
    options?: { count?: "estimated" | "exact" | "planned"; defaultToNull?: boolean },
  ): RelationalQuery<null, Row>;
  select<Selected extends Record<string, unknown> = Row>(
    columns?: string,
    options?: {
      count?: "estimated" | "exact" | "planned";
      head?: boolean;
    },
  ): RelationalQuery<Selected[], Row>;
  update(
    values: Update,
    options?: { count?: "estimated" | "exact" | "planned" },
  ): RelationalQuery<null, Row>;
  upsert(
    values: Insert | readonly Insert[],
    options?: {
      count?: "estimated" | "exact" | "planned";
      defaultToNull?: boolean;
      ignoreDuplicates?: boolean;
      onConflict?: string;
    },
  ): RelationalQuery<null, Row>;
}

export interface RelationalDatabase {
  from<TableName extends AppTableName>(
    table: TableName,
  ): RelationalTable<AppRow<TableName>, AppInsert<TableName>, AppUpdate<TableName>>;
  rpc<FunctionName extends AppFunctionName, Result = AppFunctionResult<FunctionName>>(
    name: FunctionName,
    parameters: AppFunctionArgs<FunctionName>,
  ): RelationalQuery<Result, Record<string, unknown>>;
}
