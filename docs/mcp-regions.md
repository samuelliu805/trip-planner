# Unified MCP gateway and regional authorization

The only recommended address is `https://therewego.world/mcp`, with issuer
`https://therewego.world`. The current client acceptance matrix is in `mcp-e2e.md`.
Implementation and SDK integration coverage do not establish real-client acceptance.

## Architecture and trust

The Global entry validates the existing opaque OAuth credential and reads current connection,
default and regional grants through `ai_gateway_service_v1`. Global retains `ai_invoke_v1`.
CN uses an HTTPS Regional API Adapter at `/api/ai/regional`, then the same `invokeTool`,
schemas, map runner and transactional business RPCs. Process-level provider selection never
changes per request. There is no model, sampling call or model API key.

Each service has a distinct ES256/P-256 key. The maintained `jose` library verifies caller,
issuer, audience, purpose, body digest, issue time, expiry and assertion ID. Assertions expire
after 30 seconds. CN checks the central credential and current binding through signed
introspection on **every invocation**, without a positive cache. CN receives no Global bearer
token. Its backend derives identity from a previously session-authenticated regional grant,
intersects scopes, checks local revocation, rejects assertion replay and calls the existing
RPC's current membership/permission checks. No API accepts service_role plus arbitrary user_id.

Revocation precedes cached receipts. A call already in progress may finish before concurrent
revocation; subsequent calls fail. Regional failure never redirects a write to another backend.
The ingress rate bucket binds the logical connection/user/issuer, so access-token rotation does
not reset it. Regional business buckets additionally bind the regional identity and resource.

## Binding and revocation

1. The signed-in Global user chooses **Bind CN account** on an owned connection at `/account/ai`.
2. A five-minute random state is stored as a digest and bound to that browser/connection.
3. CN loads the request using signed service authentication. The user signs in through CN's
   existing login, selects scopes and all/selected Trip access, then explicitly authorizes.
   `ai_regional_grant_v1` derives identity from that verified regional session.
4. A five-minute single-use code binds the result to that state and central connection. The
   callback requires the initiating browser and original Global account; a signed exchange
   consumes the code before the central binding is saved. Equal email or client-supplied
   user_id, region, locale, destination or IP never establishes identity.
5. Set a default once, unbind a region independently or revoke the entire central connection.
   CN grants expire after 30 days and require renewed consent. CN's account page can also revoke
   its local grant. Outer Code + S256 PKCE, access expiry and rotating refresh remain unchanged.

Existing Global grants migrate with their original permissions and no automatic CN rights.

## Resources and consistency

Bare UUIDs remain Global IDs; CN uses `cn:<uuid>`. `global:<uuid>` is also accepted. Only identity
fields are rewritten: Trip, Idea, day, variant, item, preview, selection, search, change and place
IDs retain regional ownership through results. Forging a prefix cannot bypass backend checks.
CN web copy-to-AI tasks use CN handles. Composite references spanning regions fail before an
adapter runs. New resources use an authorized default or optional root `region` intent; no
default requires an explicit choice. An Idea's nested `region` remains destination text.
Map provider configuration is independent of resource routing and never selects data ownership.

Aggregate lists use fixed Global/CN order and at most 50 total items per page, with `data_region`
on each item. `page:<uuid>` continuations bind positions, query, exact grant configuration,
connection and expiry in a private store. Failure is explicit (`partial`, regional `failures`),
and the failed region's position remains retryable. Single-region reads issue private cursors
too. Legacy Global UUID continuations remain accepted for compatibility.

Receipts, previews, selections and changes remain isolated by actor/local grant in each physical
database. Undo of an MCP change additionally requires its originating connection. Session-created
web changes retain actor/resource authorization for compatibility. Revision checks, preview expiry,
current collaboration, independent Idea snapshots and full transaction rollback remain intact.
There is no cross-region copy or multi-backend write transaction.

## Configuration and release

Apply the generated versions of `20261118120000_mcp_regional_grants.sql` and
`20261118121000_mcp_gateway_connections.sql` through the existing migration workflow. They are
additive, private/RLS-protected and deny browser access to service RPCs. Only the session-backed
grant creator and owner-checked management RPC receive authenticated execution permission.

