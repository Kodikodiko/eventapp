
"use client";

import { useState, useMemo, useEffect } from 'react';
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
import { Check, PlusCircle, Star, Edit, Trash2, ListFilter, ArrowUpDown, X } from 'lucide-react';
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
  SponsorPaymentStatus,
  EVENT_ID,
} from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { PackageFormDialog, PackageFormValues } from '@/components/sponsors/package-form';
import { SponsorFormDialog, SponsorFormValues } from '@/components/sponsors/sponsor-form';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


const paymentStatuses: SponsorPaymentStatus[] = ['open', 'billed', 'paid', 'overdue'];
const statusCycle: Record<SponsorPaymentStatus, SponsorPaymentStatus> = {
  open: 'billed',
  billed: 'paid',
  paid: 'overdue',
  overdue: 'open',
};

type SortKey = 'companyName' | 'packageId' | 'paymentStatus' | '';

export default function SponsorsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  // Dialog states
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  const [isSponsorDialogOpen, setIsSponsorDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SponsorPackage | undefined>(undefined);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | undefined>(undefined);

  // Sorting and filtering states
  const [sortKey, setSortKey] = useState<SortKey>('companyName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<SponsorPaymentStatus[]>([]);

  // Firestore collections
  const packagesCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsorPackages`), [firestore]);
  const sponsorsCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/sponsors`), [firestore]);

  const { data: packages, isLoading: packagesLoading } = useCollection<SponsorPackage>(packagesCol);
  const { data: sponsors, isLoading: sponsorsLoading } = useCollection<Sponsor>(sponsorsCol);

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

  const getPackageName = (packageId: string) => packages?.find(p => p.id === packageId)?.name ?? 'N/A';

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const toggleFilter = (type: 'package' | 'status', value: string) => {
    if (type === 'package') {
      setSelectedPackages(prev => prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]);
    } else {
      setSelectedStatuses(prev => prev.includes(value as SponsorPaymentStatus) ? prev.filter(s => s !== value) : [...prev, value as SponsorPaymentStatus]);
    }
  };

  const handlePackageBadgeClick = (packageId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
        toggleFilter('package', packageId);
    } else {
        if (selectedPackages.length === 1 && selectedPackages[0] === packageId) {
            setSelectedPackages([]);
        } else {
            setSelectedPackages([packageId]);
        }
    }
  };


  const handlePaymentStatusClick = (sponsor: Sponsor) => {
    const currentStatus = sponsor.paymentDetails.status;
    const nextStatus = statusCycle[currentStatus];
    const sponsorRef = doc(sponsorsCol, sponsor.id);
    updateDocumentNonBlocking(sponsorRef, { 'paymentDetails.status': nextStatus });
    toast({
      title: 'Status Updated',
      description: `${sponsor.companyName}'s status changed to ${nextStatus}.`
    });
  };

  const clearFilters = () => {
    setSelectedPackages([]);
    setSelectedStatuses([]);
  };

  const areFiltersActive = selectedPackages.length > 0 || selectedStatuses.length > 0;

  const sortedAndFilteredSponsors = useMemo(() => {
    if (!sponsors) return [];
    let filtered = [...sponsors];

    if (selectedPackages.length > 0) {
      filtered = filtered.filter(sponsor => selectedPackages.includes(sponsor.packageId));
    }

    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(sponsor => selectedStatuses.includes(sponsor.paymentDetails.status));
    }

    if (sortKey) {
      filtered.sort((a, b) => {
        let aValue, bValue;
        if (sortKey === 'packageId') {
          aValue = getPackageName(a.packageId);
          bValue = getPackageName(b.packageId);
        } else if (sortKey === 'paymentStatus') {
          aValue = a.paymentDetails.status;
          bValue = b.paymentDetails.status;
        } else {
          aValue = a[sortKey as 'companyName'];
          bValue = b[sortKey as 'companyName'];
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [sponsors, selectedPackages, selectedStatuses, sortKey, sortDirection, packages]);


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
    const sponsorData = { ...data, eventId: EVENT_ID };
    if (editingSponsor) {
        updateDocumentNonBlocking(doc(sponsorsCol, editingSponsor.id), sponsorData);
        toast({ title: "Sponsor Updated" });
    } else {
        addDocumentNonBlocking(sponsorsCol, {
            ...sponsorData,
            paymentDetails: {
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

  const isLoading = packagesLoading || sponsorsLoading;

  const paymentStatusVariant = (status: SponsorPaymentStatus): "default" | "destructive" | "outline" | "secondary" | "paid" | "billed" | "overdue" => {
    switch(status) {
        case 'paid': return 'paid';
        case 'overdue': return 'overdue';
        case 'billed': return 'billed';
        case 'open': return 'outline';
        default: return 'outline';
    }
  }

  return (
    <>
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Current Sponsors</CardTitle>
                <CardDescription>
                  A list of companies sponsoring this event.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={areFiltersActive ? "secondary" : "outline"} size="sm" className="h-8 gap-1" disabled={isLoading}>
                      <ListFilter className="h-3.5 w-3.5" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Package</DropdownMenuLabel>
                    {packages?.map((pkg) => (
                      <DropdownMenuCheckboxItem
                        key={pkg.id}
                        checked={selectedPackages.includes(pkg.id)}
                        onCheckedChange={() => toggleFilter('package', pkg.id)}
                      >
                        {pkg.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                    {paymentStatuses.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedStatuses.includes(status)}
                        onCheckedChange={() => toggleFilter('status', status)}
                        className="capitalize"
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {areFiltersActive && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 px-2">
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">Clear</span>
                  </Button>
                )}
                <Button size="sm" className="h-8 gap-1" onClick={() => handleOpenSponsorDialog()}>
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Add Sponsor
                  </span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('companyName')}>
                        Company
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('packageId')}>
                        Package
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Primary Contact</TableHead>
                  <TableHead>
                     <Button variant="ghost" onClick={() => handleSort('paymentStatus')}>
                        Payment Status
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
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
                    sortedAndFilteredSponsors.map((sponsor) => (
                    <TableRow key={sponsor.id}>
                        <TableCell className="font-medium">
                            <Link href={`/sponsors/${sponsor.id}`} className="hover:underline">
                                {sponsor.companyName}
                            </Link>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className="cursor-pointer"
                            onClick={(e) => handlePackageBadgeClick(sponsor.packageId, e)}
                          >
                            {getPackageName(sponsor.packageId)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                            <div>{sponsor.contacts[0]?.name}</div>
                            <div className="text-sm text-muted-foreground">{sponsor.contacts[0]?.email}</div>
                        </TableCell>
                        <TableCell>
                            <Badge 
                              variant={paymentStatusVariant(sponsor.paymentDetails.status)}
                              className="cursor-pointer capitalize"
                              onClick={() => handlePaymentStatusClick(sponsor)}
                            >
                                {sponsor.paymentDetails.status}
                            </Badge>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
             {!isLoading && sortedAndFilteredSponsors.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                {sponsors && sponsors.length > 0 ? 'No sponsors match the current filters.' : 'No sponsors added yet.'}
              </div>
            )}
          </CardContent>
           <CardFooter>
            <div className="text-xs text-muted-foreground">
              {sponsors && <>Showing <strong>{sortedAndFilteredSponsors.length}</strong> of <strong>{sponsors.length}</strong> sponsors.</>}
            </div>
          </CardFooter>
        </Card>

        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Sponsorship Packages</CardTitle>
                        <CardDescription>Manage sponsor packages and deliverables.</CardDescription>
                    </div>
                    <Button size="sm" className="h-8 gap-1" onClick={() => handleOpenPackageDialog()}>
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Add Package
                        </span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Package</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Benefits</TableHead>
                            <TableHead><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
                        ) : (
                            packages?.map((pkg) => (
                                <TableRow key={pkg.id}>
                                    <TableCell className="font-semibold">{pkg.name}</TableCell>
                                    <TableCell>€{pkg.price.toLocaleString()}</TableCell>
                                    <TableCell>
                                        <ul className="list-disc list-inside text-sm text-muted-foreground">
                                            {pkg.benefits.map((benefit, i) => <li key={i}>{benefit}</li>)}
                                        </ul>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPackageDialog(pkg)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeletePackage(pkg.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
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
