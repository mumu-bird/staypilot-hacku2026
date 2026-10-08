# Product progress — 2026-10-09

## Explain filtered room results

RollingGo detail normalization now preserves response-level diagnostics: received plan count, plans excluded by local filters, and the subset excluded when cancellation terms cannot be verified. Both ID and name lookups use the shared normalizer. Workflow room-query evidence copies these counts; candidate display and readable export report them in English/Chinese. Legacy records without these fields remain unchanged.

These counts cover the response received under the submitted platform query, not all hotel inventory. A platform response with zero plans differs from locally excluding plans with incomplete cancellation evidence; neither proves sold out or market-wide absence. Counts do not grant purchasing permission or establish final taxes, refund fees or live stock.

172 tests and production build passed. Regression covers unknown cancellation, known nonrefundable cancellation, no returned plans, unfiltered responses and copying query evidence without aliasing. Browser diagnostic counts use explicitly synthetic local state; old actual observations are not rewritten. No new merchant query or real order in this iteration. All changes remain local; GitHub untouched.

30 browser integration checks passed, including explicit received/excluded/unknown-cancellation count rendering with synthesized diagnostics. Updated local service is running. This verifies presentation and local rules, not new provider facts or purchasing capability.

## Freshness gate for nearby discovery

Nearby expansion now independently checks destination map observation and returned nearby-lead observation against the existing explicit-timezone freshness rule (0–15 minutes old). Stale, future and unzoned inputs stop before merchant calls; stale destination stops before nearby lookup. Original records remain unchanged and running state is released on failure. 174 tests and production build passed, including six invalid-time integration cases across two stages and current-time success paths.

Real workflow endpoint acceptance 2026-10-09 00:03:50–00:03:55 Shanghai reused original October 9–10, two-adult query and 600-yuan ceiling/free-cancellation requirement. Fresh map returned ten leads; attempted two formerly failed leads plus one new Qinfu Xiaoyuan lead. One platform record retained with CANCELABLE metadata, zero received plans and zero local exclusions. Its map/platform identity and route are still incomplete; no acceptable quote or purchase inferred. Other two lookups failed safely. Next retry correctly recorded at 00:18:55 Shanghai. Evidence: `cases/live-fresh-map-expansion-20261009.json`. No new order or GitHub write.

## Main-flow map-coordinate freshness

Main live search, independent cross-platform discovery, single-hotel refresh and model-requested route supplementation now invoke freshness-aware hotel identity lookup. Initial/supplemental map POIs with stale, future or unzoned observation timestamps remain in diagnostic observations but are excluded from coordinate matching. A new supplemental timestamp cannot renew an old selected POI. Destination map timestamps are checked separately before route construction.

Freshness is evaluated against a live clock after network responses, not a frozen request-start instant; otherwise normal delayed responses would incorrectly appear to be future observations. Existing pure identity tests may supply no freshness clock; production call sites supply Date.now.

178 tests and production build passed. Added tests cover stale coordinates followed by fresh empty results, valid current coordinates, future/unzoned coordinates, delayed responses, and main live-search stale destination/hotel cases with zero route-tool calls. Local fake dependency responses are not merchant observations. No new provider request, order or GitHub write in this change.

## First-confirmation gate in the real workflow

The HTTP server now constructs workflow sessions with `requireQueryConsent: true`. A new session or legacy session with no confirmed scope must confirm real trip/policy conditions through the existing authorize endpoint before live run, nearby expansion, refresh, recheck, model reassessment, inspection selection or monitor start. Historical record reads and query-only recorded replay remain available. Confirmation with recorded mode is rejected. Existing stored confirmations, withdrawal and scope mismatch rules continue to apply. The standalone provider debug tools are separate from this workflow authorization scope; this is not full account authentication.

179 tests and production build passed. Strict production-mode regression covers first session, reopening unconfirmed sessions, zero tool calls before confirmation, no scope from recorded confirmation and persistence of valid confirmation. Actual running HTTP endpoints run/expand/refresh/recheck rejected unconfirmed requests before tool use. Evidence: `cases/workflow-first-consent-http-validation-20261009.json`. No merchant query, real order or GitHub write in this iteration.

Initial browser run reached the nearby-record test but compared an October 8 candidate list with the newer October 9 session result. Updated the fixture selection and expected candidate count to follow the latest saved actual case. Historical evidence was not changed; this was a test-fixture mismatch, not an authorization failure. Browser rerun pending.

