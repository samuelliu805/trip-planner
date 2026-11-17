import "server-only";
import {
  getPrivilegedRelationalDatabase,
  getRelationalDatabase,
} from "@/platform/composition/server";
import type { AppFunctionArgs, AppFunctionName } from "@/platform/contracts/database";
import type { Rpc } from "./service";

export function privilegedAiRpc(): Rpc {
  const database = getPrivilegedRelationalDatabase();
  return async (name, args) =>
    database.rpc(name as AppFunctionName, args as AppFunctionArgs<AppFunctionName>);
}
export async function browserAiRpc(): Promise<Rpc> {
  const database = await getRelationalDatabase();
  return async (name, args) =>
    database.rpc(name as AppFunctionName, args as AppFunctionArgs<AppFunctionName>);
}
