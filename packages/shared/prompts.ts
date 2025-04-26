// TODO: Use a proper tokenizer
function calculateNumTokens(text: string) {
  return text.split(" ").length;
}

function truncateContent(content: string, length: number) {
  let words = content.split(" ");
  if (words.length > length) {
    words = words.slice(0, length);
    content = words.join(" ");
  }
  return content;
}

export function buildImagePrompt(lang: string, customPrompts: string[]) {
  return `
You are a bot in a read-it-later app and your responsibility is to help with automatic tagging.
Please analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags language must be in ${lang}.
- If the tag is not generic enough, don't include it.
- Aim for 10-15 tags.
- If there are no good tags, don't emit any.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

export function buildTextPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
) {
  const constructPrompt = (c: string) => `
You are a bot in a read-it-later app and your responsibility is to help with automatic tagging.
Please analyze the text between the sentences "CONTENT START HERE" and "CONTENT END HERE" and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags language must be in ${lang}.
- If it's a famous website you may also include a tag for the website. If the tag is not generic enough, don't include it.
- The content can include text for cookie consent and privacy policy, ignore those while tagging.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
CONTENT START HERE
${c}
CONTENT END HERE
You must respond in JSON with the key "tags" and the value is an array of string tags.`;

  const promptSize = calculateNumTokens(constructPrompt(""));
  const truncatedContent = truncateContent(content, contextLength - promptSize);
  return constructPrompt(truncatedContent);
}

export function buildSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
) {
  const constructPrompt = (c: string) => `
    Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must be in 3-4 sentences.
- The summary language must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${c}`;

  const promptSize = calculateNumTokens(constructPrompt(""));
  const truncatedContent = truncateContent(content, contextLength - promptSize);
  return constructPrompt(truncatedContent);
}

export function buildTagCleanupPrompt(
  tags: string[],
  userInstruction: string,
  contextLength: number,
) {
  const constructPrompt = (t: string[]) => `
Given a list of tags, I want you to emit suggestions for tags cleanups
such that there isn't a lot of semantically similar tags. Emit one line
per suggestion. Every line is a list of tags that should be merged together
separated by a comma. First tag being the one that should be kept. Tags
that doesn't need to be merged should be ignored.

Example input: Software Engineer, dog, Cat, CAT, Dog, SWE
Example output:
cat,Cat,CAT
dog,Dog
SWE,Software Engineer

User instructions: ${userInstruction}

Tags: ${t.join(", ")}`;

  const promptSize = calculateNumTokens(constructPrompt([]));

  // Assume 1.5 token per tag:
  // We should retain (contextLength - promptSize) / 1.5 tag.
  const maxTags = Math.floor((contextLength - promptSize) / 1.5);
  const inputTags = tags.slice(0, maxTags);

  return constructPrompt(inputTags);
}
