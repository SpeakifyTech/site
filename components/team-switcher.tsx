"use client"

import * as React from "react"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string
    // logo can be a component type (e.g. an ElementType) or a React node
    logo: React.ElementType | React.ReactNode
    plan: string
  }[]
}) {
  const { state, toggleSidebar } = useSidebar()
  const [isHovered, setIsHovered] = React.useState(false)
  const activeTeam = teams[0]

  if (!activeTeam) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="w-full justify-start data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          onClick={toggleSidebar}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg relative overflow-hidden">
            <div
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${state === "collapsed" && isHovered ? "opacity-0" : "opacity-100"}`}
            >
              {typeof activeTeam.logo === "function" ? (
                React.createElement(activeTeam.logo as React.ElementType, { className: "size-8" })
              ) : (
                <div className="size-4 bg-sidebar-primary">{activeTeam.logo}</div>
              )}
            </div>
            <div
              className={`absolute bg-sidebar-primary inset-0 flex items-center justify-center transition-opacity duration-500 ${state === "collapsed" && isHovered ? "opacity-100" : "opacity-0"}`}
            >
              <PanelRightClose className="h-4 w-4" />
            </div>
          </div>
          {state === "expanded" && (
            <>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{activeTeam.name}</span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSidebar()
                }}
                className="ml-auto p-1 hover:bg-sidebar-accent rounded-md transition-colors cursor-pointer"
                aria-label="Collapse sidebar"
              >
                <PanelRightOpen className="h-4 w-4" />
              </div>
            </>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
