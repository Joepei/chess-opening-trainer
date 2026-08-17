import type { Locale } from "./messages";

const exactNamesZh: Record<string, string> = {
  "Alekhine Defense": "阿廖欣防御",
  "Bird Opening": "伯德开局",
  "Caro-Kann Defense": "卡罗-卡恩防御",
  "Dragon Variation": "龙式变着",
  "Dutch Defense": "荷兰防御",
  "English Opening": "英格兰开局",
  "Four Knights Game": "四马开局",
  "French Defense": "法兰西防御",
  "Giuoco Piano": "瑞高钢琴",
  "Grunfeld Defense": "格林菲尔德防御",
  "Italian Game": "意大利开局",
  "King's Gambit": "王翼弃兵",
  "King's Indian Defense": "王翼印度防御",
  "London System": "伦敦系统",
  "Najdorf Variation": "纳依道夫变着",
  "Nimzo-Indian Defense": "尼姆佐-印度防御",
  "Open Game": "开放性开局",
  "Petrov's Defense": "俄罗斯防御",
  "Philidor Defense": "菲利多尔防御",
  "Pirc Defense": "彼尔茨防御",
  "Queen's Gambit": "后翼弃兵",
  "Queen's Gambit Accepted": "接受后翼弃兵",
  "Ruy Lopez": "西班牙开局",
  "Scandinavian Defense": "斯堪的纳维亚防御",
  "Scotch Game": "苏格兰开局",
  "Sicilian Defense": "西西里防御",
  "Smith-Morra Gambit": "史密斯-莫拉弃兵",
  "Two Knights Defense": "双马防御",
  "Vienna Game": "维也纳开局",
};

export function translateOpeningName(name: string | null, locale: Locale): string | null {
  if (!name || locale === "en") {
    return name;
  }

  if (exactNamesZh[name]) {
    return exactNamesZh[name];
  }

  const segments = name.split(/: |, /);
  const translatedSegments = segments.map((segment) => exactNamesZh[segment] ?? segment);
  if (translatedSegments.some((segment, index) => segment !== segments[index])) {
    let translated = name;
    for (let i = 0; i < segments.length; i += 1) {
      translated = translated.replace(segments[i], translatedSegments[i]);
    }
    return translated;
  }

  return name;
}
