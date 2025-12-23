
"use client"

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Session, SessionTag } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const sessionTags: SessionTag[] = ['talk', 'workshop', 'break', 'general'];
const streams = [1, 2, 3, 4];

const formSchema = z.object({
  title: z.string().min(2, { message: "Title is required." }),
  speaker: z.string().optional(),
  from: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)."),
  to: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)."),
  tag: z.enum(sessionTags),
  location: z.string().min(1, { message: "Location is required." }),
  stream: z.coerce.number().min(1).max(4),
}).refine(data => data.from < data.to, {
    message: "End time must be after start time.",
    path: ["to"],
});

export type SessionFormValues = z.infer<typeof formSchema>;

type SessionFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: SessionFormValues) => void;
    session?: Session;
}

export function SessionFormDialog({ open, onOpenChange, onSubmit, session }: SessionFormDialogProps) {
  const isEditMode = !!session;

  const defaultValues = useMemo(() => isEditMode ? {
        title: session.title,
        speaker: session.speaker,
        from: session.from,
        to: session.to,
        tag: session.tag,
        location: session.location,
        stream: session.stream,
    } : {
      title: '',
      speaker: '',
      from: '09:00',
      to: '10:00',
      tag: 'talk' as SessionTag,
      location: '',
      stream: 1,
    }, [session, isEditMode]);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
        form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  function handleFormSubmit(data: SessionFormValues) {
    onSubmit(data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Session' : 'Create New Session'}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground max-w-[150ch]">
            Specify the stream (1-4) for parallel sessions, or use Stream 1 for single-track events.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="speaker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Speaker (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="from"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>From</FormLabel>
                        <FormControl>
                            <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="to"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>To</FormLabel>
                        <FormControl>
                            <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
             <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location / Room</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="tag"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Tag</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a tag" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {sessionTags.map(tag => (
                                <SelectItem key={tag} value={tag} className="capitalize">{tag}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="stream"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Stream</FormLabel>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} defaultValue={String(field.value)}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a stream" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {streams.map(stream => (
                                <SelectItem key={stream} value={String(stream)}>{stream}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">{isEditMode ? 'Save Changes' : 'Create Session'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
