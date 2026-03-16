const BASE_URL = "https://karakeep.app";
const DEFAULT_DESCRIPTION =
  "Karakeep is the open-source bookmark manager for links, notes, and images. Automatically organize and tag your bookmarks with AI.";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
}

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
}: SEOProps) {
  const fullTitle = title
    ? `${title} | Karakeep`
    : "Karakeep - The Bookmark Everything App | Save, Organize & Tag with AI";
  const url = `${BASE_URL}${path}`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />

      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </>
  );
}
