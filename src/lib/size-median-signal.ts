/**
 * Signal `GA.size_median` partagé par `T2.git-activity.ts` et `T3.git-activity.ts`.
 * Petite enveloppe autour de `medianFromBuckets` qui réduit son résultat à
 * `SignalValue` (`lib/threshold-eval.ts`) : la classe en minuscules si connue,
 * `undefined` sinon (histogramme absent ou `medianFromBuckets` rend
 * `{status:"unknown"}`).
 */

import { isMedianUnknown, medianFromBuckets } from "./median-from-buckets.js";
import type { SignalValue } from "./threshold-eval.js";
import type { GitActivityData } from "../sources/git-activity.js";

export function sizeMedianSignal(gitActivity: GitActivityData | undefined): SignalValue {
  const sizeDistribution = gitActivity?.pull_requests?.size_distribution;
  if (sizeDistribution === undefined) {
    return undefined;
  }
  const result = medianFromBuckets(sizeDistribution, gitActivity?.pull_requests?.total);
  return isMedianUnknown(result) ? undefined : result;
}
