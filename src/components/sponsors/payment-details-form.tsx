
"use client";

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
import { SponsorPaymentDetails, SponsorPaymentStatus } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

const paymentStatuses: SponsorPaymentStatus[] = ['open', 'billed', 'paid', 'overdue'];

const formSchema = z.object({
  amount: z.coerce.number().min(0, "Amount must be positive."),
  discount: z.coerce.number().min(0, "Discount must be positive."),
  status: z.enum(paymentStatuses),
  dueDate: z.string().optional().nullable(),
  billedAmount: z.coerce.number().min(0, "Amount must be positive."),
});

export type PaymentFormValues = z.infer<typeof formSchema>;

type PaymentDetailsFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PaymentFormValues) => void;
  paymentDetails: SponsorPaymentDetails;
};

export function PaymentDetailsForm({ open, onOpenChange, onSubmit, paymentDetails }: PaymentDetailsFormProps) {
  
  const getFormattedDate = () => {
    if (!paymentDetails.dueDate) return '';
    const date = typeof paymentDetails.dueDate === 'string' ? new Date(paymentDetails.dueDate) : paymentDetails.dueDate.toDate();
    return format(date, 'yyyy-MM-dd');
  }

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: paymentDetails.amount,
      discount: paymentDetails.discount,
      status: paymentDetails.status,
      dueDate: getFormattedDate(),
      billedAmount: paymentDetails.billedAmount,
    },
  });

  const watchStatus = form.watch('status');

  useEffect(() => {
    if (open) {
      form.reset({
        amount: paymentDetails.amount,
        discount: paymentDetails.discount,
        status: paymentDetails.status,
        dueDate: getFormattedDate(),
        billedAmount: paymentDetails.billedAmount,
      });
    }
  }, [open, paymentDetails, form]);

  useEffect(() => {
    if (watchStatus === 'paid') {
      const currentBilledAmount = form.getValues('billedAmount');
      if (currentBilledAmount === 0) {
        const totalDue = paymentDetails.amount - paymentDetails.discount;
        form.setValue('billedAmount', totalDue);
      }
    }
  }, [watchStatus, paymentDetails, form]);

  function handleFormSubmit(data: PaymentFormValues) {
    onSubmit(data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Payment Details</DialogTitle>
          <DialogDescription>
            Update the payment information for this sponsor.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
             <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentStatuses.map(status => (
                        <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Package Price (€)</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Discount (€)</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
             <FormField
              control={form.control}
              name="billedAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Received (€)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
