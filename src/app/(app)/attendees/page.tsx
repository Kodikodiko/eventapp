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
import { File, PlusCircle } from 'lucide-react';
import { attendees } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { AttendeeActions } from '@/components/attendees/attendee-actions';

export default function AttendeesPage() {
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
            <Button size="sm" variant="outline" className="h-8 gap-1">
              <File className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Export
              </span>
            </Button>
            <Button size="sm" className="h-8 gap-1">
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
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Registered</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendees.map((attendee) => (
              <TableRow key={attendee.id}>
                <TableCell className="font-medium">
                    <div className="font-medium">{attendee.name}</div>
                    <div className="hidden text-sm text-muted-foreground md:inline">{attendee.email}</div>
                </TableCell>
                <TableCell>
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
