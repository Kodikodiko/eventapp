
'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { EVENT_ID, Attendee, Sponsor } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, FileDown, Trash2, Loader2 } from 'lucide-react';

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<string | null>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  const attendeesCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/attendees`), [firestore]);
  const sponsorsCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsors`), [firestore]);

  const handleExport = async () => {
    if (!email) {
      toast({ variant: 'destructive', title: 'Email required', description: 'Please enter an email address to search for.' });
      return;
    }
    setIsLoading(true);

    try {
      const attendeeQuery = query(attendeesCol, where('email', '==', email));
      const sponsorContactQuery = query(sponsorsCol, where('contacts', 'array-contains', { email }));
      
      const [attendeeSnapshot, sponsorSnapshot] = await Promise.all([
        getDocs(attendeeQuery),
        getDocs(sponsorContactQuery)
      ]);

      const dataToExport = [];
      let foundData = false;

      if (!attendeeSnapshot.empty) {
        foundData = true;
        attendeeSnapshot.forEach(doc => {
            const data = doc.data() as Attendee;
            dataToExport.push({
                Source: 'Attendee Registration',
                Name: data.fullName,
                Email: data.email,
                Company: data.company,
                'PMI Number': data.pmiNumber,
                'Billing Address': data.billingAddress,
                Status: data.status,
                'Registration Date': data.registrationDate,
            });
        });
      }
      
       if (!sponsorSnapshot.empty) {
        foundData = true;
        sponsorSnapshot.forEach(doc => {
            const sponsorData = doc.data() as Sponsor;
            const contact = sponsorData.contacts.find(c => c.email === email);
            if (contact) {
                 dataToExport.push({
                    Source: 'Sponsor Contact',
                    'Sponsor Company': sponsorData.companyName,
                    'Contact Name': contact.name,
                    'Contact Email': contact.email,
                    'Contact Phone': contact.phone,
                });
            }
        });
      }

      if (!foundData) {
        toast({ title: 'No Data Found', description: `No records found for ${email}.` });
      } else {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Personal Data');
        XLSX.writeFile(workbook, `gdpr_export_${email}.xlsx`);
        toast({ title: 'Export Successful', description: `Data for ${email} has been exported.` });
      }

    } catch (error) {
      console.error('Error exporting data:', error);
      toast({ variant: 'destructive', title: 'Export Failed', description: 'An error occurred while exporting data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!personToDelete || !firestore) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);
      let foundData = false;

      // Anonymize Attendee
      const attendeeQuery = query(attendeesCol, where('email', '==', personToDelete));
      const attendeeSnapshot = await getDocs(attendeeQuery);
      if (!attendeeSnapshot.empty) {
        foundData = true;
        attendeeSnapshot.forEach(doc => {
          batch.update(doc.ref, {
            fullName: 'Deleted User',
            email: `deleted-${doc.id}@example.com`,
            company: '',
            pmiNumber: '',
            billingAddress: '',
          });
        });
      }

      // Anonymize Sponsor Contact
      const sponsorQuery = query(sponsorsCol, where('contacts', 'array-contains', { email: personToDelete }));
      const sponsorSnapshot = await getDocs(sponsorQuery);
      if (!sponsorSnapshot.empty) {
        foundData = true;
        sponsorSnapshot.forEach(doc => {
            const sponsor = doc.data() as Sponsor;
            const updatedContacts = sponsor.contacts.map(c => 
                c.email === personToDelete 
                    ? { ...c, name: 'Deleted Contact', email: `deleted-contact-${doc.id}@example.com`, phone: '' }
                    : c
            );
            batch.update(doc.ref, { contacts: updatedContacts });
        });
      }

      if (!foundData) {
        toast({ title: 'No Data Found', description: `No records to delete for ${personToDelete}.` });
      } else {
        await batch.commit();
        toast({ title: 'Deletion Successful', description: `Personal data for ${personToDelete} has been anonymized.` });
      }

    } catch (error) {
      console.error('Error deleting data:', error);
      toast({ variant: 'destructive', title: 'Deletion Failed', description: 'An error occurred while deleting data.' });
    } finally {
      setIsDeleting(false);
      setPersonToDelete(null);
    }
  };

  const handleDeleteRequest = () => {
     if (!email) {
      toast({ variant: 'destructive', title: 'Email required', description: 'Please enter an email address to delete.' });
      return;
    }
    setPersonToDelete(email);
  }

  return (
    <>
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin & GDPR Tools</h1>
        <p className="text-muted-foreground">Manage data subject requests for GDPR compliance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Subject Request</CardTitle>
          <CardDescription>Enter an email address to find and manage a person's data across the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex w-full max-w-lg items-center space-x-2">
            <div className="relative flex-grow">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="email"
                    placeholder="person@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                />
            </div>
            <Button onClick={handleExport} disabled={isLoading || isDeleting}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Export Data
            </Button>
            <Button variant="destructive" onClick={handleDeleteRequest} disabled={isLoading || isDeleting}>
                 {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete Data
            </Button>
            </div>
        </CardContent>
      </Card>
    </div>

    <AlertDialog open={!!personToDelete} onOpenChange={() => setPersonToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently anonymize all personal data associated with the email <span className="font-medium">{personToDelete}</span>. This includes attendee records and sponsor contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm & Anonymize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
