import type { RiskNote } from "../../domain/types";

/** Copy only: sleet is an internal wording key, never a new RiskNote code. */
export const HAZARD_WORDS = {
  thunderstorm: {
    label: "可能有雷雨", action: "别安排户外拍摄，别在空旷处和高处停留",
    detail: "打雷时别在空旷处、水边和高处停留，器材也别架在高处，别安排户外拍摄",
    printedLabel: "有雷雨", printedAction: "户外停拍",
  },
  "heavy-rain": {
    label: "雨势较大", action: "别安排户外拍摄",
    detail: "雨大的时候待在室内，等雨小了再出门",
    printedLabel: "雨势大", printedAction: "户外停拍",
  },
  "strong-wind": {
    label: "风很大", action: "别架三脚架，注意高处坠物",
    detail: "风大时别安排户外拍摄，别架三脚架，远离广告牌和大树，注意高处坠物",
    printedLabel: "风很大", printedAction: "户外停拍",
  },
  "air-quality": {
    label: "空气较差", action: "户外别久留",
    detail: "空气不健康，户外别久留，可以戴口罩",
    printedLabel: "空气差", printedAction: "户外别久留",
  },
  sleet: {
    label: "冻雨", action: "别外出拍摄",
    detail: "冻雨会让路面和台阶结冰，出门很危险，别外出拍摄",
    printedLabel: "有冻雨", printedAction: "户外停拍",
  },
} as const satisfies Record<RiskNote["code"] | "sleet", {
  label: string; action: string; detail: string; printedLabel: string; printedAction: string;
}>;
