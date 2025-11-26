"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import SidebarVersion from "./SidebarVersion"
import { TSidebarItem } from "./TSidebarItem"

export function AppSidebar({
  items,
  extraSections,
  serverVersion,
}: {
  items: TSidebarItem[]
  extraSections?: React.ReactNode
  serverVersion?: string
}) {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.path}
                  >
                    <Link href={item.path}>
                      {item.icon}
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {extraSections}
      </SidebarContent>
      <SidebarFooter>
        <SidebarVersion serverVersion={serverVersion} />
      </SidebarFooter>
    </Sidebar>
  )
}
