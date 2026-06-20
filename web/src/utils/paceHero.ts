import type { PaceResult } from "./pace";
import { formatAboutIls, roundMoney } from "./format";

export type PaceHeroTone = "ok" | "bad" | "good";

export function paceHeroFromResult(pace: PaceResult | null): {
  line: string;
  sub: string;
  tone: PaceHeroTone;
} {
  if (!pace) {
    return { line: "No spending data for this cycle yet.", sub: "", tone: "ok" };
  }

  const displaySpend = pace.currentSpend;
  const paceCompareAvg = pace.historicalAvgVariableAtDay;
  const projectedTotal = pace.projectedTotal;
  const projectedAtUsualPace = pace.projectedAtUsualPace;
  const projectedVsUsualDelta = roundMoney(projectedTotal - projectedAtUsualPace);
  const nowGap = pace.vsAvgDelta;

  if (displaySpend <= 0 || paceCompareAvg <= 0) {
    return { line: "Enter spending or upload a partial statement to see pace.", sub: "", tone: "ok" };
  }

  let line: string;
  if (Math.abs(projectedVsUsualDelta) < 50) {
    line = "You're doing fine — this month looks normal.";
  } else if (projectedVsUsualDelta > 0) {
    line = `You're spending too fast — about ${formatAboutIls(projectedVsUsualDelta)} more than a normal month.`;
  } else {
    line = `You're spending slower than usual — about ${formatAboutIls(Math.abs(projectedVsUsualDelta))} less than a normal month.`;
  }

  let sub = "";
  if (Math.abs(projectedVsUsualDelta) < 50) {
    if (nowGap > 50) sub = "Day-to-day spending is a bit high, but the full month still looks OK.";
    else if (nowGap < -50) sub = "You've spent less than usual so far — nice.";
  } else if (projectedVsUsualDelta > 0 && nowGap > 50) {
    sub = `You've already spent about ${formatAboutIls(nowGap)} more than you usually have by now.`;
  } else if (projectedVsUsualDelta > 0 && nowGap < -50) {
    sub = "Spending is low so far, but the month-end total still looks high (bills add up).";
  } else if (projectedVsUsualDelta < 0 && nowGap < -50) {
    sub = `You've spent about ${formatAboutIls(Math.abs(nowGap))} less than usual so far.`;
  }

  let tone: PaceHeroTone = "ok";
  if (Math.abs(projectedVsUsualDelta) >= 50) {
    tone = projectedVsUsualDelta > 0 ? "bad" : "good";
  }

  return { line, sub, tone };
}
