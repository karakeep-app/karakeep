import type { Metadata } from "next";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import UserDetails from "@/components/settings/UserDetails";
import UserOptions from "@/components/settings/UserOptions";

export const metadata: Metadata = {
  title: "Account Info | Karakeep",
};

export default async function InfoPage() {
  return (
    <div className="flex flex-col gap-4">
      <UserDetails />
      <ChangePassword />
      <UserOptions />
      <DeleteAccount />
    </div>
  );
}
