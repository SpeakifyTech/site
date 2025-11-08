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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Edit, Trash2, AlertTriangle, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  description: string | null;
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

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json() as { project?: Project; error?: string };
      if (res.ok && data.project) {
        setProject(data.project);
        setEditName(data.project.name);
        setEditDescription(data.project.description || "");
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

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
        }),
      });
      const data = await res.json() as { error?: string; success?: boolean; project?: Project };
      if (res.ok) {
        setIsEditModalOpen(false);
        setErrorMessage("");
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
        setSelectedFile(null);
        // Reset file input
        const fileInput = document.getElementById("audio-file") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        setErrorMessage("");
        setIsUploadModalOpen(false);
        fetchAudioUploads(); // Refresh the list
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
            <Button onClick={() => router.push("/")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <Separator orientation="vertical" className="mr-2 h-4" />
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
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : project ? (
          <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">{project.name}</CardTitle>
              <CardDescription>
                Created: {new Date(project.createdAt).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <div>
                <h3 className="text-lg font-semibold">Description</h3>
                <p className="text-muted-foreground">
                  {project.description || "No description provided."}
                </p>
              </div>
              <Separator />
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Audio Files</h3>
                  <Dialog open={isUploadModalOpen} onOpenChange={(open) => {
                    setIsUploadModalOpen(open);
                    if (open) {
                      // clear previous errors and selected file when opening modal
                      setErrorMessage("");
                      setSelectedFile(null);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Audio
                      </Button>
                    </DialogTrigger>
                      <DialogContent>
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
                        <div className="space-y-4">
                        <div>
                          <Label htmlFor="audio-file" className="mb-2">
                            Select Audio File
                          </Label>
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
                    </DialogContent>
                  </Dialog>
                </div>
                {isLoadingUploads ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : audioUploads.length === 0 ? (
                  <p className="text-center text-muted-foreground pb-6">
                    No audio files yet. Upload your first audio file!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {audioUploads.map((upload) => (
                      <Card key={upload.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-semibold">{upload.fileName}</h4>
                              <p className="text-xs text-muted-foreground mt-2">
                                Uploaded: {new Date(upload.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Dialog open={false} onOpenChange={() => {}}>
                                {/* placeholder in case we want preview/modal later */}
                              </Dialog>
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
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              <Separator />
              <div className="flex space-x-2">
                <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
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
                        <Label htmlFor="edit-desc" className="mb-2">
                          Description (optional)
                        </Label>
                        <Input
                          id="edit-desc"
                          value={editDescription}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDescription(e.target.value)}
                          placeholder="Enter project description"
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
                  </DialogContent>
                </Dialog>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </Button>
              </div>
            </CardContent>
          </Card>
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
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDeleteProject}>
                Delete
              </Button>
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
              <Button variant="outline" onClick={() => { setIsDeleteUploadDialogOpen(false); setSelectedUploadToDelete(null); }} disabled={isDeletingUpload}>
                Cancel
              </Button>
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
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}