Browser rerun completed: 30 integration checks passed, including preference confirmation against the stricter running server and current persisted October 9 nearby observation. No new merchant request during browser acceptance.

## In-flight monitoring deadline boundaries

Monitoring now checks user deadline, completed-check cap and original quote cancellation-window deadline immediately after a round finishes. It stops instead of temporarily remaining enabled with a next-check timestamp already in the past. A response marked unchanged cannot extend a cancellation deadline. Observations may be retained; purchase permission and individual source freshness remain separately checked. Generation guards continue to preserve explicit user stop/withdrawal during requests.

182 tests and production build passed. Added deterministic simulated checks for an in-flight user deadline crossing, exactly 48 completed rounds (no 49th call), and a quote response arriving after cancellation expiry (no second recheck). These tests use controlled clocks/dependency results, not live merchant transactions or long-term production monitoring. No external platform request, real order or GitHub write in this iteration.

## Full integrated real workflow acceptance — 00:16 Shanghai

New production session explicitly confirmed unchanged trip/policy scope, then ran all live providers and Jev. Actual request 00:16:13–00:17:15 Shanghai returned 14 platform candidate records (not 14 unique hotels), 83 normalized room plans in two unfiltered RollingGo responses, routes for eight records, and two separate 15-review analyses with Jev 1.13.0. Top-level errors were empty; individual evidence gaps remain.

Jev candidate inspection choice confidence 0.37, quote task confidence 0.90 bound to the FlyAI TimeWalk hotel record. Eight displayed tradeoff options blocked by free-cancellation floor; no live acceptable-option tradeoff recommendation claimed. This does not prove market-wide absence or bookability, and no price savings calculated from unmatched terms. No real order or GitHub write.

Evidence: `cases/live-integrated-product-validation-20261009.json`. User-facing report: `real-integrated-product-validation-20261009.md`; standalone English report: `reports/real-hotel-product-validation-20261009.html`.

Final acceptance: 182 unit tests, 31 browser integration checks and production build passed. New browser case reads the actual saved production session and checks count/budget/consent UI without new provider calls.

## Evidence-based recovery guidance

Outcome now shows up to three prioritized inspection targets from observed candidates with no known rule exclusion, favoring supported room tools with known routes when quotes are missing. Each target lists missing room/route/review evidence and offers the existing gated room refresh; it is not a new recommendation or purchase conclusion. Common free-cancellation conflict is only displayed when every shown option is blocked for that explicit reason under a required-cancellation policy. Raising budget alone is not presented as resolving cancellation requirements. No hotel/price or authorized limit is invented or changed.

184 tests and production build passed. Real saved October 9 case regression prioritizes Xinqiao's missing quotes and verifies immutable source data; mixed hard violations and empty option sets cannot become a false common cancellation diagnosis.

31 browser integration checks passed with added actual saved full-case assertions for the cancellation conflict, prioritized Xinqiao quote gap and consent-disabled refresh action. No new provider query during browser verification. Local service is running with the updated recovery UI.

## Recovery evidence age awareness

Priority inspection now independently marks existing room observations and route observations stale/future/unzoned using the same 15-minute rule as inspection selection. Missing evidence remains distinct from stale evidence. Supported candidates can refresh rooms and route instead of implying already-present evidence is current. The UI updates its recovery clock every second, cleans up the timer on unmount, and retains consent gating. Review sample presence is not subjected to this price/route freshness rule.

185 tests and production build passed. New regression covers existing stale rooms/routes and future/unzoned timestamps. Saved actual-case ranking tests evaluate against that observation's completion time to distinguish recorded-time facts from current-time UI behavior. No provider request, order or GitHub write.

31 browser integration checks passed after adding the recovery age flags and refresh action labels. Existing saved-case assertions accept the age-appropriate room-fetch or combined-refresh action while confirming consent-disabled behavior. No live provider calls during this browser run.

## Raw offer flags and two real targeted rechecks

Same-terms signature now includes raw cancelable and hasWindow flags in addition to textual policy, derived cancellation/window state, plan name, bed/meal/occupancy/currency and other observed room terms. A changed raw flag cannot be hidden behind an unchanged derived unknown state or room-name classification. 186 tests and production build passed, including lower-priced responses with changed cancellation/window flags producing terms_changed and null delta.

