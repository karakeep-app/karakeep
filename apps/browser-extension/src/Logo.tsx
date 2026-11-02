import logoImgWhite from "../public/logo-full-white.png";
import logoImg from "../public/logo-full.png";
import { cn } from "./utils/css";

export default function Logo({ className }: { className?: string }) {
  return (
    <span className="flex items-center">
      <img
        src={logoImg}
        alt="karakeep logo"
        className={cn("h-8 dark:hidden", className)}
      />
      <img
        src={logoImgWhite}
        alt="karakeep logo"
        className={cn("hidden h-8 dark:block", className)}
      />
    </span>
  );
}
