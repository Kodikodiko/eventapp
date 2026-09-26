
"use client";

import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Sponsor, SponsorPackage, EVENT_ID } from '@/lib/data';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Edit, Mail, Phone, User, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useState } from 'react';
import { PaymentDetailsForm, PaymentFormValues } from '@/components/sponsors/payment-details-form';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

export default function SponsorDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);

  const sponsorRef = useMemoFirebase(() => doc(firestore, `events/${EVENT_ID}/sponsors`, id as string), [firestore, id]);
  const packagesColRef = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsorPackages`), [firestore]);

  const { data: sponsor, isLoading: sponsorLoading } = useDoc<Sponsor>(sponsorRef);
  const { data: packages, isLoading: packagesLoading } = useCollection<SponsorPackage>(packagesColRef);

  const sponsorPackage = packages?.find(p => p.id === sponsor?.packageId);
  const isLoading = sponsorLoading || packagesLoading;
  
  const handleUpdatePayment = (data: PaymentFormValues) => {
    if (!sponsorRef) return;

    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    
    const paymentDetails = {
      ...sponsor?.paymentDetails,
      ...data,
      dueDate,
    };
    
    updateDocumentNonBlocking(sponsorRef, { paymentDetails });
    toast({ title: "Payment Details Updated" });
    setIsPaymentFormOpen(false);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-500';
      case 'billed': return 'bg-blue-500';
      case 'overdue': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  }

  const totalDue = (sponsor?.paymentDetails.amount ?? 0) - (sponsor?.paymentDetails.discount ?? 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!sponsor) {
    return (
      <div>
        <Button variant="ghost" onClick={() => router.push('/sponsors')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sponsors
        </Button>
        <div className="text-center py-12">
            <h2 className="text-xl font-semibold">Sponsor not found</h2>
            <p className="text-muted-foreground">The requested sponsor could not be located.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
           <Button variant="ghost" onClick={() => router.push('/sponsors')} className="mb-4 -ml-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sponsors
            </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{sponsor.companyName}</h1>
              <div className="text-lg text-muted-foreground flex items-center gap-2">
                <Badge variant="outline">{sponsorPackage?.name ?? 'Loading...'}</Badge>
                <span>Sponsor</span>
              </div>
            </div>
          </div>
        </div>
        
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Payment Details</CardTitle>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsPaymentFormOpen(true)}>
                        <Edit className="h-4 w-4"/>
                    </Button>
                </div>
                <CardDescription>Status of the sponsorship payment.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
                <div className="flex flex-col space-y-1.5 rounded-lg border p-4">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className="w-fit">
                        <span className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(sponsor.paymentDetails.status)}`} />
                        {sponsor.paymentDetails.status}
                    </Badge>
                </div>
                <div className="flex flex-col space-y-1.5 rounded-lg border p-4">
                    <span className="text-sm text-muted-foreground">Total Due</span>
                    <span className="text-2xl font-bold">€{totalDue.toLocaleString()}</span>
                </div>
                <div className="flex flex-col space-y-1.5 rounded-lg border p-4">
                    <span className="text-sm text-muted-foreground">Amount Received</span>
                    <span className="text-2xl font-bold text-green-600">€{sponsor.paymentDetails.billedAmount.toLocaleString()}</span>
                </div>

                <div className="flex flex-col space-y-1 text-sm col-span-3 md:col-span-1">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Package Price</span>
                        <span>€{sponsor.paymentDetails.amount.toLocaleString()}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Discount</span>
                        <span>- €{sponsor.paymentDetails.discount.toLocaleString()}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Due Date</span>
                        <span>
                            {sponsor.paymentDetails.dueDate 
                                ? format(typeof sponsor.paymentDetails.dueDate === 'string' ? new Date(sponsor.paymentDetails.dueDate) : sponsor.paymentDetails.dueDate.toDate(), 'dd.MM.yyyy')
                                : 'N/A'
                            }
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Contacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {sponsor.contacts.map((contact, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                            <p className="font-semibold flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/> {contact.name}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-2"><Mail className="h-4 w-4 text-muted-foreground"/> {contact.email}</p>
                            {contact.phone && <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1"><Phone className="h-4 w-4 text-muted-foreground"/> {contact.phone}</p>}
                        </div>
                    ))}
                </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle>Billing Address</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="whitespace-pre-wrap text-muted-foreground">{sponsor.billingAddress}</p>
                </CardContent>
            </Card>
        </div>
      </div>
      <PaymentDetailsForm
        open={isPaymentFormOpen}
        onOpenChange={setIsPaymentFormOpen}
        onSubmit={handleUpdatePayment}
        paymentDetails={sponsor.paymentDetails}
      />
    </>
  );
}