Actual same-plan rechecks at 00:31:30 and 00:31:32 Shanghai: first response not_found; second response found original TimeWalk plan and display estimate 303 yuan versus original 257 yuan observation at 00:16:53, delta +4600 cents. Difference is against original baseline because first response had no usable price; not a change between the two new requests. No sold-out/restock inference or final quote claim. Free-cancellation floor still blocks selection.

Evidence: `cases/live-same-plan-two-rechecks-20261009.json`; user-facing report: `real-same-plan-rechecks-20261009.md`. No transaction or GitHub write. Updated local service running.

## Price baseline continuity and selection safety

Targeted rechecks now read the newest comparable-price observation for the exact session/run/hotel/plan from persisted history, rather than falling back to the initial quote whenever the latest attempt lacks a response. Lookup uses bound parameters and all matching history; display-list pagination does not lose the baseline. New metadata identifies original-query or recheck baseline and counts intervening unsuccessful attempts. Cards show comparison-baseline time and explicitly explain that gaps have no comparable price. Legacy records remain unchanged.

Original inspection selection cannot become valid merely because two observations of changed terms repeat unchanged. Selection checks and selected-valid state compare latest returned terms to the original selected room; refresh/reassessment is required if different.

187 tests and production build passed. Regression covers valid observation then not_found then failure then new price with delta against the last valid observation, and an unchanged recheck of new terms not restoring original selection. No real provider request, transaction or GitHub write in this iteration.

31 browser integration checks passed. Synthetic quote-card states explicitly verify baseline observation wording, two skipped attempts and no claimed change against empty responses; real saved records continue displaying their original facts. No new merchant calls during browser verification. Local service restarted successfully.

## Scoped recheck history and retained block state

Added readonly `/api/live/workflow/rechecks` with mandatory own-session run ID and optional hotel/plan filters. Plan filters require a hotel; returned history is newest-first and bounded to 50. Parameter binding, validated IDs and own-run existence prevent cross-session retrieval. A SQLite expression index supports the trip/hotel/plan lookup as history grows.

Selection validity now retrieves the selected plan's last recheck directly rather than searching the global latest 30 displayed entries. More than 30 unrelated observations cannot hide changed terms and restore the original selection. Tests cover filtering, 50-record bound, foreign sessions, invalid IDs, and 35 unrelated rechecks preserving the block.

Actual running HTTP validation read the two saved real TimeWalk rechecks in their owning session; a new session returned zero records for the same request. It did not query the merchant again. Evidence: `cases/scoped-recheck-history-http-validation-20261009.json`. This iteration adds backend history access; no new history-browsing UI claimed. No order or GitHub write.

188 tests and production build passed after the lookup index and scoped retrieval changes. No browser UI changed this iteration; previous browser result is not presented as a new run.

## Exact-plan history UI

Added on-demand saved-history disclosure next to each displayed rate-plan recheck action. It fetches own-session trip/hotel/plan history (up to 50), retains individual times and comparison baselines, explains that no new merchant query occurs, handles errors/retry and rejects mismatched run/hotel/plan data. Pending requests abort on unmount or identity change; stale responses cannot replace another quote's history. Viewing history requires no new purchase permission and does not execute rechecks.

Quote cards now show actual observed currency, or explicitly unknown, instead of labeling every historical observation CNY. Comparable deltas remain subject to server's CNY same-terms rule. Legacy metadata is not invented.

188 tests and production build passed. Browser acceptance pending against the two actual saved TimeWalk rechecks, plus a synthetic out-of-scope response/retry branch. No new merchant requests, orders or GitHub modification in this implementation.

Browser acceptance completed: 32 integration checks passed. The exact-plan disclosure reads the two actual saved observations (not_found and price_changed), displays 257/303 estimates with scope disclaimer, rejects a synthesized foreign-run response without adopting its marker, and recovers after retry. Browser requests only read the local saved-history endpoint; no merchant query or transaction.

## Explicit evidence-time rendering

Quote recheck cards and room-query evidence now use one strict timestamp renderer. Only valid explicit-timezone instants are rendered as Shanghai time with a native time element retaining the original datetime. Missing zones, invalid calendar dates and absent timestamps show unverified time; any original text is preserved verbatim as source value and React-escaped. Historical facts are not rewritten or timezone-inferred.

