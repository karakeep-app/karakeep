import { redirect } from "next/dist/client/components/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import SignUpForm from "@/components/signup/SignUpForm";
import { getServerAuthSession } from "@/server/auth";

import {
  isMobileAppRedirect,
  validateRedirectUrl,
} from "@karakeep/shared/utils/redirectUrl";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectUrl?: string; skipSessionRedirect?: string }>;
}) {
  const session = await getServerAuthSession();
  const { redirectUrl: rawRedirectUrl, skipSessionRedirect } =
    await searchParams;
  const redirectUrl = validateRedirectUrl(rawRedirectUrl) ?? "/";
  const shouldSkipSessionRedirect =
    isMobileAppRedirect(redirectUrl) && skipSessionRedirect === "1";

  if (session && !shouldSkipSessionRedirect) {
    redirect(redirectUrl);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <SignUpForm redirectUrl={redirectUrl} />
      </div>
    </div>
  );
}
