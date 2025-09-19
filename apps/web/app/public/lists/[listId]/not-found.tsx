import { X } from "lucide-react";

export default function PublicListPageNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <X className="h-12 w-12 text-gray-300" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-2xl font-semibold text-gray-800">
        List not found
      </h1>
      <p className="text-center text-gray-500">
        The list you&apos;re looking for doesn&apos;t exist or may have been
        removed.
      </p>
    </div>
  );
}