188 tests and production build passed. Browser scenarios add unzoned baseline and February-30 source timestamp assertions; acceptance pending. This is presentation of stored evidence only, not a new price/route observation or permission change. No provider query, transaction or GitHub write.

32 browser integration checks passed, including explicitly synthesized ambiguous/invalid source timestamps preserved as unverified rather than native valid time elements. Actual saved quote-history records continue loading correctly. Local service updated; no new provider calls during browser acceptance.

## Exact-plan history export acceptance

Added JSON download to the scoped history disclosure. Export explicitly identifies saved observations, separate export time, trip/hotel/plan scope, the 50-record limit, unconfirmed full-history coverage and disabled transactions. Source records remain unchanged, and export does not query merchants. Loading errors disable export.

Production build and 32 browser integration checks passed. Browser downloaded the two actual saved TimeWalk rechecks and compared every exported record to the original evidence, including IDs, source times, statuses and prices. Artifact: `cases/quote-history-browser-export-20261009.json`. First acceptance attempt timed out in the earlier simulation swap while a build overlapped; after build completion and service restart, the full suite passed. No new merchant observations, real transaction or GitHub write. Product goal remains incomplete pending real transaction access and broader real-world acceptance.

## Targeted quote response freshness

Exact-plan rechecks now validate the returned detail observation time after the merchant request completes. Stale observations (over 15 minutes), future times, missing zones and invalid calendar dates produce failed checks with no adopted room, no price delta and no claim that the original offer disappeared. They cannot become the next successful comparison baseline. Valid later responses recover against the last usable baseline. Hotel identity checks remain prior to adoption.

189 unit tests and production build passed. Added regression covers four invalid timestamp forms with both matching cheaper rooms and empty responses, followed by successful fresh recovery across eight rejected attempts. These are controlled dependency tests, not new merchant calls. Previous browser acceptance remains 32 passed; no new browser result claimed for this backend-only change. Local service restarted with the update. No real transaction or GitHub write; the full product goal remains active.

## Freshness before tradeoff recommendation

Tradeoff construction preserves stale/unverified room and route observations with explicit evidence-gap labels. Recommendation eligibility now independently validates both room and route timestamps against the assessment time using the existing 15-minute explicit-zone rule. Invalid evidence cannot enter the Jev comparison pool, ideal selection or single-option recommendation. This does not turn missing evidence into a hard preference violation or change budget permission; saved facts remain visible and unmodified. Recorded-case assessments continue using their recorded assessment time.

190 unit tests and production build passed. New tests exercise stale, future, unzoned and invalid calendar timestamps for rooms and routes, with both multiple and single observed options. All retain evidence, return needs_evidence and make zero model calls. No new merchant query or real transaction; no GitHub write. Service restarted with the updated backend. Prior browser result is not represented as a new run. Full product objective remains incomplete.

## Model-round expiry guards

Live workflow assessments now supply a real moving clock to tradeoff evaluation; recorded assessments retain their explicit recorded time. Evidence is checked immediately before selection and after each of the two model responses. If any comparison-pool room/route observation expires or a required cancellation window ends, preferred selection and next-action advice are cleared and the result requests refreshed evidence. Model identity/validated choice/usage already received remain auditable. Current-time option rule results are recomputed without altering source observations or granting preference changes. An expiry after the first model response prevents the second request.

191 unit tests and production build passed. Controlled-clock regressions cover room/route expiry and cancellation boundary crossing after either model phase, assert no preferred option, no executable next-action advice and no extra model call. Existing recorded-evidence tests continue passing. These are simulated service responses, not live Jev timing or merchant booking acceptance. Backend service restarted. No real order or GitHub write; full product goal remains incomplete.

## Unknown cancellation deadline correction

Corrected the previous model-round guard: a null parsed cancellation timestamp must not be coerced into an expired timestamp. Only valid explicit-zone deadlines can cross the cancellation boundary. Missing, unzoned and invalid calendar dates remain cancellation evidence gaps, not inferred expiry or free-cancellation confirmation. Provisional single-option inspection advice retains the gap and cannot establish bookability; the existing inspection handoff gate still requires a known valid cancellation window.

192 unit tests and production build passed, including three unknown-deadline variants and the existing model-round expiry cases. Local service restarted. No merchant query, real order or GitHub modification. Full product objective remains active.

## Browser regression after freshness and cancellation fixes

