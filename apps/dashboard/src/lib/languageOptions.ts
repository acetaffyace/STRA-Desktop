export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部语言" },
  { value: "english", label: "英语" },
  { value: "german", label: "德语" },
  { value: "french", label: "法语" },
  { value: "spanish", label: "西班牙语" },
  { value: "italian", label: "意大利语" },
  { value: "portuguese", label: "葡萄牙语" },
  { value: "brazilian", label: "巴西葡萄牙语" },
  { value: "russian", label: "俄语" },
  { value: "polish", label: "波兰语" },
  { value: "turkish", label: "土耳其语" },
  { value: "japanese", label: "日语" },
  { value: "koreana", label: "韩语" },
  { value: "schinese", label: "简体中文" },
  { value: "tchinese", label: "繁体中文" },
];

export function languageLabelFor(value: string): string {
  const normalized = (value || "").toLowerCase();
  const match = LANGUAGE_OPTIONS.find((option) => option.value === normalized);
  return match ? match.label : value;
}
