import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, User } from 'lucide-react';

const schedule = {
  '09:00 AM': [
    { title: 'Registration & Breakfast', duration: '60 min', location: 'Main Hall', type: 'general' },
    { title: 'Opening Keynote', speaker: 'Dr. Evelyn Reed', duration: '45 min', location: 'Auditorium A', type: 'talk' },
  ],
  '10:45 AM': [
    { title: 'The Future of Web Development', speaker: 'Marcus Chen', duration: '45 min', location: 'Room 101', type: 'talk' },
    { title: 'UX Design Principles', speaker: 'Lena Petrova', duration: '45 min', location: 'Room 102', type: 'talk' },
    { title: 'Intro to Serverless', speaker: 'John Doe', duration: '90 min', location: 'Workshop B', type: 'workshop' },
  ],
  '12:30 PM': [
    { title: 'Lunch Break', duration: '90 min', location: 'Cafeteria', type: 'general' },
  ],
  '02:00 PM': [
    { title: 'Advanced State Management', speaker: 'Jane Smith', duration: '45 min', location: 'Room 101', type: 'talk' },
    { title: 'Cybersecurity Today', speaker: 'Sam Wilson', duration: '45 min', location: 'Room 102', type: 'talk' },
  ],
};

export default function SchedulePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Event Schedule</h1>
        <p className="text-muted-foreground">Plan your day and discover sessions.</p>
      </div>
      <div className="space-y-6">
        {Object.entries(schedule).map(([time, sessions]) => (
          <div key={time} className="relative flex gap-8">
            <div className="sticky top-20 h-fit">
              <h2 className="w-20 font-bold text-lg text-primary text-right">{time}</h2>
            </div>
            <div className="flex-1 space-y-4 border-l-2 border-dashed border-border pl-8 pb-8">
                {sessions.map((session, index) => (
                    <Card key={index} className="relative transition-all hover:shadow-md">
                        <div className="absolute top-[-11px] left-[-37px] h-4 w-4 rounded-full bg-primary border-4 border-background" />
                        <CardHeader>
                            <CardTitle>{session.title}</CardTitle>
                            <CardDescription className="pt-2">
                            <Badge variant={session.type === 'talk' ? 'secondary' : 'outline'}>{session.type}</Badge>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            {session.speaker && <div className="flex items-center gap-2"><User className="h-4 w-4"/><span>{session.speaker}</span></div>}
                            <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{session.duration}</span></div>
                        </CardContent>
                        <CardFooter>
                            <div className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4"/><span>{session.location}</span></div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
