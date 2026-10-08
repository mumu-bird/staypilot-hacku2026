# Real workflow regression — October 9, 2026

Executed: 9 Oct 2026, 01:44:39 Shanghai (UTC+8) to 9 Oct 2026, 01:45:38 Shanghai (UTC+8). Run ID: de1e12f0-1150-4a08-a638-baa0a67fdbc1.

Unchanged authorized example: Beijing Yonghe Temple, October 9–10, two adults, one room, no children. Ceiling CNY 600, ideal CNY 500; free cancellation required; walk up to 20 minutes or direct metro up to 40 minutes. No purchase authority was granted.

## Actual results

- 15 platform candidate records; this is not a count of unique hotels.
- 83 returned normalized room plans and 11 route records. These are bounded observations, not complete market coverage.
- 2 distinct review model analyses: jev-1.13.0 (15 visible reviews), jev-1.13.0 (15 visible reviews). Partial samples, not complete review coverage.
- Inspection-decision model: jev-1.13.0. Tradeoff-comparison model: not called; status needs_evidence.
- 8/8 displayed tradeoff options blocked by hard requirements. 0 condition proposals. Free-cancellation conflicts were not converted into an automatic budget increase. No successful comparison of two authorized acceptable compromises is claimed.
- 0 top-level errors; 5 candidate-level errors or gaps. Empty top-level errors do not prove complete evidence or availability.
- Real transaction enabled: false. No real order, payment, cancellation or refund occurred.

## Product acceptance limits

The current code exercised real provider search, selected room queries, identity-bound routes, bounded public review refresh and Jev inspection decisions. Hard policy checks preserved the CNY 600 ceiling. Unknown final charges, inventory and cancellation conditions remain unresolved. The latest budget-proposal feature correctly returned no proposal when displayed options failed the free-cancellation floor. Existing historical prices were not treated as current and no market-wide minimum or savings was asserted.

Unit checkpoint: 201 passed; production build passed. Browser checkpoint: 36 passed before this real request; no new browser acceptance is implied. Runtime data is preserved in cases/live-product-regression-20261009.json, with original source observation times. Later readers must refresh evidence before acting.

Real order/payment/cancel/refund integration remains a required, uncompleted part of the product goal.
