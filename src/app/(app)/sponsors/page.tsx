
"use client";

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, PlusCircle, Star, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import {
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import {
  Sponsor,
  SponsorPackage,
  EVENT_ID,
} from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { PackageFormDialog, PackageFormValues } from '@/components/sponsors/package-form';
import { SponsorFormDialog, SponsorFormValues } from '@/components/sponsors/sponsor-form';
import { Skeleton } from '@/components/ui/skeleton';

export default function SponsorsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  // State for dialogs
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  const [isSponsorDialogOpen, setIsSponsorDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SponsorPackage | undefined>(undefined);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | undefined>(undefined);

  // Firestore collections
  const packagesCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsorPackages`), [firestore]);
  const sponsorsCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsors`), [firestore]);

  const { data: packages, isLoading: packagesLoading } = useCollection<SponsorPackage>(packagesCol);
  const { data: sponsors, isLoading: sponsorsLoading } = useCollection<Sponsor>(sponsorsCol);

  // Seed default packages if collection is empty
  useEffect(() => {
    if (packages?.length === 0 && !packagesLoading) {
      const defaultPackages: Omit<SponsorPackage, 'id'>[] = [
        { name: 'Platinum', price: 10000, benefits: ['Keynote shout-out', 'Large booth space', 'Logo on all materials', '4 free tickets'], eventId: EVENT_ID },
        { name: 'Gold', price: 5000, benefits: ['Medium booth space', 'Logo on website', '2 free tickets'], eventId: EVENT_ID },
        { name: 'Silver', price: 2500, benefits: ['Small booth space', '1 free ticket'], eventId: EVENT_ID },
      ];
      defaultPackages.forEach(pkg => addDocumentNonBlocking(packagesCol, pkg));
    }
  }, [packages, packagesLoading, packagesCol]);

  const handleOpenPackageDialog = (pkg?: SponsorPackage) => {
    setEditingPackage(pkg);
    setIsPackageDialogOpen(true);
  };

  const handleOpenSponsorDialog = (sponsor?: Sponsor) => {
    setEditingSponsor(sponsor);
    setIsSponsorDialogOpen(true);
  };

  const handlePackageSubmit = (data: PackageFormValues) => {
    if (editingPackage) {
      updateDocumentNonBlocking(doc(packagesCol, editingPackage.id), data);
      toast({ title: "Package Updated" });
    } else {
      addDocumentNonBlocking(packagesCol, { ...data, eventId: EVENT_ID });
      toast({ title: "Package Added" });
    }
    setIsPackageDialogOpen(false);
  };
  
  const handleSponsorSubmit = (data: SponsorFormValues) => {
    const sponsorData = {
        ...data,
        eventId: EVENT_ID,
    };
    if (editingSponsor) {
        updateDocumentNonBlocking(doc(sponsorsCol, editingSponsor.id), sponsorData);
        toast({ title: "Sponsor Updated" });
    } else {
        addDocumentNonBlocking(sponsorsCol, {
            ...sponsorData,
            paymentDetails: { // Add default payment details for new sponsors
                amount: packages?.find(p => p.id === data.packageId)?.price ?? 0,
                billedAmount: 0,
                dueDate: null,
                status: 'open',
                discount: 0,
            }
        });
        toast({ title: "Sponsor Added" });
    }
    setIsSponsorDialogOpen(false);
  };

  const handleDeletePackage = (packageId: string) => {
    // Check if any sponsor is using this package
    if (sponsors?.some(s => s.packageId === packageId)) {
        toast({
            variant: "destructive",
            title: "Cannot Delete Package",
            description: "This package is currently assigned to one or more sponsors.",
        });
        return;
    }
    deleteDocumentNonBlocking(doc(packagesCol, packageId));
    toast({ title: "Package Deleted" });
  };
  
  const getPackageName = (packageId: string) => {
    return packages?.find(p => p.id === packageId)?.name ?? 'N/A';
  }

  const isLoading = packagesLoading || sponsorsLoading;

  return (
    <>
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sponsorship Packages</h1>
              <p className="text-muted-foreground">Manage sponsor packages and deliverables.</p>
            </div>
            <Button size="sm" className="h-8 gap-1" onClick={() => handleOpenPackageDialog()}>
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add Package
              </span>
            </Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {isLoading ? (
                Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-80 w-full" />)
            ) : (
                packages?.map((pkg) => (
                <Card key={pkg.id} className="flex flex-col">
                    <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Star className="text-primary"/> {pkg.name}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPackageDialog(pkg)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeletePackage(pkg.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-baseline gap-1 pt-2">
                        <span className="text-3xl font-bold tracking-tight">€{pkg.price.toLocaleString()}</span>
                    </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-6 pt-0">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                        {pkg.benefits.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-primary" /> {feature}
                        </li>
                        ))}
                    </ul>
                    </CardContent>
                </Card>
                ))
            )}
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Sponsors</CardTitle>
                <CardDescription>
                  A list of companies sponsoring this event.
                </CardDescription>
              </div>
              <Button size="sm" className="h-8 gap-1" onClick={() => handleOpenSponsorDialog()}>
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Add Sponsor
                </span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Primary Contact</TableHead>
                  <TableHead>Payment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                    Array.from({length: 2}).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        </TableRow>
                    ))
                ) : (
                    sponsors?.map((sponsor) => (
                    <TableRow key={sponsor.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">
                            <Link href={`/sponsors/${sponsor.id}`} className="hover:underline">
                                {sponsor.companyName}
                            </Link>
                        </TableCell>
                        <TableCell>
                        <Badge variant="outline">{getPackageName(sponsor.packageId)}</Badge>
                        </TableCell>
                        <TableCell>
                            <div>{sponsor.contacts[0]?.name}</div>
                            <div className="text-sm text-muted-foreground">{sponsor.contacts[0]?.email}</div>
                        </TableCell>
                        <TableCell>
                            <Badge variant={sponsor.paymentDetails.status === 'paid' ? 'secondary' : 'default'}>
                                {sponsor.paymentDetails.status}
                            </Badge>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
             {!isLoading && sponsors?.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">No sponsors added yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {isPackageDialogOpen && (
         <PackageFormDialog
            open={isPackageDialogOpen}
            onOpenChange={setIsPackageDialogOpen}
            onSubmit={handlePackageSubmit}
            pkg={editingPackage}
        />
      )}

      {isSponsorDialogOpen && (
        <SponsorFormDialog
            open={isSponsorDialogOpen}
            onOpenChange={setIsSponsorDialogOpen}
            onSubmit={handleSponsorSubmit}
            sponsor={editingSponsor}
            packages={packages ?? []}
        />
      )}
    </>
  );
}
