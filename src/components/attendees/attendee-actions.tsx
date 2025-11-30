"use client"

import type { Attendee } from '@/lib/data';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, QrCode as QrCodeIcon, FileText, Trash2 } from 'lucide-react';
import { QrCode } from './qr-code';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';


type DialogType = 'invoice' | 'qrcode' | null;

type AttendeeActionsProps = {
  attendee: Attendee;
  onUnregister: (id: string) => void;
};


export function AttendeeActions({ attendee, onUnregister }: AttendeeActionsProps) {
  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [isUnregisterAlertOpen, setIsUnregisterAlertOpen] = useState(false);
  const { toast } = useToast();

  const handleUnregisterClick = () => {
    setIsUnregisterAlertOpen(true);
  }

  const handleUnregisterConfirm = () => {
    onUnregister(attendee.id);
    toast({
        title: "Attendee Unregistered",
        description: `${attendee.name} has been unregistered from the event.`,
    });
    setIsUnregisterAlertOpen(false);
  };


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
          <DropdownMenuItem onClick={() => setOpenDialog('invoice')}>
              <FileText className="mr-2 h-4 w-4" />
              View Invoice
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog('qrcode')}>
              <QrCodeIcon className="mr-2 h-4 w-4" />
              Show QR Code
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={handleUnregisterClick}>
            <Trash2 className="mr-2 h-4 w-4" />
            Unregister
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openDialog !== null} onOpenChange={(isOpen) => !isOpen && setOpenDialog(null)}>
        <DialogContent>
          {openDialog === 'invoice' && (
            <>
              <DialogHeader>
                <DialogTitle>Invoice {attendee.invoiceId}</DialogTitle>
                <DialogDescription>
                  For {attendee.name} - Registered on {attendee.registrationDate}
                </DialogDescription>
              </DialogHeader>
              <div>
                <p><strong>Item:</strong> Event Ticket</p>
                <p><strong>Amount:</strong> $99.00</p>
                <p><strong>Status:</strong> Paid</p>
              </div>
            </>
          )}
          {openDialog === 'qrcode' && (
            <>
              <DialogHeader>
                <DialogTitle>QR Code for {attendee.name}</DialogTitle>
                <DialogDescription>
                  Scan this code for event check-in.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-4">
                  <QrCode value={attendee.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isUnregisterAlertOpen} onOpenChange={setIsUnregisterAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will unregister {attendee.name} from the event. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnregisterConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unregister
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
