import type { Metadata } from "next";
import UserList from "@/components/admin/UserList";

export const metadata: Metadata = {
  title: "Users | Karakeep",
};

export default function AdminUsersPage() {
  return <UserList />;
}
