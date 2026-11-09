"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

export default function MobileSidebarItem({
  name,
  logo,
  path,
}: {
  name: string;
  logo: React.ReactNode;
  path: string;
}) {
  const currentPath = usePathname();
  const isActive = path == currentPath;
  return (
    <li
      className={cn(
        "flex w-full rounded-lg hover:bg-background",
        isActive ? "bg-background" : "",
      )}
    >
      <Link
        onClick={haptic}
        href={path}
        aria-label={name}
        aria-current={isActive ? "page" : undefined}
        className="m-auto px-3 py-2"
      >
        {logo}
      </Link>
    </li>
  );
}
