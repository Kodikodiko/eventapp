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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, QrCode as QrCodeIcon, FileText } from 'lucide-react';
import { QrCode } from './qr-code';
import { useState } from 'react';

type DialogType = 'invoice' | 'qrcode' | null;

export function AttendeeActions({ attendee }: { attendee: Attendee }) {
    const [openDialog, setOpenDialog] = useState<DialogType>(null);

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
          <DropdownMenuItem className="text-destructive">Unregister</DropdownMenuItem>
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
    </>
  );
}
