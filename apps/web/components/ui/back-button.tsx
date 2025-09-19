"use client";

import { useRouter } from "next/navigation";

import type { ButtonProps } from "./button";
import { Button } from "./button";

export function BackButton({ ...props }: ButtonProps) {
  const router = useRouter();
  return <Button {...props} onClick={() => router.back()} />;
}
