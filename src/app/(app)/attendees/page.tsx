"use client";

import { useState } from 'react';
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
import { File, ListFilter } from 'lucide-react';
import { attendees, Attendee, AttendeeRole } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { AttendeeActions } from '@/components/attendees/attendee-actions';
import { AddAttendeeDialog } from '@/components/attendees/add-attendee-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const roles: AttendeeRole[] = ['attendee', 'speaker', 'orga', 'sponsor'];

export default function AttendeesPage() {
  const [selectedRoles, setSelectedRoles] = useState<AttendeeRole[]>([]);

  const toggleRole = (role: AttendeeRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  const filteredAttendees = selectedRoles.length
    ? attendees.filter((attendee) =>
        selectedRoles.every((role) => attendee.roles.includes(role))
      )
    : attendees;

  const handleExport = () => {
    const worksheetData = filteredAttendees.map(attendee => ({
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


  return (
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
                <DropdownMenuSeparator />
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
              </DropdownMenuContent>
            </DropdownMenu>
            <AddAttendeeDialog />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Registered</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAttendees.map((attendee) => (
              <TableRow key={attendee.id}>
                <TableCell className="font-medium">
                    <div className="font-medium">{attendee.name}</div>
                    <div className="hidden text-sm text-muted-foreground md:inline">{attendee.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {attendee.roles.map(role => (
                      <Badge key={role} variant="secondary" className="capitalize">{role}</Badge>
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
                  >
                    {attendee.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">{attendee.registrationDate}</TableCell>
                <TableCell>
                  <AttendeeActions attendee={attendee} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
