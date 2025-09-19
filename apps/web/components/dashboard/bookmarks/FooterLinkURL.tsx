import Link from "next/link";

export default function FooterLinkURL({ url }: { url: string | null }) {
  if (!url) {
    return null;
  }
  const parsedUrl = new URL(url);
  return (
    <Link
      className="line-clamp-1 hover:text-foreground"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {parsedUrl.host}
    </Link>
  );
}
