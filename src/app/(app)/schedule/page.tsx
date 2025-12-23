
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, User, PlusCircle, Edit, Trash2, Printer } from 'lucide-react';
import { Session, EVENT_ID } from '@/lib/data';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import {
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { SessionFormDialog, SessionFormValues } from '@/components/schedule/session-form-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { printSchedule } from '@/components/schedule/print-schedule';
import { cn } from '@/lib/utils';

// Group sessions by their start time
const groupSessionsByTime = (sessions: Session[]) => {
  if (!sessions) return {};
  return sessions.reduce((acc, session) => {
    const time = session.from;
    if (!acc[time]) {
      acc[time] = [];
    }
    acc[time].push(session);
    // Keep streams sorted
    acc[time].sort((a, b) => a.stream - b.stream);
    return acc;
  }, {} as Record<string, Session[]>);
};

export default function SchedulePage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | undefined>(undefined);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

  const { toast } = useToast();
  const firestore = useFirestore();
  const scheduleCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/schedule`), [firestore]);
  const { data: sessions, isLoading } = useCollection<Session>(scheduleCol);

  useEffect(() => {
    // One-time creation of default schedule if collection is empty
    if (sessions && sessions.length === 0 && !isLoading) {
      const defaultSchedule: Omit<Session, 'id'>[] = [
        { title: 'Registration & Breakfast', from: '09:00', to: '10:00', location: 'Main Hall', tag: 'general', stream: 1, eventId: EVENT_ID },
        { title: 'Opening Keynote', speaker: 'Dr. Evelyn Reed', from: '10:00', to: '10:45', location: 'Auditorium A', tag: 'talk', stream: 1, eventId: EVENT_ID },
        { title: 'The Future of Web Development', speaker: 'Marcus Chen', from: '10:45', to: '11:30', location: 'Room 101', tag: 'talk', stream: 1, eventId: EVENT_ID },
        { title: 'UX Design Principles', speaker: 'Lena Petrova', from: '10:45', to: '11:30', location: 'Room 102', tag: 'talk', stream: 2, eventId: EVENT_ID },
        { title: 'Intro to Serverless', speaker: 'John Doe', from: '10:45', to: '12:15', location: 'Workshop B', tag: 'workshop', stream: 3, eventId: EVENT_ID },
        { title: 'Lunch Break', from: '12:30', to: '14:00', location: 'Cafeteria', tag: 'general', stream: 1, eventId: EVENT_ID },
        { title: 'Advanced State Management', speaker: 'Jane Smith', from: '14:00', to: '14:45', location: 'Room 101', tag: 'talk', stream: 1, eventId: EVENT_ID },
        { title: 'Cybersecurity Today', speaker: 'Sam Wilson', from: '14:00', to: '14:45', location: 'Room 102', tag: 'talk', stream: 2, eventId: EVENT_ID },
      ];
      defaultSchedule.forEach(session => addDocumentNonBlocking(scheduleCol, session));
    }
  }, [sessions, isLoading, scheduleCol]);

  const groupedSessions = useMemo(() => {
    if (!sessions) return {};
    const sorted = [...sessions].sort((a,b) => a.from.localeCompare(b.from) || a.stream - b.stream);
    return groupSessionsByTime(sorted);
  }, [sessions]);

  const handleOpenForm = (session?: Session) => {
    setEditingSession(session);
    setIsFormOpen(true);
  };
  
  const handleSessionSubmit = (data: SessionFormValues) => {
    const sessionData = {
        ...data,
        eventId: EVENT_ID,
    };
    if (editingSession) {
        updateDocumentNonBlocking(doc(scheduleCol, editingSession.id), sessionData);
        toast({ title: "Session Updated" });
    } else {
        addDocumentNonBlocking(scheduleCol, sessionData);
        toast({ title: "Session Added" });
    }
    setIsFormOpen(false);
  };

  const handleDeleteSession = (session: Session) => {
    setSessionToDelete(session);
  }

  const handlePrint = () => {
    if (!sessions) return;
    const sorted = [...sessions].sort((a,b) => a.from.localeCompare(b.from) || a.stream - b.stream);
    printSchedule(sorted);
  };

  const handleDeleteConfirm = () => {
    if (sessionToDelete) {
        deleteDocumentNonBlocking(doc(scheduleCol, sessionToDelete.id));
        toast({ title: "Session Deleted", description: `"${sessionToDelete.title}" has been removed.` });
        setSessionToDelete(null);
    }
  }
  
  const getTagColor = (tag: Session['tag']) => {
    switch(tag) {
        case 'talk': return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300';
        case 'workshop': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
        case 'break': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
        case 'general': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300';
        default: return 'bg-gray-100 text-gray-800';
    }
  }

  const getStreamColorClass = (stream: number) => {
    switch(stream) {
      case 1: return 'border-l-blue-400';
      case 2: return 'border-l-green-400';
      case 3: return 'border-l-yellow-400';
      case 4: return 'border-l-red-400';
      default: return 'border-l-gray-400';
    }
  }


  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Event Schedule</h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              Organize your event by creating time slots and adding sessions. Sessions in the same time slot can be split into up to four parallel streams.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handlePrint} disabled={isLoading || !sessions || sessions.length === 0}>
                <Printer className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Print Schedule
                </span>
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={() => handleOpenForm()}>
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Create Session
                </span>
            </Button>
          </div>
        </div>
        
        {isLoading && (
            <div className="space-y-6">
                {Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="flex gap-8">
                        <Skeleton className="h-8 w-20" />
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 border-l-2 border-dashed pl-8">
                             <Skeleton className="h-48 w-full" />
                             <Skeleton className="h-48 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        )}

        {!isLoading && Object.keys(groupedSessions).length === 0 && (
            <Card>
                <CardContent className="text-center text-muted-foreground py-12">
                    <p>No sessions have been scheduled yet.</p>
                </CardContent>
            </Card>
        )}

        <div className="space-y-6">
          {Object.entries(groupedSessions).map(([time, timeSlots]) => (
            <div key={time} className="relative flex flex-col md:flex-row gap-4 md:gap-8">
              <div className="md:sticky md:top-20 h-fit">
                <h2 className="w-20 font-bold text-lg text-primary md:text-right">{time}</h2>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:border-l-2 md:border-dashed md:border-border md:pl-8 pb-4">
                <div className="md:hidden border-t-2 border-dashed -ml-4 mr-4 mb-4"></div>
                  {timeSlots.map((session) => (
                      <Card 
                        key={session.id} 
                        className={cn(
                          'relative transition-all hover:shadow-md flex flex-col border-l-4',
                          getStreamColorClass(session.stream)
                        )}
                        style={{
                          gridColumn: timeSlots.length === 1 ? '1 / -1' : `span 1`,
                        }}
                      >
                          <div className="absolute top-2 left-[-2.3rem] h-4 w-4 rounded-full bg-primary border-4 border-background hidden md:block" />
                          <CardHeader>
                              <CardTitle className="text-base">{session.title}</CardTitle>
                              <CardDescription className="pt-1">
                                <Badge className={getTagColor(session.tag)}>{session.tag}</Badge>
                              </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm text-muted-foreground flex-grow">
                              <div className="flex items-center gap-2"><Clock className="h-4 w-4"/><span>{session.from} - {session.to}</span></div>
                              {session.speaker && <div className="flex items-center gap-2"><User className="h-4 w-4"/><span>{session.speaker}</span></div>}
                          </CardContent>
                          <CardFooter className="flex justify-between items-center">
                              <div className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4"/><span>{session.location}</span></div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenForm(session)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSession(session)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                          </CardFooter>
                      </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {isFormOpen && (
        <SessionFormDialog
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleSessionSubmit}
            session={editingSession}
        />
      )}

      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the session "{sessionToDelete?.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSessionToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
