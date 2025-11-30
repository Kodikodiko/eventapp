"use client";

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
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
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { File, ListFilter, PlusCircle, ArrowUpDown } from 'lucide-react';
import { attendees as initialAttendees, Attendee, AttendeeRole, AttendeeStatus } from '@/lib/data';
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

const roles: AttendeeRole[] = ['attendee', 'speaker', 'orga', 'sponsor'];
const statuses: AttendeeStatus[] = ['Confirmed', 'Waitlisted', 'Cancelled'];

type SortKey = keyof Attendee | '';

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [selectedRoles, setSelectedRoles] = useState<AttendeeRole[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<AttendeeStatus[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

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
            setSelectedStatuses([]);
        } else {
            setSelectedStatuses([status]);
        }
    }
  };

  const handleUnregister = (attendeeId: string) => {
    setAttendees(attendees.filter(attendee => attendee.id !== attendeeId));
  };
  
  const handleAddAttendee = (data: AttendeeFormValues) => {
    const newAttendee: Attendee = {
      id: (attendees.length + 1).toString(),
      name: data.name,
      email: data.email,
      roles: data.roles as AttendeeRole[],
      status: data.status as AttendeeStatus,
      registrationDate: new Date().toISOString().split('T')[0],
      invoiceId: `INV${(attendees.length + 1).toString().padStart(3, '0')}`,
    };

    setAttendees(prev => [...prev, newAttendee]);
    
    toast({
      title: "Attendee Added",
      description: `${data.name} has been successfully added.`,
    });
    
    if (data.createInvoice) {
        toast({
            title: "Invoice Created",
            description: `An invoice has been created and sent to ${data.email}.`,
        });
    }

    setIsAddDialogOpen(false);
  };

  const handleUpdateAttendee = (id: string, data: Partial<Omit<Attendee, 'id'>>) => {
    setAttendees(prev => prev.map(att => att.id === id ? { ...att, ...data } : att));
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
        const aValue = a[sortKey];
        const bValue = b[sortKey];

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
      Name: attendee.name,
      Email: attendee.email,
      Roles: attendee.roles.join(', '),
      Status: attendee.status,
      'Registration Date': attendee.registrationDate,
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendees');
    XLSX.writeFile(workbook, 'attendees.xlsx');
  };
  
  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };


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
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleExport}>
                <File className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Export
                </span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
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
              <Button size="sm" className="h-8 gap-1" onClick={() => setIsAddDialogOpen(true)}>
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
                    <Button variant="ghost" onClick={() => handleSort('name')}>
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
              {sortedAndFilteredAttendees.map((attendee) => (
                <TableRow key={attendee.id}>
                  <TableCell className="font-medium">
                      <div className="font-medium">{attendee.name}</div>
                      <div className="hidden text-sm text-muted-foreground md:inline">{attendee.email}</div>
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
                  <TableCell className="hidden md:table-cell">{attendee.registrationDate}</TableCell>
                  <TableCell>
                    <AttendeeActions 
                      attendee={attendee} 
                      onUnregister={handleUnregister}
                      onUpdate={handleUpdateAttendee}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <AttendeeFormDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddAttendee}
      />
    </>
  );
}
