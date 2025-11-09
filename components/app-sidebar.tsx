"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import {
  Frame,
  GalleryVerticalEnd,
  SquareTerminal,
} from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
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

  // Expose refresh function globally for pages to call
  React.useEffect(() => {
    (window as any).refreshSidebarProjects = () => fetchProjects();
  }, []);

  const data = {
    user: user,
    teams: [
      {
        name: "Speakify",
        logo: GalleryVerticalEnd,
        plan: "Enterprise",
      },
    ],
    navMain: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: SquareTerminal,
        isActive: true,
        items: [
          {
            title: "Projects",
            url: "/dashboard",
          },
        ],
      },
    ],
    projects: projects.map(p => ({ name: p.name, url: `/dashboard/project/${p.id}`, icon: Frame })),
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        {user && <NavUser user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
