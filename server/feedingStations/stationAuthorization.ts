import { and, eq, sql, type SQL } from "drizzle-orm";
import { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { createPostgres } from "../db/connection.js";
import { feedingStations as stations, users } from "../db/schema.js";
import type { AuthIdentity } from "../users/userStore.js";
import { isPublicId } from "../utils/publicId.js";

type Database = ReturnType<typeof createPostgres>["db"];
export type StationPolicyTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

declare const principalBrand: unique symbol;
/** Internal capability bound to the transaction that resolved a verified identity. */
export interface StationPrincipal {
  readonly [principalBrand]: true;
}

export interface StationAuthorization {
  readonly stationId: string;
  readonly canView: true;
  readonly canManage: boolean;
}

const principals = new WeakMap<StationPrincipal, { tx: StationPolicyTransaction; userId: string }>();
const checkedTransactions = new WeakSet<StationPolicyTransaction>();
// Keep the caller's concrete schema generic; instanceof alone narrows it to the
// library's unspecialized transaction type.
const isNodeTransaction = (value: unknown): boolean => value instanceof NodePgTransaction;

async function requireReadCommitted(tx: StationPolicyTransaction): Promise<void> {
  // A pool/database cannot retain the station lock across the subsequent query.
  if (!isNodeTransaction(tx)) {
    throw new TypeError("Station authorization requires a READ COMMITTED transaction");
  }
  if (checkedTransactions.has(tx)) return;
  const result = await tx.execute<{ isolation: string }>(
    sql`select current_setting('transaction_isolation') as isolation`,
  );
  if (result.rows[0]?.isolation !== "read committed") {
    throw new TypeError("Station authorization requires a READ COMMITTED transaction");
  }
  // The identity query below establishes the transaction's first data snapshot;
  // PostgreSQL then disallows changing its isolation level within this transaction.
  checkedTransactions.add(tx);
}

/**
 * This is NOT authentication. Only the server's required-auth boundary may supply
 * its verified AuthIdentity; never pass a body/path identity or an unverified JWT.
 * Resolve only the currently stored internal UUID, without profile/contact data.
 * The opaque result cannot be reused in a different transaction.
 */
export async function resolveStationPrincipalFromVerifiedIdentity(
  tx: StationPolicyTransaction,
  identity: AuthIdentity | null,
): Promise<StationPrincipal | null> {
  if (!identity || !isPublicId(identity._id)) return null;
  await requireReadCommitted(tx);
  const [user] = await tx.select({ id: users.id }).from(users)
    .where(eq(users.publicId, identity._id.toLowerCase())).limit(1);
  if (!user) return null;
  const principal = Object.freeze({}) as StationPrincipal;
  principals.set(principal, { tx, userId: user.id });
  return principal;
}

function principalState(tx: StationPolicyTransaction, principal: StationPrincipal | null) {
  if (!principal) return undefined;
  const state = principals.get(principal);
  return state?.tx === tx ? state : undefined;
}

const currentAccount = (userId: string) => sql<boolean>`exists (
  select 1 from ${users} where ${users.id} = ${userId}
)`;
const isCreator = (userId: string) => sql<boolean>`${stations.createdBy} = ${userId}`;

/** Beta view policy: every current account can view every station. Stored
 * visibility and grants remain dormant metadata, never access predicates. */
export function stationViewPredicate(
  tx: StationPolicyTransaction,
  principal: StationPrincipal | null,
): SQL<boolean> {
  const state = principalState(tx, principal);
  if (!state) return sql<boolean>`false`;
  return currentAccount(state.userId);
}

/**
 * Caller owns a short READ COMMITTED transaction and all subsequent protected
 * reads/writes on that same client. Never retain this decision after commit or
 * perform external work while holding its lock. Station state writers must lock
 * the station FOR UPDATE before related state changes.
 *
 * Lock only the station ID first, without a pre-wait policy predicate. The second
 * statement rechecks the current account/owner after any lock wait.
 * Missing and denied stations both return null, without private station fields.
 * Activity/feed admission remains the protected feeding store's responsibility.
 */
export async function lockAndAuthorizeStation(
  tx: StationPolicyTransaction,
  principal: StationPrincipal | null,
  stationPublicId: string,
  action: "view" | "manage" = "view",
): Promise<StationAuthorization | null> {
  const state = principalState(tx, principal);
  if (!state || !isPublicId(stationPublicId)) return null;
  if (action !== "view" && action !== "manage") {
    throw new TypeError("Unsupported station authorization action");
  }
  await requireReadCommitted(tx);
  const [locked] = await tx.select({ id: stations.id }).from(stations)
    .where(eq(stations.publicId, stationPublicId.toLowerCase())).limit(1)
    .for(action === "manage" ? "update" : "share");
  if (!locked) return null;
  const policy = action === "manage"
    ? sql<boolean>`${currentAccount(state.userId)} and ${isCreator(state.userId)}`
    : stationViewPredicate(tx, principal);
  const [authorized] = await tx.select({ stationId: stations.id, canManage: isCreator(state.userId) })
    .from(stations).where(and(eq(stations.id, locked.id), policy)).limit(1);
  return authorized ? { stationId: authorized.stationId, canView: true, canManage: authorized.canManage } : null;
}
