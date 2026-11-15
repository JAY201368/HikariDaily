/** Wording only. Levels and unknown are decided by the photography rules. */
export const SUNSET_WORDS = {
  5: { label: "很高", prospect: "晚霞机会很大", retrospective: "当时的云况很有利", action: "日落前 20 分钟到位，看西边" },
  4: { label: "较高", prospect: "有机会出晚霞", retrospective: "当时的云况不错", action: "日落前后留意西边的天空" },
  3: { label: "一般", prospect: "晚霞有一点机会", retrospective: "当时的条件一般", action: "顺路的话看一眼西边" },
  2: { label: "偏低", prospect: "晚霞机会不大", retrospective: "当时的条件不太好", action: "不必专门等" },
  1: { label: "很低", prospect: "晚霞基本没戏", retrospective: "当时的条件很差", action: "不必专门等" },
  unknown: { label: "暂时判断不了", prospect: "晚霞暂时判断不了", retrospective: "当时的晚霞条件暂时判断不了", action: "不建议专门为它等" },
} as const;

export const SUNSET_NEAR_ACTION = "现在留意西边的天空";
