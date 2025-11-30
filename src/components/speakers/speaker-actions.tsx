"use client"

import type { Speaker } from '@/lib/data';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2, Edit, Upload, Send } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { SpeakerFormDialog, SpeakerFormValues } from './speaker-form-dialog';


type SpeakerActionsProps = {
  speaker: Speaker;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Speaker, 'id'>>) => void;
};


export function SpeakerActions({ speaker, onDelete, onUpdate }: SpeakerActionsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const { toast } = useToast();

  const handleDeleteClick = () => {
    setIsDeleteAlertOpen(true);
  }

  const handleDeleteConfirm = () => {
    onDelete(speaker.id);
    toast({
        title: "Speaker Deleted",
        description: `${speaker.name} has been removed from the speaker list.`,
    });
    setIsDeleteAlertOpen(false);
  };
  
  const handleUpdate = (data: SpeakerFormValues) => {
    onUpdate(speaker.id, data);
    setIsFormOpen(false);
  };

  const handleUploadSlides = () => {
    // This is a placeholder for the actual file upload logic.
    // In a real app, this would open a file picker and upload to Firebase Storage.
    toast({
        title: "Uploading Slides...",
        description: `Preparing to upload slides for ${speaker.name}.`,
    });
    // Simulate upload and status change
    setTimeout(() => {
        onUpdate(speaker.id, { slidesStatus: 'Review' });
        toast({
            title: "Slides Submitted",
            description: `Slides for ${speaker.name} are now in review.`,
        });
    }, 1500)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-haspopup="true" size="icon" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setIsFormOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Speaker
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleUploadSlides}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Slides
          </DropdownMenuItem>
          <DropdownMenuItem>
              <Send className="mr-2 h-4 w-4" />
              Send Message
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={handleDeleteClick}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SpeakerFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        speaker={speaker}
        onSubmit={handleUpdate}
      />
      
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete {speaker.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Speaker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
