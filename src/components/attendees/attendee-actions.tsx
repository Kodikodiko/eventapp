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
import { MoreHorizontal, QrCode as QrCodeIcon, FileText, Trash2, Edit, UserCheck } from 'lucide-react';
import { QrCode } from './qr-code';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AttendeeFormDialog, AttendeeFormValues } from './attendee-form-dialog';
import { format } from 'date-fns';


type DialogType = 'invoice' | 'qrcode' | 'edit' | null;

type AttendeeActionsProps = {
  attendee: Attendee;
  onUnregister: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Attendee, 'id'>>) => void;
};


export function AttendeeActions({ attendee, onUnregister, onUpdate }: AttendeeActionsProps) {
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
        description: `${attendee.fullName} has been unregistered from the event.`,
    });
    setIsUnregisterAlertOpen(false);
  };
  
  const handleUpdate = (data: AttendeeFormValues) => {
    onUpdate(attendee.id, { 
        ...data,
        roles: data.roles as any,
    });
    setOpenDialog(null);
  };
  
  const handleConfirmRegistration = () => {
    onUpdate(attendee.id, { status: 'Confirmed' });
    toast({
      title: 'Registration Confirmed',
      description: `${attendee.fullName} is now confirmed for the event.`,
    });
  }

  const getRegistrationDate = () => {
    if (!attendee.registrationDate) {
      return null;
    }
    if (typeof attendee.registrationDate === 'string') {
      return new Date(attendee.registrationDate);
    }
    // It's a Firestore Timestamp
    return attendee.registrationDate.toDate();
  };

  const registrationDate = getRegistrationDate();


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
          <DropdownMenuItem onClick={() => setOpenDialog('edit')}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Attendee
          </DropdownMenuItem>
          {attendee.status === 'Waitlisted' && (
            <DropdownMenuItem onClick={handleConfirmRegistration}>
                <UserCheck className="mr-2 h-4 w-4" />
                Confirm Registration
            </DropdownMenuItem>
          )}
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

      {openDialog === 'edit' && (
        <AttendeeFormDialog 
            open={true}
            onOpenChange={(isOpen) => !isOpen && setOpenDialog(null)}
            attendee={attendee}
            onSubmit={handleUpdate}
        />
      )}

      <Dialog open={openDialog === 'invoice' || openDialog === 'qrcode'} onOpenChange={(isOpen) => !isOpen && setOpenDialog(null)}>
        <DialogContent>
          {openDialog === 'invoice' && (
            <>
              <DialogHeader>
                <DialogTitle>Invoice {attendee.invoiceId}</DialogTitle>
                <DialogDescription>
                  For {attendee.fullName} - Registered on {registrationDate ? format(registrationDate, 'PPP') : '...'}
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
                <DialogTitle>QR Code for {attendee.fullName}</DialogTitle>
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
              This action will unregister {attendee.fullName} from the event. This cannot be undone.
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
