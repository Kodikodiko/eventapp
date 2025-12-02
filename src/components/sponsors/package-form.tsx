
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
import { Textarea } from '@/components/ui/textarea';
import { SponsorPackage } from '@/lib/data';

const formSchema = z.object({
  name: z.string().min(2, "Name is required."),
  price: z.coerce.number().min(0, "Price must be a positive number."),
  benefits: z.string().min(1, "Benefits are required."),
});

export type PackageFormValues = {
    name: string;
    price: number;
    benefits: string[];
}

type PackageFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: PackageFormValues) => void;
    pkg?: SponsorPackage;
}

export function PackageFormDialog({ open, onOpenChange, onSubmit, pkg }: PackageFormDialogProps) {
  const isEditMode = !!pkg;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode ? {
        name: pkg.name,
        price: pkg.price,
        benefits: pkg.benefits.join('\n'),
    } : {
      name: '',
      price: 0,
      benefits: '',
    },
  });

  useEffect(() => {
    if (open) {
        form.reset(isEditMode ? {
            name: pkg.name,
            price: pkg.price,
            benefits: pkg.benefits.join('\n'),
        } : {
            name: '',
            price: 0,
            benefits: '',
        });
    }
  }, [open, pkg, isEditMode, form]);

  function handleFormSubmit(data: z.infer<typeof formSchema>) {
    const benefitsArray = data.benefits.split('\n').filter(b => b.trim() !== '');
    onSubmit({
        name: data.name,
        price: data.price,
        benefits: benefitsArray,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Package' : 'Add New Package'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details for this sponsorship package.' : 'Fill in the details for a new package.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Package Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Platinum" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (€)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="benefits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Benefits (one per line)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Large booth space&#10;Logo on website&#10;2 free tickets" {...field} rows={5}/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">{isEditMode ? 'Save Changes' : 'Add Package'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
