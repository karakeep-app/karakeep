import { Rocket } from "lucide-react";

import { CLOUD_SIGNUP_LINK } from "../constants";

export default function Banner() {
  return (
    <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-3 py-2 text-center sm:px-4 sm:py-3">
      <div className="container flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-700 sm:gap-3 sm:text-base">
        <div className="flex flex-wrap items-center justify-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1">
          <Rocket className="size-4 text-amber-600 sm:size-5" />
          <span className="font-semibold text-slate-800">
            Karakeep Cloud Public Beta is Now Live
          </span>
        </div>
        <a
          href={CLOUD_SIGNUP_LINK}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-amber-700 underline decoration-amber-400 underline-offset-2 transition-all hover:text-amber-800 sm:rounded-full sm:border sm:border-amber-300 sm:bg-amber-500 sm:px-3 sm:py-1 sm:text-sm sm:text-white sm:no-underline sm:shadow-sm sm:hover:border-amber-400 sm:hover:bg-amber-600"
        >
          Join Now <span className="hidden sm:inline">&rarr;</span>
        </a>
      </div>
    </div>
  );
}
