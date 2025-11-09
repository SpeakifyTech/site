"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Edit, Trash2, Info } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

interface Project {
  id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  strict: boolean;
  timeframe: number;
  createdAt: string;
}

export default function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [vibe, setVibe] = useState("");
  const [strictMode, setStrictMode] = useState(false);
  const [timeframe, setTimeframe] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVibe, setEditVibe] = useState("");
  const [editStrictMode, setEditStrictMode] = useState(false);
  const [editTimeframe, setEditTimeframe] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json() as { projects?: Project[]; error?: string };
      if (res.ok && data.projects) {
        setProjects(data.projects);
      } else {
        console.error("Failed to fetch projects:", data.error);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setMessage("");
    try {
      const trimmedVibe = vibe.trim();
      const timeframeValue = timeframe.trim();
      const parsedTimeframe = timeframeValue ? Number.parseInt(timeframeValue, 10) : 0;

      if (timeframeValue && (Number.isNaN(parsedTimeframe) || parsedTimeframe < 0)) {
        setMessage("Timeframe must be a non-negative integer.");
        setIsCreating(false);
        return;
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          description: description || undefined,
          vibe: trimmedVibe || undefined,
          strict: strictMode,
          timeframe: parsedTimeframe * 1000, // Convert seconds to milliseconds
        }),
      });
      const data = await res.json() as { error?: string; success?: boolean; project?: Project };
      if (res.ok) {
        setMessage("Project created successfully!");
        setProjectName("");
        setDescription("");
        setVibe("");
        setStrictMode(false);
        setTimeframe("");
        setIsModalOpen(false);
        fetchProjects(); // Refresh the list
      } else {
        setMessage(data.error || "Failed to create project");
      }
    } catch (err) {
      setMessage("An error occurred");
    }
    setIsCreating(false);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setEditName(project.name);
    setEditDescription(project.description || "");
    setEditVibe(project.vibe || "");
    setEditStrictMode(project.strict ?? false);
    setEditTimeframe(project.timeframe ? String(Math.round(project.timeframe / 1000)) : "");
    setIsEditModalOpen(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setIsUpdating(true);
    try {
      const trimmedVibe = editVibe.trim();
      const timeframeValue = editTimeframe.trim();
      const parsedTimeframe = timeframeValue ? Number.parseInt(timeframeValue, 10) : 0;

      if (timeframeValue && (Number.isNaN(parsedTimeframe) || parsedTimeframe < 0)) {
        console.error("Timeframe must be a non-negative integer.");
        setIsUpdating(false);
        return;
      }

      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          vibe: trimmedVibe || null,
          strict: editStrictMode,
          timeframe: parsedTimeframe * 1000, // Convert seconds to milliseconds
        }),
      });
      const data = await res.json() as { error?: string; success?: boolean; project?: Project };
      if (res.ok) {
        setIsEditModalOpen(false);
        setEditingProject(null);
        setEditVibe("");
        setEditStrictMode(false);
        setEditTimeframe("");
        fetchProjects(); // Refresh the list
      } else {
        console.error(data.error || "Failed to update project");
      }
    } catch (err) {
      console.error("An error occurred");
    }
    setIsUpdating(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    setProjectToDelete(projectId);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsDeleteConfirmOpen(false);
    try {
      const res = await fetch(`/api/projects/${projectToDelete}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchProjects(); // Refresh the list
      } else {
        const data = await res.json() as { error?: string };
        console.error(data.error || "Failed to delete project");
      }
    } catch (err) {
      console.error("An error occurred");
    }
    setProjectToDelete(null);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Not Logged In</CardTitle>
            <CardDescription>
              Please log in to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full">
                Go to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
      >
        <div className="flex items-center gap-2 px-4">
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>
      </motion.header>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="flex flex-1 flex-col gap-4 p-4 pt-0"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
          className="text-center py-8"
        >
          <h1 className="text-3xl font-bold mb-2">Hello, {session.user.name.split(" ")[0]}!</h1>
          <p className="text-muted-foreground">Open a project to begin.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
        >
          <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <div className="flex justify-between items-center mt-2">
              <div className="space-y-2">
                <CardTitle>Your Projects</CardTitle>
                <CardDescription>Manage your speaking practice</CardDescription>
              </div>
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  </motion.div>
                </DialogTrigger>
                <DialogContent>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                  <DialogHeader className="mb-4">
                    <DialogTitle>Create New Project</DialogTitle>
                    <DialogDescription>
                      Enter the details for your new project.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="mb-2">
                        Project Name
                      </Label>
                      <Input
                        id="name"
                        value={projectName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProjectName(e.target.value)}
                        required
                        placeholder="Enter project name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="desc" className="mb-2 flex items-center gap-2">
                        Description (optional)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition"
                              aria-label="How the description is used"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            This text is shared with the AI to set context for generated speech.
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        id="desc"
                        value={description}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
                        placeholder="Enter project description"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Keep this concise—everything here is visible to the AI narrator.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="vibe" className="mb-2 flex items-center gap-2">
                        Vibe
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition"
                              aria-label="What vibe means"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Select the tone you want for the narration.
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Select value={vibe} onValueChange={setVibe}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a vibe..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Playful">Playful</SelectItem>
                          <SelectItem value="Authoritative">Authoritative</SelectItem>
                          <SelectItem value="Warm">Warm</SelectItem>
                          <SelectItem value="Professional">Professional</SelectItem>
                          <SelectItem value="Dramatic">Dramatic</SelectItem>
                          <SelectItem value="Neutral">Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="strict-mode"
                          checked={strictMode}
                          onCheckedChange={(checked) => setStrictMode(checked === true)}
                        />
                        <Label htmlFor="strict-mode" className="flex items-center gap-2">
                          Strict mode
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground transition"
                                aria-label="Strict mode details"
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              When enabled, the AI sticks closely to your description and vibe.
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Recommended for compliance-heavy projects; leave off for more creative delivery.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="timeframe" className="mb-2 flex items-center gap-2">
                        Target timeframe (seconds)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition"
                              aria-label="Timeframe details"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Seconds the narration should roughly last. Use 0 to skip targeting.
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        id="timeframe"
                        type="number"
                        min="0"
                        step="1"
                        value={timeframe}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeframe(e.target.value)}
                        placeholder="60"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Example: 60 equals about 60 seconds of audio.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={isCreating}
                      className="w-full"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Creating...
                        </>
                      ) : (
                        "Create Project"
                      )}
                    </Button>
                    {message && (
                      <p className="text-sm text-center text-muted-foreground">
                        {message}
                      </p>
                    )}
                  </form>
                  </motion.div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingProjects ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                className="text-center text-muted-foreground"
              >
                No projects yet. Create your first project!
              </motion.p>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.1
                    }
                  }
                }}
                className="space-y-3"
              >
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: {
                          duration: 0.3,
                          ease: "easeOut"
                        }
                      }
                    }}
                  >
                  <Link href={`/dashboard/project/${project.id}`}>
                    <Card className="cursor-pointer hover:shadow-md hover:border-primary/20 transition-all duration-200 group">
                      <CardContent>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-semibold text-lg group-hover:text-primary transition-colors truncate">
                                {project.name}
                              </h4>
                              <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                                <motion.div
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleEditProject(project);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </motion.div>
                                <motion.div
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDeleteProject(project.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </motion.div>
                              </div>
                            </div>
                            {project.description && (
                              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              {project.vibe && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 border border-purple-200">
                                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-1.5"></span>
                                  {project.vibe}
                                </span>
                              )}
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                project.strict
                                  ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-200'
                                  : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 border-gray-200'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                  project.strict ? 'bg-green-500' : 'bg-gray-400'
                                }`}></span>
                                {project.strict ? 'Strict' : 'Flexible'}
                              </span>
                              {project.timeframe > 0 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border border-blue-200">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5"></span>
                                  {Math.round(project.timeframe / 1000)}s
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="flex items-center">
                                <span className="w-1.5 h-1.5 bg-muted-foreground/30 rounded-full mr-2"></span>
                                Created {new Date(project.createdAt).toLocaleDateString()}
                              </span>
                              <span className="text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                                Click to open →
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
              <DialogContent>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                <DialogHeader className="mb-4">
                  <DialogTitle>Edit Project</DialogTitle>
                  <DialogDescription>
                    Update the details for your project.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateProject} className="space-y-4">
                  <div>
                    <Label htmlFor="edit-name" className="mb-2">
                      Project Name
                    </Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                      required
                      placeholder="Enter project name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-desc" className="mb-2 flex items-center gap-2">
                      Description (optional)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground transition"
                            aria-label="How the description is used"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          This description is provided to the AI verbatim as project context.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      id="edit-desc"
                      value={editDescription}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDescription(e.target.value)}
                      placeholder="Enter project description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-vibe" className="mb-2 flex items-center gap-2">
                      Vibe
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground transition"
                            aria-label="What vibe means"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Select the tone you want for the narration.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Select value={editVibe} onValueChange={setEditVibe}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a vibe..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Playful">Playful</SelectItem>
                        <SelectItem value="Authoritative">Authoritative</SelectItem>
                        <SelectItem value="Warm">Warm</SelectItem>
                        <SelectItem value="Professional">Professional</SelectItem>
                        <SelectItem value="Dramatic">Dramatic</SelectItem>
                        <SelectItem value="Neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="edit-strict-mode"
                        checked={editStrictMode}
                        onCheckedChange={(checked) => setEditStrictMode(checked === true)}
                      />
                      <Label htmlFor="edit-strict-mode" className="flex items-center gap-2">
                        Strict mode
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition"
                              aria-label="Strict mode details"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Keeps narration tightly aligned to your prompts when enabled.
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Disable if you want the AI to improvise or ad-lib around your script.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="edit-timeframe" className="mb-2 flex items-center gap-2">
                      Target timeframe (seconds)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground transition"
                            aria-label="Timeframe details"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Seconds goal for the final audio. Set 0 to remove the constraint.
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      id="edit-timeframe"
                      type="number"
                      min="0"
                      step="1"
                      value={editTimeframe}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTimeframe(e.target.value)}
                      placeholder="60"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Matching this duration is best-effort; narration may still vary slightly.
                    </p>
                  </div>
                  <Button type="submit" disabled={isUpdating} className="w-full">
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Updating...
                      </>
                    ) : (
                      "Update Project"
                    )}
                  </Button>
                </form>
                </motion.div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isDeleteConfirmOpen}
              onOpenChange={setIsDeleteConfirmOpen}
            >
              <DialogContent>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                <DialogHeader>
                  <DialogTitle>Delete Project</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this project? This action
                    cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteProject}
                  >
                    Delete
                  </Button>
                </div>
                </motion.div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
    </>
  );
}
