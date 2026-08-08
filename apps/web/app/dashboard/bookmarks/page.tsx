import React from "react";
import DenseFiles from "@/components/dashboard/dense/DenseFiles";

export default async function BookmarksPage() {
  return <DenseFiles label="Files" query={{ archived: false }} />;
}
