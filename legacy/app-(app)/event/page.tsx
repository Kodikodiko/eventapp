
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { eventDetails as defaultEventDetails, type EventDetails } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  date: z.string().min(1, { message: "Date is required." }),
  location: z.string().min(1, { message: "Location is required." }),
  pricing: z.object({
    member: z.coerce.number().positive(),
    normal: z.coerce.number().positive(),
  }),
  termsOfService: z.string().min(10, { message: "Terms of Service cannot be empty." }),
});

type EventFormValues = z.infer<typeof formSchema>;

export default function EventPage() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [eventDetails, setEventDetails] = useState<EventDetails>(defaultEventDetails);

  useEffect(() => {
    try {
      const savedDetails = localStorage.getItem('eventDetails');
      if (savedDetails) {
        setEventDetails(JSON.parse(savedDetails));
      }
    } catch (error) {
      console.error("Failed to load event details from localStorage", error);
    }
  }, []);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(formSchema),
    values: { // Use `values` to keep form in sync with state changes
      name: eventDetails.name,
      date: eventDetails.date,
      location: eventDetails.location,
      pricing: {
        member: eventDetails.pricing.member,
        normal: eventDetails.pricing.normal,
      },
      termsOfService: eventDetails.termsOfService,
    },
  });
  
  useEffect(() => {
    // This effect keeps the form synchronized with the state, which is loaded from localStorage.
    form.reset(eventDetails);
  }, [eventDetails, form]);


  function onSubmit(data: EventFormValues) {
    const updatedDetails = { ...eventDetails, ...data };
    setEventDetails(updatedDetails);
    
    try {
      localStorage.setItem('eventDetails', JSON.stringify(updatedDetails));
      toast({
        title: "Event Updated",
        description: "The event details have been successfully saved.",
      });
    } catch (error) {
      console.error("Failed to save event details to localStorage", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not save event details.",
      });
    }
    
    setIsEditing(false);
  }

  const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isEditing) {
      e.preventDefault();
      form.reset(eventDetails); // Ensure form has the latest state before editing
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
                            <CardTitle>Event Information</CardTitle>
                            <CardDescription>Update the core details of your event.</CardDescription>
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

            <Card>
                <CardHeader>
                    <CardTitle>Terms of Service</CardTitle>
                    <CardDescription>Define the terms and conditions for event registration.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormField
                        control={form.control}
                        name="termsOfService"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <Textarea {...field} rows={8} disabled={!isEditing} />
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
