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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Edit, Trash2, AlertTriangle, Upload, Info, BarChart3, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";

interface Project {
  id: string;
  name: string;
  description: string | null;
  vibe: string | null;
  strict: boolean;
  timeframe: number;
  createdAt: string;
}

interface AudioUpload {
  id: string;
  fileName: string;
  createdAt: string;
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { data: session, isPending } = authClient.useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVibe, setEditVibe] = useState("");
  const [editStrictMode, setEditStrictMode] = useState(false);
  const [editTimeframe, setEditTimeframe] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB client-side limit
  const [audioUploads, setAudioUploads] = useState<AudioUpload[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDeleteUploadDialogOpen, setIsDeleteUploadDialogOpen] = useState(false);
  const [selectedUploadToDelete, setSelectedUploadToDelete] = useState<AudioUpload | null>(null);
  const [isDeletingUpload, setIsDeletingUpload] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json() as { project?: Project; error?: string };
      if (res.ok && data.project) {
        setProject(data.project);
        setEditName(data.project.name);
        setEditDescription(data.project.description || "");
        setEditVibe(data.project.vibe || "");
        setEditStrictMode(data.project.strict ?? false);
        setEditTimeframe(data.project.timeframe ? String(Math.round(data.project.timeframe / 1000)) : "");
      } else {
        setErrorMessage(data.error || "Failed to fetch project");
      }
    } catch (err) {
      setErrorMessage("An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAudioUploads = async () => {
    try {
    const res = await fetch(`/api/uploads/${projectId}`);
      const data = await res.json() as { uploads?: AudioUpload[]; error?: string };
      if (res.ok && data.uploads) {
        setAudioUploads(data.uploads);
      } else {
        console.error("Failed to fetch audio uploads:", data.error);
      }
    } catch (err) {
      console.error("Error fetching audio uploads:", err);
    } finally {
      setIsLoadingUploads(false);
    }
  };

  useEffect(() => {
    if (session && projectId) {
      fetchProject();
      fetchAudioUploads();
    }
  }, [session, projectId]);

  useEffect(() => {
    if (isEditModalOpen && editField) {
      // Focus on the specific field after a short delay to ensure the modal is rendered
      setTimeout(() => {
        const elementId = editField === 'description' ? 'edit-desc' :
                         editField === 'vibe' ? 'edit-vibe' :
                         editField === 'strict' ? 'edit-strict' :
                         editField === 'timeframe' ? 'edit-timeframe' : 'edit-name';
        const element = document.getElementById(elementId);
        if (element) {
          element.focus();
          if (element.tagName === 'INPUT') {
            (element as HTMLInputElement).select();
          }
        }
      }, 100);
    }
  }, [isEditModalOpen, editField]);

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setIsUpdating(true);
    try {
      const trimmedVibe = editVibe.trim();
      const timeframeValue = editTimeframe.trim();
      const parsedTimeframe = timeframeValue ? Number.parseInt(timeframeValue, 10) * 1000 : 0;

      if (timeframeValue && (Number.isNaN(parsedTimeframe) || parsedTimeframe < 0)) {
        setErrorMessage("Timeframe must be a non-negative integer.");
        setIsUpdating(false);
        return;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          vibe: trimmedVibe || null,
          strict: editStrictMode,
          timeframe: parsedTimeframe,
        }),
      });
      const data = await res.json() as { error?: string; success?: boolean; project?: Project };
      if (res.ok) {
        setIsEditModalOpen(false);
        setErrorMessage("");
        setEditVibe("");
        setEditStrictMode(false);
        setEditTimeframe("");
        fetchProject(); // Refresh
        // Also refresh sidebar
        if (typeof window !== 'undefined' && (window as any).refreshSidebarProjects) {
          (window as any).refreshSidebarProjects();
        }
      } else {
        setErrorMessage(data.error || "Failed to update project");
      }
    } catch (err) {
      setErrorMessage("An error occurred");
    }
    setIsUpdating(false);
  };

  const confirmDeleteProject = async () => {
    if (!project) return;
    setIsDeleteConfirmOpen(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard"); // Redirect to dashboard
        // Also refresh sidebar (though it will be refreshed when dashboard loads)
        if (typeof window !== 'undefined' && (window as any).refreshSidebarProjects) {
          (window as any).refreshSidebarProjects();
        }
      } else {
        const data = await res.json() as { error?: string };
        setErrorMessage(data.error || "Failed to delete project");
      }
    } catch (err) {
      setErrorMessage("An error occurred");
    }
  };

  const confirmDeleteUpload = async () => {
    if (!selectedUploadToDelete || !project) return;
    setIsDeletingUpload(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/uploads/${project.id}/${selectedUploadToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // remove from UI
        setAudioUploads(prev => prev.filter(u => u.id !== selectedUploadToDelete.id));
        setSelectedUploadToDelete(null);
        setIsDeleteUploadDialogOpen(false);
      } else {
        const data = await res.json() as { error?: string };
        setErrorMessage(data.error || "Failed to delete file");
      }
    } catch (err) {
      setErrorMessage("An error occurred while deleting the file");
    }
    setIsDeletingUpload(false);
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !project) return;

    // Double-check size before uploading
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setErrorMessage("File is too large. Maximum size is 15MB.");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectId", project.id);
      
      const res = await fetch(`/api/uploads/${project.id}`, {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json() as { error?: string; success?: boolean; upload?: any };
      
      if (res.ok) {
        // preserve the selected file name before we clear it
        const uploadedFileName = selectedFile?.name || "Upload";
        setSelectedFile(null);
        // Reset file input
        const fileInput = document.getElementById("audio-file") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        setErrorMessage("");
        setIsUploadModalOpen(false);

        // If API returned the created upload object, normalize it and insert immediately.
        if (data.upload) {
          const normalized = {
            id: data.upload.id || `temp-${Date.now()}`,
            fileName: data.upload.fileName || uploadedFileName,
            createdAt: data.upload.createdAt || new Date().toISOString(),
          } as AudioUpload;

          // Ensure we don't duplicate an existing item with the same id
          setAudioUploads(prev => [normalized, ...prev.filter(u => u.id !== normalized.id)]);
          setIsLoadingUploads(false);
        } else {
          // Fallback: refetch the uploads list to ensure consistency
          await fetchAudioUploads();
        }
      } else {
        setErrorMessage(data.error || "Failed to upload file");
      }
    } catch (err) {
      setErrorMessage("An error occurred during upload");
    }
    
    setIsUploading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("audio/")) {
        setErrorMessage("Please select an audio file");
        setSelectedFile(null);
        return;
      }
      // Validate file size
      if (file.size > MAX_UPLOAD_BYTES) {
        setErrorMessage("File is too large. Maximum size is 15MB.");
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setErrorMessage("");
    }
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
              Please log in to access this page.
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
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Link 
              href="/dashboard" 
              className="hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">
              {project?.name || "Loading..."}
            </span>
          </nav>
        </div>
      </motion.header>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="flex flex-1 flex-col gap-4 py-2 px-8"
      >
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : project ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="space-y-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
            >
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <p className="text-muted-foreground">
                Created: {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </motion.div>

            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
              >
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            <div className="mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>Project Details</CardTitle>
                    <div className="flex items-center gap-2">
                      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
                        setIsEditModalOpen(open);
                        if (!open) {
                          setEditField(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                      <DialogContent>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                        <DialogHeader className="mb-6">
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
                                  Shared with the AI to steer the narration script directly.
                                </TooltipContent>
                              </Tooltip>
                            </Label>
                            <Input
                              id="edit-desc"
                              value={editDescription}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDescription(e.target.value)}
                              placeholder="Enter project description"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Keep sensitive information out—everything here informs the AI voiceover.
                            </p>
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
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="edit-strict"
                                checked={editStrictMode}
                                onCheckedChange={(checked) => setEditStrictMode(checked === true)}
                              />
                              <Label htmlFor="edit-strict" className="flex items-center gap-2">
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
                                    Enable when the voice must follow instructions precisely.
                                  </TooltipContent>
                                </Tooltip>
                              </Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Turn off for looser, more expressive narrations.
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
                                  The AI aims for this duration; use 0 if duration is flexible.
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Description</h3>
                      <p 
                        className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => {
                          setEditField('description');
                          setIsEditModalOpen(true);
                        }}
                      >
                        {project.description || "No description provided."}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Project Settings</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {project.vibe && (
                          <span 
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 border border-purple-200 cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setEditField('vibe');
                              setIsEditModalOpen(true);
                            }}
                          >
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-1.5"></span>
                            {project.vibe}
                          </span>
                        )}
                        <span 
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:shadow-md transition-shadow ${
                            project.strict
                              ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-200'
                              : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 border-gray-200'
                          }`}
                          onClick={() => {
                            setEditField('strict');
                            setIsEditModalOpen(true);
                          }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            project.strict ? 'bg-green-500' : 'bg-gray-400'
                          }`}></span>
                          {project.strict ? 'Strict' : 'Flexible'}
                        </span>
                        {project.timeframe > 0 && (
                          <span 
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border border-blue-200 cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setEditField('timeframe');
                              setIsEditModalOpen(true);
                            }}
                          >
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5"></span>
                            {Math.round(project.timeframe / 1000)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
              </Card>
            </motion.div>
          </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
            >
              <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Takes</CardTitle>
                  <Dialog open={isUploadModalOpen} onOpenChange={(open: boolean) => {
                    setIsUploadModalOpen(open);
                    if (open) {
                      // clear previous errors and selected file when opening modal
                      setErrorMessage("");
                      setSelectedFile(null);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Start a new take
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
                        <DialogHeader>
                          <DialogTitle>Upload Speech Audio</DialogTitle>
                          <DialogDescription>
                            Select an audio file to upload to this project.
                          </DialogDescription>
                        </DialogHeader>
                        {/* Show upload errors inside the modal */}
                        {errorMessage && (
                          <div className="pb-2">
                            <Alert variant="destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>{errorMessage}</AlertDescription>
                            </Alert>
                          </div>
                        )}
                        <div className="space-y-4 pt-4">
                        <div>
                          <Input
                            id="audio-file"
                            type="file"
                            accept="audio/*"
                            onChange={handleFileChange}
                            disabled={isUploading}
                          />
                          {selectedFile && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Selected: {selectedFile.name}
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={handleFileUpload}
                          disabled={!selectedFile || isUploading}
                          className="w-full"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Audio
                            </>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingUploads ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : audioUploads.length === 0 ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                    className="text-center text-muted-foreground py-8"
                  >
                    No audio files yet. Upload your first audio file!
                  </motion.p>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {audioUploads.map((upload) => (
                        <motion.div
                          key={upload.id}
                          layout
                          initial={{ opacity: 0, y: 12, scale: 0.995 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{ duration: 0.28, ease: "easeOut" }}
                        >
                          <Card>
                            <CardContent>
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h4 className="font-semibold">{upload.fileName}</h4>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Uploaded: {new Date(upload.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Link href={`/dashboard/project/${projectId}/analyze/${upload.id}`}>
                                    <motion.div
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                    >
                                      <Button
                                        variant="default"
                                        size="sm"
                                      >
                                        <BarChart3 className="h-4 w-4 mr-2" />
                                        Analyze
                                      </Button>
                                    </motion.div>
                                  </Link>
                                  <motion.div
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedUploadToDelete(upload);
                                        setIsDeleteUploadDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </motion.div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
            </motion.div>
          </motion.div>
        ) : (
          <Card className="w-full max-w-4xl mx-auto">
            <CardContent className="p-4">
              <p className="text-center text-muted-foreground">Project not found.</p>
            </CardContent>
          </Card>
        )}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this project? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end space-x-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="destructive" onClick={confirmDeleteProject}>
                  Delete
                </Button>
              </motion.div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={isDeleteUploadDialogOpen} onOpenChange={setIsDeleteUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Audio File</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this audio file? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end space-x-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="outline" onClick={() => { setIsDeleteUploadDialogOpen(false); setSelectedUploadToDelete(null); }} disabled={isDeletingUpload}>
                  Cancel
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="destructive" onClick={confirmDeleteUpload} disabled={isDeletingUpload}>
                  {isDeletingUpload ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </Button>
              </motion.div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </>
  );
}