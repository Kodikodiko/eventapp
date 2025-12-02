
"use client";

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import {
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { format } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { File, ListFilter, PlusCircle, ArrowUpDown, X } from 'lucide-react';
import { Attendee, AttendeeRole, AttendeeStatus, EVENT_ID } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { AttendeeActions } from '@/components/attendees/attendee-actions';
import { AttendeeFormDialog, AttendeeFormValues } from '@/components/attendees/attendee-form-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const roles: AttendeeRole[] = ['attendee', 'speaker', 'orga', 'sponsor'];
const statuses: AttendeeStatus[] = ['Confirmed', 'Waitlisted', 'Cancelled'];

type SortKey = keyof Attendee | '';

export default function AttendeesPage() {
  const [selectedRoles, setSelectedRoles] = useState<AttendeeRole[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<AttendeeStatus[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  const firestore = useFirestore();
  const attendeesCol = useMemoFirebase(() => firestore ? collection(firestore, `events/${EVENT_ID}/attendees`) : null, [firestore]);
  const { data: attendees, isLoading } = useCollection<Attendee>(attendeesCol);

  const toggleRole = (role: AttendeeRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  const handleRoleBadgeClick = (role: AttendeeRole, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
        toggleRole(role);
    } else {
        if (selectedRoles.length === 1 && selectedRoles[0] === role) {
            setSelectedRoles([]);
        } else {
            setSelectedRoles([role]);
        }
    }
  };

  const toggleStatus = (status: AttendeeStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const handleStatusBadgeClick = (status: AttendeeStatus, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
        toggleStatus(status);
    } else {
        if (selectedStatuses.length === 1 && selectedStatuses[0] === status) {
            setSelectedStatuses([status]);
        } else {
            setSelectedStatuses([status]);
        }
    }
  };

  const handleUnregister = (attendeeId: string) => {
    if (!attendeesCol) return;
    const docRef = doc(attendeesCol, attendeeId);
    deleteDocumentNonBlocking(docRef);
  };

  const handleAddAttendee = (data: AttendeeFormValues) => {
    if (!firestore) return;

    const batch = writeBatch(firestore);

    data.attendees.forEach(attendee => {
        const newDocRef = doc(collection(firestore, `events/${EVENT_ID}/attendees`));
        const newAttendee = {
            ...attendee,
            roles: data.roles,
            status: data.status as AttendeeStatus,
            eventId: EVENT_ID,
            registrationDate: serverTimestamp(),
            price: data.totalPrice ? data.totalPrice / data.attendees.length : 0, // Distribute price evenly
        };
        batch.set(newDocRef, newAttendee);
    });

    batch.commit().then(() => {
        toast({
            title: "Attendees Added",
            description: `${data.attendees.length} attendees have been successfully added.`,
        });

        if (data.createInvoice) {
            toast({
                title: "Invoice Created",
                description: `An invoice for ${data.attendees.length} attendees totaling €${data.totalPrice} has been created.`,
            });
        }
    }).catch(error => {
        console.error("Error writing batch: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not add attendees. Please try again.",
        });
    });

    setIsAddDialogOpen(false);
  };

  const handleUpdateAttendee = (id: string, data: Partial<Omit<Attendee, 'id' | 'attendees'>>) => {
    if (!attendeesCol) return;
    const docRef = doc(attendeesCol, id);

    // `data` from the form includes the `attendees` array, which we don't want to save directly.
    // The actual attendee data is in the first element of that array.
    const { attendees: attendeeData, ...restData } = data as any;
    const updateData = {
        ...restData,
        ...attendeeData[0]
    };
    
    updateDocumentNonBlocking(docRef, updateData);
    toast({
        title: "Attendee Updated",
        description: "The attendee details have been successfully saved.",
    });
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredAttendees = useMemo(() => {
    if (!attendees) return [];
    let filtered = [...attendees];

    if (selectedRoles.length > 0) {
      filtered = filtered.filter((attendee) =>
        selectedRoles.every((role) => attendee.roles.includes(role))
      );
    }

    if (selectedStatuses.length > 0) {
      filtered = filtered.filter((attendee) =>
        selectedStatuses.includes(attendee.status)
      );
    }

    if (sortKey) {
      filtered.sort((a, b) => {
        let aValue, bValue;
        
        if (sortKey === 'registrationDate') {
            aValue = a.registrationDate ? (typeof a.registrationDate === 'string' ? a.registrationDate : a.registrationDate?.toDate().toISOString()) : '';
            bValue = b.registrationDate ? (typeof b.registrationDate === 'string' ? b.registrationDate : b.registrationDate?.toDate().toISOString()) : '';
        } else {
            aValue = a[sortKey as keyof Attendee];
            bValue = b[sortKey as keyof Attendee];
        }

        if (aValue < bValue) {
          return sortDirection === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDirection === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [attendees, selectedRoles, selectedStatuses, sortKey, sortDirection]);

  const handleExport = () => {
    const worksheetData = sortedAndFilteredAttendees.map(attendee => ({
      Name: attendee.fullName,
      Email: attendee.email,
      Company: attendee.company,
      'PMI Number': attendee.pmiNumber,
      Roles: attendee.roles.join(', '),
      Status: attendee.status,
      'Registration Date': attendee.registrationDate ? (typeof attendee.registrationDate === 'string' ? attendee.registrationDate : format(attendee.registrationDate.toDate(), 'yyyy-MM-dd')) : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');
    XLSX.writeFile(workbook, 'attendees.xlsx');
  };

  const clearFilters = () => {
    setSelectedRoles([]);
    setSelectedStatuses([]);
  };

  const areFiltersActive = selectedRoles.length > 0 || selectedStatuses.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Attendees</CardTitle>
              <CardDescription>
                Manage your event attendees and view their registration status.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleExport} disabled={isLoading || !attendees || attendees.length === 0}>
                <File className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Export
                </span>
              </Button>
              <div className="flex gap-2 items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={areFiltersActive ? "secondary" : "outline"} size="sm" className="h-8 gap-1" disabled={isLoading}>
                      <ListFilter className="h-3.5 w-3.5" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Role</DropdownMenuLabel>
                    {roles.map((role) => (
                        <DropdownMenuCheckboxItem
                            key={role}
                            checked={selectedRoles.includes(role)}
                            onCheckedChange={() => toggleRole(role)}
                            className="capitalize"
                        >
                            {role}
                        </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                    {statuses.map((status) => (
                        <DropdownMenuCheckboxItem
                            key={status}
                            checked={selectedStatuses.includes(status)}
                            onCheckedChange={() => toggleStatus(status)}
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
              </div>
              <Button size="sm" className="h-8 gap-1" onClick={() => setIsAddDialogOpen(true)} disabled={isLoading}>
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Add Attendee
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
                    <Button variant="ghost" onClick={() => handleSort('fullName')}>
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden md:table-cell">
                    <Button variant="ghost" onClick={() => handleSort('status')}>
                        Status
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                    <Button variant="ghost" onClick={() => handleSort('registrationDate')}>
                        Registered
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                    </TableRow>
                ))
              ) : (
                sortedAndFilteredAttendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">
                        <div className="font-medium">{attendee.fullName}</div>
                        <div className="text-sm text-muted-foreground">{attendee.email}</div>
                        {attendee.company && <div className="hidden text-xs text-muted-foreground md:inline">{attendee.company}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {attendee.roles.map(role => (
                          <Badge
                            key={role}
                            variant={selectedRoles.includes(role) ? "default" : "secondary"}
                            className="capitalize cursor-pointer"
                            onClick={(e) => handleRoleBadgeClick(role, e)}
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant={
                          attendee.status === 'Confirmed'
                            ? 'secondary'
                            : attendee.status === 'Waitlisted'
                            ? 'outline'
                            : 'destructive'
                        }
                        className="cursor-pointer"
                        onClick={(e) => handleStatusBadgeClick(attendee.status, e)}
                      >
                        {attendee.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                        {attendee.registrationDate && format(typeof attendee.registrationDate === 'string' ? new Date(attendee.registrationDate) : attendee.registrationDate.toDate(), 'PPP')}
                    </TableCell>
                    <TableCell>
                      <AttendeeActions
                        attendee={attendee}
                        onUnregister={handleUnregister}
                        onUpdate={handleUpdateAttendee}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <div className="text-xs text-muted-foreground">
            {attendees && <>Showing <strong>{sortedAndFilteredAttendees.length}</strong> of <strong>{attendees.length}</strong> attendees.</>}
          </div>
        </CardFooter>
      </Card>
      
      <AttendeeFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddAttendee}
      />
    </>
  );
}
