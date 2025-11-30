import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { attendees } from "@/lib/data";
import imageData from '@/lib/placeholder-images.json';

export function RecentAttendees() {
  const recentAttendees = attendees.slice(0, 5);
  const images = imageData.placeholderImages;

  return (
    <div className="space-y-8">
      {recentAttendees.map((attendee) => (
        <div className="flex items-center" key={attendee.id}>
          <Avatar className="h-9 w-9">
            <AvatarImage 
              src={images.find(img => img.id === attendee.id)?.imageUrl} 
              alt="Avatar" 
              data-ai-hint="person" 
            />
            <AvatarFallback>{attendee.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{attendee.name}</p>
            <p className="text-sm text-muted-foreground">{attendee.email}</p>
          </div>
          <div className="ml-auto font-medium">+1 Ticket</div>
        </div>
      ))}
    </div>
  )
}
