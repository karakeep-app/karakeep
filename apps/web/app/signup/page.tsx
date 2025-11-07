import { redirect } from "next/dist/client/components/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import SignUpForm from "@/components/signup/SignUpForm";
import { getServerAuthSession } from "@/server/auth";

export default async function SignUpPage() {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}