Completed a fresh full run of the existing browser acceptance suite against the updated running production service: 32 checks passed. It covers simulation browsing/booking/rebooking/refund and rule blocking, plus real saved-case rendering, English workflow, consent gating, scoped quote history/export, partial reviews and ambiguous evidence-time presentation. Exported real records again match their original saved facts. No new merchant calls or real orders occurred. These browser checks validate integration regressions, not a live Jev expiry response or full production transaction capability. Latest unit checkpoint remains 192 passed and production build passed. Log: `/tmp/staypilot-latest-workflow-browser.log`.

Re-inspected the transaction access request material. It still requires platform final-quote/inventory and order/cancel/refund sandbox access; no external application or message was sent. This dependency does not prevent continued local product work, and the goal remains active and incomplete. No GitHub writes.

## Advice display expiry

The live tradeoff panel now removes the preferred-inspection badge when the assessment or preferred room/route observation becomes stale/unverified, or a known required cancellation deadline ends. A clear notice asks for fresh comparison and labels the preserved model record historical advice. Its existing one-second clock updates this display without merchant calls. Recorded-mode presentation remains anchored to historical evidence. Invalid/ambiguous cancellation strings no longer falsely render a window-ended notice. This does not mutate stored model decisions or authorize purchase.

Production build and 33 browser integration checks passed. Added controlled live-result cases verify current recommendation display, stale room, stale route, expired cancellation and unknown cancellation date. The expiry variants hide the preferred badge and show the historical-advice notice; the unknown date is not called expired. These five states are synthesized rendering tests, not live Jev/merchant observations. Existing saved real-case, scoped history/export, authorization and simulation transaction checks passed in the same run. Unit checkpoint remains 192 passed; no new unit run claimed for this UI change. Local service updated, no GitHub modification or real order. Full product objective remains active.

## Cross-platform observation-time integrity

Cross-platform comparison now requires both otherwise-aligned room observations to be current against the comparison instant. A matching pair with stale, future, unzoned or invalid-calendar observations has evidence_stale status, null price difference and a specific refresh-both-platforms warning. Terms mismatches remain distinct. Live workflows use completion-time comparison; recorded workflows use their recorded evidence time. Even aligned fresh estimates remain display differences only, with final fees unverified.

193 unit tests and production build passed. Regression confirms a fresh matched pair produces the expected estimate difference; four invalid timestamp variants suppress the difference; a changed meal plan remains conditions_mismatch. Test candidates are controlled copies of saved evidence, not a newly observed live matched pair. Existing historical source records unchanged. Prior 33 browser checks are not represented as a new browser run. Local service updated; no merchant request, real transaction or GitHub write. Full product objective remains incomplete.

## Cross-platform comparison cards

Replaced the warning-only identity section with a bilingual comparison-evidence region. Each matched hotel group shows its platforms and explicit hotel_only, conditions_mismatch, evidence_stale or comparable_display label; missing historical statuses are stated as missing. Unmatched fields are expandable. Only comparable_display records with a finite nonnegative difference show it, always labeled a recorded estimate difference, not a current transaction price or confirmed savings. Historical data and merchant calls are unchanged.

Production build passed; browser acceptance in progress with controlled four-status records deliberately all carrying a difference, so invalid statuses must still suppress it. No real transaction or GitHub write.

Browser acceptance completed: 34 checks passed, including controlled four-status comparison records, gap disclosure and suppression of differences for non-comparable statuses. No new merchant calls or orders. The user subsequently authorized pushing a functional version to GitHub, superseding the earlier local-only publishing constraint. Release preparation is in progress; this entry does not claim a completed push.

Release preparation: independent staged-tree archive passed 193 tests and production build without .env or session databases, reusing installed dependencies. Credential-value and credential-pattern scans passed. Remote main matched local HEAD before the functional commit. Local 34-check browser result is not a clean-archive browser result. No real transaction claim.

## Portable saved-case browser acceptance

Added explicit test-only fixture hydration (`npm run test:e2e:fixtures`). Published historical runs are inserted into randomly identified, query-consent-required local test sessions, preserving original source timestamps, run IDs, parent links and exact recheck records. No provider calls are performed by hydration and no HTTP import endpoint is exposed. The original production-session browser path remains available.

