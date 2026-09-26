
"use client";

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
import Link from 'next/link';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { EVENT_ID, eventDetails as defaultEventDetails, EventDetails } from '@/lib/data';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useState } from 'react';

const formSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  company: z.string().optional(),
  pmiNumber: z.string().optional(),
  billingAddress: z.string().optional(),
  emailInvoice: z.boolean().default(true),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: "You must agree to the Terms of Service to register."
  }),
});

type RegistrationFormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
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

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      pmiNumber: '',
      billingAddress: '',
      emailInvoice: true,
      agreeToTerms: false,
    },
  });

  const watchAgreeToTerms = form.watch('agreeToTerms');

  function onSubmit(data: RegistrationFormValues) {
    if (!firestore) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not connect to the database. Please try again.",
        });
        return;
    };
    const attendeesCol = collection(firestore, `events/${EVENT_ID}/attendees`);
    
    const isMember = !!data.pmiNumber;
    const price = isMember ? eventDetails.pricing.member : eventDetails.pricing.normal;
    
    const newAttendee = {
      fullName: `${data.firstName} ${data.lastName}`,
      email: data.email,
      company: data.company,
      pmiNumber: data.pmiNumber,
      billingAddress: data.billingAddress,
      roles: ['attendee'],
      status: 'Confirmed',
      registrationDate: serverTimestamp(),
      eventId: EVENT_ID,
      price: price,
    };

    addDocumentNonBlocking(attendeesCol, newAttendee).then(() => {
        toast({
            title: "Registration Submitted!",
            description: "Thank you for registering. You will now be redirected to the dashboard.",
        });
        // In a real app, you would navigate to a Stripe checkout page or a thank you page.
        // For now, redirect to attendees list for easy verification.
        setTimeout(() => {
            router.push('/attendees');
        }, 2000);
    }).catch(e => {
        console.error("Error adding attendee: ", e);
        toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: "There was a problem with your registration.",
        });
    });

  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
       <div className="absolute top-4 right-4">
         <Button asChild variant="ghost">
            <Link href="/dashboard">Admin Login</Link>
         </Button>
      </div>
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-primary"><path d="M12 2l-5.5 9h11L12 2zM3 22l5.5-9h6.5l5.5 9H3z"/></svg>
          </div>
          <CardTitle className="text-3xl font-bold">Register for {eventDetails.name}</CardTitle>
          <CardDescription>
            Fill out the form below to secure your spot. 
            The ticket price is <span className="font-semibold text-foreground">€{eventDetails.pricing.normal.toFixed(2)}</span> (or €{eventDetails.pricing.member.toFixed(2)} for PMI members).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                        <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                        <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              </div>

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
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pmiNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PMI Member Number (Optional)</FormLabel>
                    <FormControl>
                        <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Enter your PMI number to qualify for a member discount.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Main St, Anytown, USA 12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

                <Card>
                    <CardHeader>
                        <CardTitle>Terms of Service</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea readOnly value={eventDetails.termsOfService} className="h-32 bg-background" />
                        <FormField
                            control={form.control}
                            name="agreeToTerms"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>I agree to the Terms of Service</FormLabel>
                                        <FormMessage />
                                    </div>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                
                 <FormField
                    control={form.control}
                    name="emailInvoice"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">Email invoice to me</FormLabel>
                        </FormItem>
                    )}
                />

                <CardContent className="flex flex-col gap-4 p-0 pt-6">
                    <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting || !watchAgreeToTerms}>
                        {form.formState.isSubmitting ? 'Registering...' : 'Register and Book Ticket'}
                    </Button>
                </CardContent>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
