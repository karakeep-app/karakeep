import type { ZTagStyle } from "@karakeep/shared/types/users";

export interface EvalFixture {
  id: string;
  description: string;
  content: string;
  lang: string;
  tagStyle: ZTagStyle;
  customPrompts: string[];
  curatedTags?: string[];
  /** Broad topics the tags should relate to */
  expectedTopics: string[];
  /** Whether we expect the tags array to be empty */
  expectEmpty: boolean;
  minTags?: number;
  maxTags?: number;
}

export const dataset: EvalFixture[] = [
  // ── Basic text tagging ────────────────────────────────────────────────
  {
    id: "basic-ml-article",
    description: "Machine learning article should produce AI/ML tags",
    content: `
      Title: Understanding Transformer Architecture in Modern NLP
      Description: A deep dive into the transformer architecture that powers GPT, BERT, and other large language models.
      Content: The transformer architecture, introduced in the landmark paper "Attention Is All You Need" by Vaswani et al.,
      has revolutionized natural language processing. Unlike recurrent neural networks, transformers process all tokens
      in parallel using self-attention mechanisms. This enables them to capture long-range dependencies more effectively.
      Key components include multi-head attention, positional encoding, and feed-forward layers. Modern applications
      include machine translation, text generation, question answering, and code completion. Fine-tuning pretrained
      transformers on domain-specific data has become the standard approach for most NLP tasks.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "machine learning",
      "NLP",
      "transformers",
      "artificial intelligence",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "basic-cooking-recipe",
    description: "Cooking recipe should produce food/cooking tags",
    content: `
      Title: Classic Homemade Sourdough Bread Recipe
      Description: Step-by-step guide to making artisan sourdough bread from scratch.
      Content: Making sourdough bread starts with a healthy starter culture. Mix 500g bread flour with 350g water
      and 100g active starter. Add 10g salt and fold the dough every 30 minutes for 2 hours. Allow bulk fermentation
      for 4-6 hours at room temperature. Shape the dough and place in a banneton for cold retard overnight in the
      refrigerator. Bake in a preheated Dutch oven at 450°F for 20 minutes covered, then 25 minutes uncovered until
      the crust is deep golden brown. The long fermentation develops complex flavors and a chewy, open crumb structure.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: ["cooking", "baking", "bread", "recipe", "sourdough"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "basic-finance-news",
    description: "Finance article should produce market/economics tags",
    content: `
      Title: Federal Reserve Signals Rate Cuts Amid Slowing Inflation
      Description: The Fed hints at potential interest rate reductions in the coming quarters.
      Content: Federal Reserve Chair Jerome Powell indicated that the central bank may begin lowering interest rates
      as inflation continues to cool toward the 2% target. The Consumer Price Index showed year-over-year inflation
      at 2.4%, down from the 9.1% peak in 2022. Bond markets rallied on the news, with the 10-year Treasury yield
      falling to 3.8%. Stock markets also responded positively, with the S&P 500 gaining 1.2%. Economists note that
      while the labor market remains strong with unemployment at 3.7%, wage growth has moderated, reducing concerns
      about a wage-price spiral.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "finance",
      "economics",
      "interest rates",
      "Federal Reserve",
      "inflation",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "basic-climate-science",
    description: "Climate science abstract should produce relevant tags",
    content: `
      Title: Impact of Arctic Ice Loss on Global Weather Patterns
      Description: Research paper on how diminishing Arctic sea ice affects mid-latitude weather.
      Content: This study examines the relationship between accelerating Arctic sea ice loss and changes in
      mid-latitude weather patterns. Using climate models and 40 years of observational data, we demonstrate
      that reduced Arctic sea ice coverage weakens the polar vortex, leading to more frequent cold air outbreaks
      in North America and Europe. The jet stream becomes more meandering, creating persistent weather patterns
      that increase the likelihood of prolonged heat waves and cold spells. These findings have important
      implications for seasonal forecasting and climate adaptation strategies.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "climate change",
      "Arctic",
      "weather",
      "science",
      "environment",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "basic-programming-tutorial",
    description: "Programming tutorial should produce tech/dev tags",
    content: `
      Title: Building REST APIs with Go and Gin Framework
      Description: A practical guide to creating production-ready APIs using Go.
      Content: Go's simplicity and performance make it an excellent choice for building REST APIs. The Gin framework
      provides a fast HTTP router with middleware support. Start by defining your routes and handlers. Use GORM
      for database operations with PostgreSQL. Implement JWT authentication middleware for secure endpoints.
      Add request validation using binding tags on structs. For production, configure graceful shutdown, structured
      logging with zerolog, and Prometheus metrics. Docker containerization and Kubernetes deployment complete the
      production setup. Error handling in Go uses explicit error returns rather than exceptions.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: ["programming", "Go", "API", "web development", "backend"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },

  // ── Tag style compliance ──────────────────────────────────────────────
  {
    id: "style-lowercase-hyphens",
    description: "Tags should use lowercase-hyphens style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-hyphens",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-lowercase-spaces",
    description: "Tags should use lowercase-spaces style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-spaces",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-lowercase-underscores",
    description: "Tags should use lowercase-underscores style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "lowercase-underscores",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-titlecase-spaces",
    description: "Tags should use titlecase-spaces style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "titlecase-spaces",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-titlecase-hyphens",
    description: "Tags should use titlecase-hyphens style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "titlecase-hyphens",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "style-camelcase",
    description: "Tags should use camelCase style",
    content: `
      Title: Introduction to Machine Learning with Python
      Content: Machine learning is a subset of artificial intelligence that enables systems to learn from data.
      Popular libraries include scikit-learn, TensorFlow, and PyTorch. Supervised learning tasks include
      classification and regression. Deep learning uses neural networks with multiple layers.
    `,
    lang: "english",
    tagStyle: "camelCase",
    customPrompts: [],
    expectedTopics: ["machine learning", "Python", "AI"],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },

  // ── Curated tags constraint ───────────────────────────────────────────
  {
    id: "curated-matching",
    description: "Tags should only come from the curated list",
    content: `
      Title: How React Server Components Change Web Development
      Content: React Server Components allow rendering components on the server, reducing client-side JavaScript
      bundle sizes. Combined with Next.js App Router, they enable streaming HTML and progressive enhancement.
      Data fetching happens directly in components without useEffect or client-side state management.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    curatedTags: [
      "react",
      "javascript",
      "web-development",
      "frontend",
      "backend",
      "devops",
      "databases",
      "mobile",
      "security",
      "cloud",
    ],
    expectedTopics: ["react", "javascript", "web-development", "frontend"],
    expectEmpty: false,
    minTags: 1,
    maxTags: 5,
  },
  {
    id: "curated-no-match",
    description: "Should produce empty tags when no curated tags fit",
    content: `
      Title: How React Server Components Change Web Development
      Content: React Server Components allow rendering components on the server, reducing client-side JavaScript
      bundle sizes. Combined with Next.js App Router, they enable streaming HTML and progressive enhancement.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    curatedTags: [
      "gardening",
      "pottery",
      "knitting",
      "woodworking",
      "ceramics",
    ],
    expectedTopics: [],
    expectEmpty: true,
  },

  // ── Language compliance ───────────────────────────────────────────────
  {
    id: "lang-french",
    description: "Tags should be in French",
    content: `
      Title: The Future of Electric Vehicles
      Content: Electric vehicles are rapidly transforming the automotive industry. Battery technology improvements
      have extended range beyond 300 miles. Charging infrastructure is expanding globally. Major automakers
      plan to phase out internal combustion engines by 2035.
    `,
    lang: "french",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "electric vehicles",
      "automotive",
      "technology",
      "environment",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },
  {
    id: "lang-spanish",
    description: "Tags should be in Spanish",
    content: `
      Title: The Future of Electric Vehicles
      Content: Electric vehicles are rapidly transforming the automotive industry. Battery technology improvements
      have extended range beyond 300 miles. Charging infrastructure is expanding globally. Major automakers
      plan to phase out internal combustion engines by 2035.
    `,
    lang: "spanish",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [
      "electric vehicles",
      "automotive",
      "technology",
      "environment",
    ],
    expectEmpty: false,
    minTags: 3,
    maxTags: 5,
  },

  // ── Edge cases ────────────────────────────────────────────────────────
  {
    id: "edge-error-page",
    description: "404 error page content should produce empty tags",
    content: `
      404 Not Found
      The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      Please check the URL or go back to the homepage.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [],
    expectEmpty: true,
  },
  {
    id: "edge-short-content",
    description: "Very short content should still produce some tags",
    content: `
      Title: Rust Programming Language
      Content: Rust is a systems programming language focused on safety and performance.
    `,
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: ["Rust", "programming", "systems programming"],
    expectEmpty: false,
    minTags: 1,
    maxTags: 5,
  },
  {
    id: "edge-empty-content",
    description: "Empty content should produce empty or minimal tags",
    content: "",
    lang: "english",
    tagStyle: "as-generated",
    customPrompts: [],
    expectedTopics: [],
    expectEmpty: true,
  },
];
