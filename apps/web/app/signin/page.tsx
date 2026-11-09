import { redirect } from "next/dist/client/components/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import SignInForm from "@/components/signin/SignInForm";
import { getServerAuthSession } from "@/server/auth";

import { validateRedirectUrl } from "@karakeep/shared/utils/redirectUrl";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectUrl?: string | string[] }>;
}) {
  const session = await getServerAuthSession();
  const { redirectUrl: rawRedirectUrl } = await searchParams;
  // A repeated parameter comes in as an array, which isn't a valid target
  const redirectUrl =
    (typeof rawRedirectUrl === "string"
      ? validateRedirectUrl(rawRedirectUrl)
      : undefined) ?? "/";
  if (session) {
    redirect(redirectUrl);
  }

  return (
    // Laid out from the top: an error appearing in the form can't move the logo.
    <div className="flex min-h-screen justify-center bg-background px-4 py-12 sm:px-6 sm:pt-[12vh] lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <SignInForm redirectUrl={redirectUrl} />
      </div>
    </div>
  );
}
