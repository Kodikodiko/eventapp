"use client";

import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Attendee, EVENT_ID } from '@/lib/data';
import { collection, limit, query, orderBy } from 'firebase/firestore';
import imageData from '@/lib/placeholder-images.json';
import { Skeleton } from '@/components/ui/skeleton';

export function RecentAttendees() {
  const firestore = useFirestore();
  const attendeesCol = useMemoFirebase(
    () =>
      query(
        collection(firestore, `events/${EVENT_ID}/attendees`),
        orderBy('registrationDate', 'desc'),
        limit(5)
      ),
    [firestore]
  );
  const { data: recentAttendees, isLoading } = useCollection<Attendee>(attendeesCol);

  const images = imageData.placeholderImages;

  return (
    <div className="space-y-8">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div className="flex items-center" key={i}>
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="ml-4 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))
      ) : (
        recentAttendees?.map((attendee) => (
          <div className="flex items-center" key={attendee.id}>
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={images.find((img) => img.id === attendee.id)?.imageUrl}
                alt="Avatar"
                data-ai-hint="person"
              />
              <AvatarFallback>
                {attendee.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <div className="ml-4 space-y-1">
              <p className="text-sm font-medium leading-none">
                {attendee.fullName}
              </p>
              <p className="text-sm text-muted-foreground">{attendee.email}</p>
            </div>
            <div className="ml-auto font-medium">+1 Ticket</div>
          </div>
        ))
      )}
      {!isLoading && (!recentAttendees || recentAttendees.length === 0) && (
        <p className="text-sm text-muted-foreground text-center">No recent registrations.</p>
      )}
    </div>
  );
}
