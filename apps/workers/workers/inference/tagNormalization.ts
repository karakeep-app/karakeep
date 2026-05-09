const CHINESE_TAG_SYNONYM_GROUPS: { canonical: string; aliases: string[] }[] = [
  { canonical: "人工智能", aliases: ["AI", "人工智能", "机器学习", "ML"] },
  { canonical: "大语言模型", aliases: ["LLM", "LLMs", "大模型", "语言模型"] },
  {
    canonical: "AIGC",
    aliases: ["AIGC", "生成式AI", "生成式人工智能", "生成式智能"],
  },
  { canonical: "深度学习", aliases: ["深度学习", "Deep Learning", "DL"] },
  { canonical: "自然语言处理", aliases: ["NLP", "自然语言处理"] },
  { canonical: "计算机视觉", aliases: ["CV", "计算机视觉", "Computer Vision"] },
  { canonical: "多模态", aliases: ["多模态", "Multimodal", "多模态AI"] },
  { canonical: "智能体", aliases: ["Agent", "Agents", "AI Agent", "智能体"] },
  {
    canonical: "提示词工程",
    aliases: ["Prompt", "Prompt Engineering", "提示词"],
  },
  { canonical: "开源", aliases: ["开源", "Open Source", "OpenSource"] },
  { canonical: "创业", aliases: ["创业", "Startup", "Startups"] },
  { canonical: "商业", aliases: ["商业", "Business", "商业模式"] },
  { canonical: "投资", aliases: ["投资", "投融资", "融资", "VC"] },
  { canonical: "科技", aliases: ["科技", "技术", "Tech", "Technology"] },
  { canonical: "互联网", aliases: ["互联网", "Internet", "Web"] },
  { canonical: "产品", aliases: ["产品", "产品设计", "Product"] },
  { canonical: "设计", aliases: ["设计", "Design", "UI", "UX", "用户体验"] },
  { canonical: "开发", aliases: ["开发", "编程", "Coding", "Programming"] },
  { canonical: "前端", aliases: ["前端", "Frontend", "Front End"] },
  { canonical: "后端", aliases: ["后端", "Backend", "Back End"] },
  { canonical: "数据库", aliases: ["数据库", "DB", "Database"] },
  { canonical: "云计算", aliases: ["云计算", "Cloud", "Cloud Computing"] },
  {
    canonical: "安全",
    aliases: ["安全", "网络安全", "Cybersecurity", "Security"],
  },
  {
    canonical: "数据分析",
    aliases: ["数据分析", "Data Analysis", "Analytics"],
  },
  { canonical: "数据科学", aliases: ["数据科学", "Data Science"] },
  { canonical: "区块链", aliases: ["区块链", "Blockchain", "Web3", "Crypto"] },
  { canonical: "新能源汽车", aliases: ["新能源汽车", "新能源车", "EV"] },
  {
    canonical: "自动驾驶",
    aliases: ["自动驾驶", "Autonomous Driving", "Autopilot"],
  },
  { canonical: "机器人", aliases: ["机器人", "Robotics", "Robot"] },
  { canonical: "芯片", aliases: ["芯片", "半导体", "Semiconductor", "Chip"] },
  { canonical: "金融", aliases: ["金融", "Finance", "Fintech", "金融科技"] },
  { canonical: "教育", aliases: ["教育", "Education", "EdTech"] },
  { canonical: "医疗", aliases: ["医疗", "医学", "Healthcare", "Health Tech"] },
  { canonical: "政策", aliases: ["政策", "监管", "Regulation", "Policy"] },
  { canonical: "趋势", aliases: ["趋势", "行业趋势", "Trend", "Trends"] },
  { canonical: "观点", aliases: ["观点", "评论", "Opinion", "Commentary"] },
  { canonical: "新闻", aliases: ["新闻", "资讯", "News"] },
  { canonical: "教程", aliases: ["教程", "指南", "Guide", "Tutorial"] },
];

const CHINESE_TAG_SYNONYMS = new Map(
  CHINESE_TAG_SYNONYM_GROUPS.flatMap(({ canonical, aliases }) =>
    aliases.map((alias) => [tagSynonymKey(alias), canonical] as const),
  ),
);

function tagSynonymKey(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[，,。.!！?？:：;；/\\|()[\]{}'"`~*+_ -]/g, "");
}

export function normalizeChineseTagSynonyms(tags: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const key = tagSynonymKey(rawTag);
    if (!key) {
      continue;
    }
    const tag = CHINESE_TAG_SYNONYMS.get(key) ?? rawTag.trim();
    const dedupeKey = tagSynonymKey(tag);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push(tag);
  }

  return normalized;
}
