"use client"

import { useEffect } from 'react';
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
import { Speaker, SpeakerProposalStatus, SpeakerSlidesStatus } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const proposalStatuses: SpeakerProposalStatus[] = ['Pending', 'Confirmed', 'Rejected'];
const slidesStatuses: SpeakerSlidesStatus[] = ['Missing', 'Uploaded', 'Review'];


const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  company: z.string().min(1, { message: "Company is required." }),
  proposalStatus: z.enum(proposalStatuses),
  slidesStatus: z.enum(slidesStatuses),
});

export type SpeakerFormValues = z.infer<typeof formSchema>;

type SpeakerFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: SpeakerFormValues) => void;
    speaker?: Speaker;
}

export function SpeakerFormDialog({ open, onOpenChange, onSubmit, speaker }: SpeakerFormDialogProps) {
  const isEditMode = !!speaker;

  const form = useForm<SpeakerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        name: speaker.name,
        company: speaker.company,
        proposalStatus: speaker.proposalStatus,
        slidesStatus: speaker.slidesStatus,
    } : {
      name: '',
      company: '',
      proposalStatus: 'Pending',
      slidesStatus: 'Missing',
    },
  });

  useEffect(() => {
    if (open) {
        form.reset(isEditMode ? {
            name: speaker.name,
            company: speaker.company,
            proposalStatus: speaker.proposalStatus,
            slidesStatus: speaker.slidesStatus,
        } : {
            name: '',
            company: '',
            proposalStatus: 'Pending',
            slidesStatus: 'Missing',
        });
    }
  }, [open, speaker, isEditMode, form]);

  function handleFormSubmit(data: SpeakerFormValues) {
    onSubmit(data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Speaker' : 'Add New Speaker'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this speaker.' : 'Fill in the details for a new speaker.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <Input placeholder="Innovate Inc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="proposalStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proposal Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {proposalStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slidesStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slides Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </Trigger>
                    </FormControl>
                    <SelectContent>
                      {slidesStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">{isEditMode ? 'Save Changes' : 'Add Speaker'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
