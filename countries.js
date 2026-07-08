// countries.js — Asian countries config with economic context

export const COUNTRIES = {
  LK: {
    code: "LK",
    name: "Sri Lanka",
    emoji: "🇱🇰",
    region: "South Asia",
    economy: "emerging market, tea/garment exports, tourism, IMF program",
    currency: "LKR (Sri Lankan Rupee)",
    keyFactors: "remittances, fuel imports, debt restructuring, tourism revenue"
  },
  IN: {
    code: "IN",
    name: "India",
    emoji: "🇮🇳",
    region: "South Asia",
    economy: "largest emerging market, IT services, manufacturing hub, G20 member",
    currency: "INR (Indian Rupee)",
    keyFactors: "software exports, FDI flows, oil imports, trade balance, stock markets"
  },
  CN: {
    code: "CN",
    name: "China",
    emoji: "🇨🇳",
    region: "East Asia",
    economy: "world's second largest, manufacturing powerhouse, Belt & Road Initiative",
    currency: "CNY (Chinese Yuan/Renminbi)",
    keyFactors: "exports, property sector, US-China trade, tech sector, BRI lending"
  },
  JP: {
    code: "JP",
    name: "Japan",
    emoji: "🇯🇵",
    region: "East Asia",
    economy: "advanced economy, automotive/electronics, aging population challenge",
    currency: "JPY (Japanese Yen)",
    keyFactors: "yen carry trade, exports, BOJ policy, energy imports, tech sector"
  },
  KR: {
    code: "KR",
    name: "South Korea",
    emoji: "🇰🇷",
    region: "East Asia",
    economy: "advanced economy, semiconductor giant, K-pop/culture exports",
    currency: "KRW (South Korean Won)",
    keyFactors: "chip exports, Samsung/TSMC competition, North Korea risks, shipbuilding"
  },
  SG: {
    code: "SG",
    name: "Singapore",
    emoji: "🇸🇬",
    region: "Southeast Asia",
    economy: "global financial hub, port city-state, tech and fintech centre",
    currency: "SGD (Singapore Dollar)",
    keyFactors: "trade volumes, financial flows, MAS policy, regional HQ decisions"
  },
  MY: {
    code: "MY",
    name: "Malaysia",
    emoji: "🇲🇾",
    region: "Southeast Asia",
    economy: "upper-middle income, palm oil, semiconductor assembly, commodities",
    currency: "MYR (Malaysian Ringgit)",
    keyFactors: "commodity prices, semiconductor supply chain, tourism, FDI"
  },
  TH: {
    code: "TH",
    name: "Thailand",
    emoji: "🇹🇭",
    region: "Southeast Asia",
    economy: "tourism-heavy, auto manufacturing, rice and rubber exports",
    currency: "THB (Thai Baht)",
    keyFactors: "tourism recovery, auto exports, political stability, food exports"
  },
  ID: {
    code: "ID",
    name: "Indonesia",
    emoji: "🇮🇩",
    region: "Southeast Asia",
    economy: "G20 member, commodity powerhouse, nickel and coal, large domestic market",
    currency: "IDR (Indonesian Rupiah)",
    keyFactors: "nickel/EV supply chain, palm oil, coal prices, rupiah stability"
  },
  PH: {
    code: "PH",
    name: "Philippines",
    emoji: "🇵🇭",
    region: "Southeast Asia",
    economy: "BPO services hub, remittance-dependent, growing middle class",
    currency: "PHP (Philippine Peso)",
    keyFactors: "OFW remittances, BPO sector, infrastructure spending, typhoon risks"
  },
  PK: {
    code: "PK",
    name: "Pakistan",
    emoji: "🇵🇰",
    region: "South Asia",
    economy: "developing, IMF program, textile exports, energy crisis",
    currency: "PKR (Pakistani Rupee)",
    keyFactors: "IMF bailout, forex reserves, textile exports, CPEC, energy imports"
  },
  BD: {
    code: "BD",
    name: "Bangladesh",
    emoji: "🇧🇩",
    region: "South Asia",
    economy: "garment export giant, fast-growing, remittances",
    currency: "BDT (Bangladeshi Taka)",
    keyFactors: "RMG exports, US/EU buyer demand, climate vulnerability, remittances"
  },
  VN: {
    code: "VN",
    name: "Vietnam",
    emoji: "🇻🇳",
    region: "Southeast Asia",
    economy: "fast-growing, manufacturing shift from China, electronics and footwear",
    currency: "VND (Vietnamese Dong)",
    keyFactors: "China+1 strategy, electronics exports, FDI from Samsung/Intel, dong stability"
  },
  KZ: {
    code: "KZ",
    name: "Kazakhstan",
    emoji: "🇰🇿",
    region: "Central Asia",
    economy: "oil-dependent, commodity exporter, post-Soviet transition",
    currency: "KZT (Kazakhstani Tenge)",
    keyFactors: "oil prices, Russia sanctions spillover, grain exports, tenge peg"
  },
  AE: {
    code: "AE",
    name: "UAE",
    emoji: "🇦🇪",
    region: "West Asia",
    economy: "oil wealth, Dubai as global hub, diversification push, fintech",
    currency: "AED (UAE Dirham, USD-pegged)",
    keyFactors: "oil revenues, real estate, trade hub status, tourism, sovereign wealth"
  }
};

export const REGIONS = {
  "South Asia": ["LK", "IN", "PK", "BD"],
  "East Asia": ["CN", "JP", "KR"],
  "Southeast Asia": ["SG", "MY", "TH", "ID", "PH", "VN"],
  "Central Asia": ["KZ"],
  "West Asia": ["AE"]
};
