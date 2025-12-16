
"use client";

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { eventDetails, type EventDetails } from '@/lib/data';
import { DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  date: z.string().min(1, { message: "Date is required." }),
  location: z.string().min(1, { message: "Location is required." }),
  pricing: z.object({
    member: z.coerce.number().positive(),
    normal: z.coerce.number().positive(),
  }),
});

type EventFormValues = z.infer<typeof formSchema>;

export default function EventPage() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: eventDetails.name,
      date: eventDetails.date,
      location: eventDetails.location,
      pricing: {
        member: eventDetails.pricing.member,
        normal: eventDetails.pricing.normal,
      },
    },
  });

  function onSubmit(data: EventFormValues) {
    // In a real app, you would save this data.
    console.log(data);
    toast({
      title: "Event Updated",
      description: "The event details have been successfully saved.",
    });
    setIsEditing(false);
  }

  const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isEditing) {
      e.preventDefault();
      setIsEditing(true);
    }
  }
  
  const displayDate = form.watch('date');

  return (
    <div className="space-y-8">
       <div>
        <h1 className="text-2xl font-bold tracking-tight">Event Details</h1>
        <p className="text-muted-foreground">Manage your event settings and pricing.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>General Information</CardTitle>
                            <CardDescription>Update the basic details of your event.</CardDescription>
                        </div>
                        <Button 
                            type={isEditing ? 'submit' : 'button'} 
                            onClick={handleEditClick}
                        >
                            {isEditing ? 'Save Changes' : 'Edit Event'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                     <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Event Name</FormLabel>
                            <FormControl>
                                <Input {...field} disabled={!isEditing} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Event Date</FormLabel>
                            <FormControl>
                                 <Input 
                                    type={isEditing ? 'date' : 'text'} 
                                    {...field} 
                                    disabled={!isEditing}
                                    value={isEditing ? field.value : format(parseISO(field.value), 'dd.MM.yyyy')}
                                 />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                                <Input {...field} disabled={!isEditing} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Pricing</CardTitle>
                    <CardDescription>Set the ticket prices for your event.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="pricing.normal"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Normal Price</FormLabel>
                                <FormControl>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2.5 text-muted-foreground">€</span>
                                    <Input type="number" className="pl-8" {...field} disabled={!isEditing} />
                                </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                        control={form.control}
                        name="pricing.member"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Member Price</FormLabel>
                                <FormControl>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2.5 text-muted-foreground">€</span>
                                    <Input type="number" className="pl-8" {...field} disabled={!isEditing} />
                                </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>

        </form>
      </Form>
    </div>
  );
}
