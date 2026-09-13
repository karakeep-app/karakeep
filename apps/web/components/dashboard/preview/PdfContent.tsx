"use client";

import dynamic from "next/dynamic";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";

// PDF.js requires browser APIs; keep it out of server rendering and other previews.
const PdfContent = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <FullPageSpinner />,
});

export default PdfContent;