Acceptance used a separate HEAD archive with only the new test files copied in, reused node_modules and built assets, port 4174, no .env and no private session databases. Hydration created 26 test sessions. All 34 browser checks passed, including parent history, two actual saved rechecks/export, consent gates and controlled comparison/advice display states. This is reproduction of historical source observations, not new live quotes or Jev inference. Production build passed before acceptance; fresh dependency installation was not tested. The temporary service was stopped; the primary service at 4173 remains running. Full product objective remains active, with real transaction access still required.

## Partial-operation recovery guidance

The assessment outcome now lists explicitly reported incomplete operations by search provider, room request, route check, review refresh/analysis and Jev advice. Buttons navigate to the corresponding existing inspection areas without submitting retries or changing authorization. Missing rooms/routes, empty results, identity ambiguity and source instructions do not fabricate service failures. Counts describe reported scopes, not provider health or market inventory. Original evidence is unchanged.

195 unit tests, production build and 35 browser integration checks passed. Unit regressions cover partial failures and non-failure evidence gaps; controlled browser partial-failure state verifies labels and room-refresh navigation with zero workflow POSTs. This is synthesized failure acceptance, not a live provider outage. Existing actual saved-case rendering and simulation transaction checks also passed. Local service updated. No real transaction; this functional update is prepared for the user-authorized GitHub push. Full product goal remains active.

## Pre-query service setup visibility

The search step now reads local server configuration for Fliggy, RollingGo, Amap and Jev. The integration endpoint adds only a Fliggy credential-presence boolean, never the credential. The bilingual card distinguishes configuration from login, connectivity, permissions and valid quotes, warns about missing hotel/map/model setup, and states disabled real transactions. Failed or malformed reads clear prior state; reads time out after ten seconds and cancel on unmount; manual retry only re-reads local configuration. No provider discovery, credential submission or authorization change occurs.

195 unit tests, production build and 36 browser checks passed. New browser case synthesizes missing credentials, then a 503 configuration response, verifies stale status is cleared, and recovers through the actual local configuration endpoint. No merchant query or real order. Local service updated and this functional version prepared for the authorized GitHub push. Full product goal remains active.

## Fresh transaction-capability audit

Actual RollingGo discovery at 2026-10-08T17:33:26.868Z through 2026-10-08T17:33:27.410Z returned MCP Hotel Server 1.0.0 and only getHotelDetail, getHotelSearchTags, searchHotels. No visible booking/cancel/refund tools under current credentials. This is a fresh capability observation, not a hotel price or inventory observation and not evidence about other partnership interfaces. Re-read official FlyAI public skill and open platform pages; no usable order/cancel/refund contract acquired. Access request updated with the exact remaining dependencies. No external application/message, real order or payment. Product goal remains active; meaningful implementation is still possible before platform transaction access arrives.

## Validated display money and selection binding

Added shared conversion of numeric, finite, nonnegative display estimates into safe integer cents. Negative, nonnumeric, nonfinite and overflowing amounts become unknown evidence rather than comparable prices. Candidate assessment, tradeoff options, same-plan deltas and cross-platform display differences now use the same validation. Inspection handoff additionally requires CNY room evidence and equality between its computed cents and the selected option amount. This still does not establish final charges, availability or purchase permission. Zero remains a numeric estimate, not proof of a free bookable stay.

198 unit tests, production build and 36 browser checks passed. Added invalid-money tests, rejected malformed merchant rechecks and room/option mismatch cases. Two older synthetic valid-selection fixtures were corrected to carry their intended matching prices/currency; the stricter production guard was retained. Browser verification includes existing saved actual evidence and simulation flows; no new merchant request or real transaction. Local service updated, preparing the authorized feature push. Full product objective remains active.

## Legacy invalid-baseline recovery

Same-plan baseline lookup now lazily scans newest-first candidate history until it finds a valid safe-cent amount, instead of trusting the newest legacy successful-status row with any non-null price. Negative, string and overflowing old amounts remain in history but cannot poison price comparison. Existing skipped-attempt metadata counts those intervening rows. No original observation is rewritten; current merchant amounts remain independently validated.

199 unit tests and production build passed. Regression seeds one valid baseline followed by three invalid legacy successful-status rows and verifies a fresh result compares 290 against 300, delta -1000 cents, retains all five records and reports three skipped attempts. This is controlled dependency evidence, not a new merchant query. No new browser run claimed; previous 36 checks remain the browser checkpoint. Local service restarted. No real transaction. Functional update prepared for the authorized GitHub push; full product goal remains active.

