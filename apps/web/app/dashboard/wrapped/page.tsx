"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WrappedModal } from "@/components/wrapped";

export default function WrappedPage() {
  const router = useRouter();

  const handleClose = () => {
    router.push("/dashboard/bookmarks");
  };

  // Always show the modal when this page is loaded
  useEffect(() => {
    // Prevent page from being scrollable when modal is open
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return <WrappedModal open={true} onClose={handleClose} />;
}