| Setting                        | Global gateway                | CN service                     |
| ------------------------------ | ----------------------------- | ------------------------------ |
| Existing provider matrix       | Global/Supabase/Google        | CN/CloudBase/AMap              |
| `MCP_ENABLED`                  | `1`                           | `0`                            |
| `MCP_REGIONAL_GATEWAY_ENABLED` | `1`                           | `0`                            |
| `MCP_REGIONAL_API_ENABLED`     | `0`                           | `1`                            |
| `MCP_PUBLIC_ORIGIN`            | Trusted gateway issuer origin | Unused by regional API         |
| `MCP_GATEWAY_ORIGIN`           | Same gateway origin           | Same gateway origin            |
| `MCP_CN_API_ORIGIN`            | Trusted CN HTTPS origin       | Same CN HTTPS origin           |
| `MCP_SERVICE_PRIVATE_JWK`      | Gateway private P-256 JWK     | CN private P-256 JWK           |
| `MCP_SERVICE_PEER_PUBLIC_JWK`  | CN public-only JWK            | Gateway public-only JWK        |
| `MCP_PLACES_ENABLED`           | Existing Google configuration | Enable after AMap verification |

Keep separate service/environment keys. Never print values or put private JWKs in `NEXT_PUBLIC_*`.
Do not expose service assertions in URLs. Existing log/APM exclusions for Authorization, cookies,
OAuth codes and token bodies apply to regional calls too. HTTPS calls reject redirects, bound
request/response bodies and time out explicitly. Platform bypass secrets stay out of client setup.

Verify CN browser/server selectors, CloudBase env/region/PG target, complete migration ledger and
RPC ACLs, AMap browser key/security proxy/server key, site URL, safe login domains and exact Run
release SHA. Route the legacy authorization-server discovery path at the edge, before the
CloudBase reserved-path handler; `INVALID_ENV` is a failed check. CN discovery redirects to
the trusted unified discovery; old
`/mcp` and OAuth action endpoints return `410 MCP_MOVED`, without publishing a second issuer.

For EdgeOne, match both host `cn.therewego.world` and the exact path
`/.well-known/oauth-authorization-server`. Return `307` to
`https://therewego.world/.well-known/oauth-authorization-server`, dropping the original query.
Other CN requests use HTTPS/443 to the approved CloudBase HTTP service's `OriginDomain`, obtained
from `DescribeHTTPServiceRoute`, with `Host: cn.therewego.world`. Keep the public CN hostname out
of the upstream address to avoid a DNS loop. Disable caching for the authenticated CN host and
deploy its existing valid certificate before switching its CNAME to EdgeOne. Preserve the prior
CNAME for rollback and verify login, server actions and signed regional calls after switching.
The reviewed dev-target requests are `cloudbase/mcp-edgeone-origin.json` for
`ModifyAccelerationDomain` and `cloudbase/mcp-edgeone-rules.json` for `CreateL7AccRules`.
Read back the existing domain and rules first; update the matching rule rather than creating
duplicates. These files contain no credentials and do not change DNS or install a certificate.

`cloudbase/mcp-legacy-discovery-route.json` records the exact CloudBase route probe. CLI 3.8.1
rejects this reserved path locally; the platform API accepts it, but public requests still hit
`INVALID_ENV`. An accepted route configuration does not establish working discovery. Release
requires the actual edge response and unified issuer/resource, separately from application health.

Expired private OAuth, preview, rate, binding-request, cursor and regional-credential records
need operational expiry cleanup. Preserve durable receipts and audit history. Never delete
an unexplained record merely to turn a residue audit green.

## Verification and rollback

```sh
npm ci
npm run test:mcp
NONBLOCKING_CASE='trip settings reload appears' node scripts/nonblocking-editing-e2e.mjs
npm run check:auth-routes
npm run test:e2e:preflight
```

`test:mcp` runs two independent PostgreSQL 17 containers, complete regional migrations, the MCP
SDK client and real HTTP regional handlers. It covers proof exchange, routing, A/B, scope/Trip
isolation, concurrency, preview/commit, cursors, failures and revocation, alongside the existing
per-provider OAuth and full business tests. Containers are removed and independently audited
after failures too. This does not substitute for managed-service login or a real AI client's
browser/natural-language flow.

Release requires exact-SHA Global/CN live jobs, deployment, cleanup and residue audit from the
existing workflows, then public discovery and real business API checks on that deployment.
Health alone is insufficient. Record actual client version, date, mode, single address, both
regional results and post-revocation failure. Missing clients/logins stay pending. Local missing
credentials are not a live pass; protected exact-SHA CI can supply the equivalent regional gate.

For rollback, disable both regional feature switches and redeploy known-good artifacts with
matching configuration. Disable `MCP_ENABLED` too to stop all MCP access. For an identity incident,
revoke central connections and regional grants. Retain additive tables, Idea data, audit and
receipts; do not run destructive down migrations. Restore the prior CN route/config snapshot
through the deployment process. Re-enable only after fresh managed-service/client acceptance.