## Evidence-bound budget condition proposals

Condition combinations now supplement existing commute proposals with actual observed over-ceiling room estimates when budget is the only unauthorized adjustment and no hard requirement is violated. Room and route timestamps must be current at the assessment time; actual adult count is passed through. Proposals retain all evidence gaps, identify room/estimate/excess over original ceiling, require confirmation and explicitly leave the original budget unchanged. They do not establish a final payable budget. At most three hotel proposals are retained. Existing budget checks now use shared validated cents. English rendering preserves amounts and confirmation language.

201 unit tests and production build passed. Controlled saved-evidence-shaped tests verify a 650-yuan estimate gives a 50-yuan excess proposal under a 600-yuan ceiling, immutable policy, English guidance, and exclusion of nonrefundable rooms, stale prices, unknown prices and insufficient occupancy. No new real quote or Jev comparison was claimed. Previous 36 browser checks remain the checkpoint; no new browser run for this logic/translation change. Local service updated. Real transactions remain disabled; functional update prepared for authorized GitHub push. Full product objective remains active.

## Real integrated regression at 01:44 Shanghai

Ran a new production session with explicitly confirmed unchanged Yonghe Temple query/policy. Actual request 01:44:39-01:45:38 Shanghai returned 15 platform candidate records, 83 room plans, 11 route records and two distinct 15-review analyses with Jev 1.13.0. Inspection decisions also used Jev 1.13.0. All eight displayed tradeoff options failed hard requirements; no acceptable-option Jev comparison or successful booking is claimed. Zero condition proposals preserved cancellation and budget boundaries. Top-level errors were empty; five candidate-level errors/gaps remain. Two cross-platform hotel groups do not establish comparable final prices.

Evidence: cases/live-product-regression-20261009.json; report: real-product-regression-20261009.md. New source times retained, old facts unchanged; no order/payment/cancel/refund. Credential scan passed before publication. Unit/build checkpoint remains 201 passed/build passed; previous browser checkpoint 36, no new browser run claimed. Full product goal remains active.

## Current-evidence commute condition proposals

Commute proposals now independently require current room and route observations, then rerun the representative room against the same tradeoff hard-floor rules with actual adult count. Stale observations, expired/nonrefundable cancellation or insufficient occupancy cannot become longer-commute suggestions. Both screening and tradeoff gaps are retained in the proposal. Valid proposals remain confirmation-only; authorization is unchanged. Recorded-case tests now explicitly pass their recorded assessment time instead of silently using wall time.

202 unit tests and production build passed. Controlled regression verifies a supported commute alternative and five exclusion variants. No new merchant query or real order. Prior browser checkpoint remains 36; no new browser run claimed for this backend change. Local service restarted, preparing authorized GitHub update. Full product objective remains active.

## Condition-proposal preference navigation

Each condition-combination card now opens preferences directly with a bilingual explanation that navigation does not alter budget or authorization. Users can inspect and manually edit acceptable limits, then explicitly confirm and query again; an observed condition proposal is not a bookable offer. No proposal text is parsed into automatic policy changes.

Production build and 37 browser checks passed. Controlled proposal navigation verifies the original budget input remains unchanged and zero workflow POSTs are sent. Existing saved-case, history export, setup and failure-recovery checks passed in the same run. Unit checkpoint remains 202 passed; no new unit run claimed for this navigation-only change. Service updated; no new merchant query or real order. Functional update prepared for authorized GitHub push; full product goal remains active.

## Selected merchant verification brief

Added a plain-text handoff download for a currently valid inspection selection. It contains exact hotel/platform/address, dates/guest conditions, room/rate-plan ID, bed/meal, original room observation time, estimate versus authorized ceiling, observed cancellation deadline, personal priorities, unacceptable review issues, required facilities/window, commute limits and all option gaps. HTTPS merchant links omit embedded credentials. It explicitly states not an order, not purchase permission, not proof of availability or final charges, and requires fresh verification before acting. Export time remains distinct from observation time.

204 unit tests and production build passed. Regression checks exact bound selection/evidence, immutable source data, bilingual labeling and rejection after stale evidence, withdrawal, invalid selection, changed conditions, busy state or version mismatch. No new browser-download acceptance claimed; previous browser checkpoint remains 37. No merchant call or real order. Local compiled frontend updated; service remains running. Functional version prepared for authorized GitHub push; full product goal remains active.
