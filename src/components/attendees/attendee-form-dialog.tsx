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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Attendee, AttendeeRole, AttendeeStatus } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const roles: { id: AttendeeRole; label: string }[] = [
    { id: 'attendee', label: 'Attendee' },
    { id: 'speaker', label: 'Speaker' },
    { id: 'orga', label: 'Organizer' },
    { id: 'sponsor', label: 'Sponsor' },
  ];

const statuses: AttendeeStatus[] = ['Confirmed', 'Waitlisted', 'Cancelled'];

const formSchema = z.object({
  fullName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  roles: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one role.",
  }),
  status: z.string().min(1, { message: "Status is required." }),
  createInvoice: z.boolean().default(false).optional(),
});

export type AttendeeFormValues = z.infer<typeof formSchema>;

type AttendeeFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AttendeeFormValues) => void;
    attendee?: Attendee;
}

export function AttendeeFormDialog({ open, onOpenChange, onSubmit, attendee }: AttendeeFormDialogProps) {
  const isEditMode = !!attendee;

  const form = useForm<AttendeeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        fullName: attendee.fullName,
        email: attendee.email,
        roles: attendee.roles,
        status: attendee.status,
        createInvoice: false,
    } : {
      fullName: '',
      email: '',
      roles: ['attendee'],
      status: 'Confirmed',
      createInvoice: false,
    },
  });

  useEffect(() => {
    if (open) {
        form.reset(isEditMode ? {
            fullName: attendee.fullName,
            email: attendee.email,
            roles: attendee.roles,
            status: attendee.status,
            createInvoice: false,
        } : {
            fullName: '',
            email: '',
            roles: ['attendee'],
            status: 'Confirmed',
            createInvoice: false,
        });
    }
  }, [open, attendee, isEditMode, form]);

  function handleFormSubmit(data: AttendeeFormValues) {
    onSubmit(data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Attendee' : 'Add New Attendee'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this attendee.' : 'Fill in the details to add a new attendee.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input placeholder="john.doe@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             {isEditMode && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statuses.map(status => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Roles</FormLabel>
                    <FormDescription>
                      Assign one or more roles to the attendee.
                    </FormDescription>
                  </div>
                  {roles.map((item) => (
                    <FormField
                      key={item.id}
                      control={form.control}
                      name="roles"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={item.id}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(item.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value ?? []), item.id])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== item.id
                                        )
                                      )
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {item.label}
                            </FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isEditMode && (
                 <FormField
                  control={form.control}
                  name="createInvoice"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Create and send invoice
                        </FormLabel>
                        <FormDescription>
                          If checked, an invoice will be automatically generated and sent.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
            )}
            <DialogFooter>
              <Button type="submit">{isEditMode ? 'Save Changes' : 'Add Attendee'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
