
"use client"

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { PlusCircle, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const roles: { id: AttendeeRole; label: string }[] = [
    { id: 'attendee', label: 'Attendee' },
    { id: 'speaker', label: 'Speaker' },
    { id: 'orga', label: 'Organizer' },
    { id: 'sponsor', label: 'Sponsor' },
  ];

const statuses: AttendeeStatus[] = ['Confirmed', 'Waitlisted', 'Cancelled'];

const attendeeSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Invalid email address."),
});

const formSchema = z.object({
  attendees: z.array(attendeeSchema).min(1, "At least one attendee is required."),
  roles: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one role.",
  }),
  status: z.string().min(1, { message: "Status is required." }),
  createInvoice: z.boolean().default(false).optional(),
  totalPrice: z.coerce.number().optional(),
});


export type AttendeeFormValues = z.infer<typeof formSchema>;

type AttendeeFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: AttendeeFormValues) => void;
    attendee?: Attendee; // For editing a single attendee
}

export function AttendeeFormDialog({ open, onOpenChange, onSubmit, attendee }: AttendeeFormDialogProps) {
  const [step, setStep] = useState(1);
  const isEditMode = !!attendee;

  const form = useForm<AttendeeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      attendees: isEditMode ? [{ fullName: attendee.fullName, email: attendee.email }] : [{ fullName: '', email: '' }],
      roles: isEditMode ? attendee.roles : ['attendee'],
      status: isEditMode ? attendee.status : 'Confirmed',
      createInvoice: false,
      totalPrice: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "attendees",
  });
  
  const watchCreateInvoice = form.watch('createInvoice');
  const watchAttendees = form.watch('attendees');
  const watchTotalPrice = form.watch('totalPrice');


  useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      form.reset(isEditMode ? {
          attendees: [{fullName: attendee.fullName, email: attendee.email }],
          roles: attendee.roles,
          status: attendee.status,
      } : {
          attendees: [{ fullName: '', email: '' }],
          roles: ['attendee'],
          status: 'Confirmed',
          createInvoice: false,
          totalPrice: 0,
      });
      setStep(1); // Always start at step 1
    }
  }, [open, attendee, isEditMode, form]);

  function handleNextStep(e: React.MouseEvent) {
    e.preventDefault();
    form.trigger().then(isValid => {
      if (isValid) {
        if (watchCreateInvoice) {
          setStep(2);
        } else {
          // If no invoice, just submit
          form.handleSubmit(handleFormSubmit)();
        }
      }
    });
  }

  function handleFormSubmit(data: AttendeeFormValues) {
    onSubmit(data);
    onOpenChange(false); // Close dialog on final submission
  }
  
  const renderStep1 = () => (
    <>
      <DialogHeader>
        <DialogTitle>{isEditMode ? 'Edit Attendee' : 'Add New Attendees'}</DialogTitle>
        <DialogDescription>
          {isEditMode ? 'Update the details for this attendee.' : 'Add one or more attendees. Shared properties will apply to all.'}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-4">
          <ScrollArea className="h-64 pr-6">
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-md relative">
                  <FormField
                    control={form.control}
                    name={`attendees.${index}.fullName`}
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
                    name={`attendees.${index}.email`}
                    render={({ field }) => (
                      <FormItem className="mt-2">
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="john.doe@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!isEditMode && fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!isEditMode && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ fullName: '', email: '' })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Attendee
              </Button>
            )}
          </ScrollArea>
          
          <Separator />

          <div className="grid grid-cols-2 gap-4">
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
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <div className="space-y-1">
                    {roles.map((item) => (
                      <FormField
                        key={item.id}
                        control={form.control}
                        name="roles"
                        render={({ field }) => {
                          return (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value ?? []), item.id])
                                      : field.onChange(field.value?.filter((value) => value !== item.id))
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-sm">{item.label}</FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {!isEditMode && (
            <>
              <FormField
                control={form.control}
                name="totalPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Price</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-muted-foreground">€</span>
                        <Input type="number" className="pl-8" placeholder="0.00" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="createInvoice"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Create and send invoice</FormLabel>
                      <FormDescription>Review invoice details before finalizing.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </>
          )}

          <DialogFooter>
            <Button type="button" onClick={handleNextStep}>
              {watchCreateInvoice && !isEditMode ? 'Next: Review Invoice' : isEditMode ? 'Save Changes' : 'Add Attendees'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
  
  const renderStep2 = () => (
    <>
        <DialogHeader>
            <DialogTitle>Review Invoice</DialogTitle>
            <DialogDescription>
                Please confirm the details below before creating the invoice and registering the attendees.
            </DialogDescription>
        </DialogHeader>

        <Card>
            <CardHeader>
                <CardTitle>Attendees ({watchAttendees.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-40">
                    <ul className="space-y-2 text-sm">
                        {watchAttendees.map((attendee, index) => (
                            <li key={index} className="flex justify-between">
                                <span>{attendee.fullName}</span>
                                <span className="text-muted-foreground">{attendee.email}</span>
                            </li>
                        ))}
                    </ul>
                </ScrollArea>
            </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div className="font-semibold">Total Price:</div>
            <div className="text-right text-lg font-bold">€ {watchTotalPrice?.toFixed(2) ?? '0.00'}</div>
            <div className="col-span-2 text-xs text-muted-foreground">
                An invoice will be generated for the total amount.
            </div>
        </div>

        <DialogFooter>
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => form.handleSubmit(handleFormSubmit)()}>Confirm & Register</Button>
        </DialogFooter>
    </>
  );


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 1 ? renderStep1() : renderStep2()}
      </DialogContent>
    </Dialog>
  );
}

    