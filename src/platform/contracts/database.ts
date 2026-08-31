import type { Database } from "@/types/database";

type PublicSchema = Database["public"];

export type AppTableName = keyof PublicSchema["Tables"];
export type AppFunctionName = keyof PublicSchema["Functions"];

export type AppRow<TableName extends AppTableName> = PublicSchema["Tables"][TableName]["Row"];

export type AppInsert<TableName extends AppTableName> = PublicSchema["Tables"][TableName]["Insert"];

export type AppUpdate<TableName extends AppTableName> = PublicSchema["Tables"][TableName]["Update"];

export type AppFunctionArgs<FunctionName extends AppFunctionName> =
  PublicSchema["Functions"][FunctionName]["Args"];

export type AppFunctionResult<FunctionName extends AppFunctionName> =
  PublicSchema["Functions"][FunctionName]["Returns"];
