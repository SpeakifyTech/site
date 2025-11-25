"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Frame, SquareTerminal } from "lucide-react"
import Image from "next/image"
import type { StaticImageData } from "next/image"
import iconPng from "@/app/icon.png"

import { authClient } from "@/lib/auth-client"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

interface Project {
  id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  strict: boolean;
  timeframe: number;
  createdAt: string;
}

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user?: { name: string; email: string; avatar: string | undefined } }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const { data: session } = authClient.useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json() as { projects?: Project[]; error?: string };
      if (res.ok && data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  // Determine which item should be active based on current path
  const getActiveItem = () => {
    // Check if we're on a project page (including subpages)
    const projectMatch = pathname.match(/^\/dashboard\/project\/([^\/]+)/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      return `/dashboard/project/${projectId}`;
    }
    // Default to dashboard
    return "/dashboard";
  };

  const activeUrl = getActiveItem();

  const data = {
    user: user,
    teams: [
      {
        name: "Speakify",
        logo: (props: { className?: string } & Omit<React.ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height'>) => {
          const { className, ...rest } = props ?? {}
          const width = (iconPng as StaticImageData)?.width ?? 32
          const height = (iconPng as StaticImageData)?.height ?? 32
          return (
            <Image src={iconPng} alt="Speakify logo" className={className} width={width} height={height} {...rest} />
          )
        },
        plan: "Your voice starts here.",
      },
    ],
    navMain: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: SquareTerminal,
        isActive: activeUrl === "/dashboard",
      },
      ...projects.map(p => ({
        title: p.name,
        url: `/dashboard/project/${p.id}`,
        icon: Frame,
        isActive: activeUrl === `/dashboard/project/${p.id}`
      })),
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        {user && <NavUser user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
