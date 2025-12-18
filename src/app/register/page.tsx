
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
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { EVENT_ID } from '@/lib/data';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  company: z.string().optional(),
  pmiNumber: z.string().optional(),
  billingAddress: z.string().optional(),
});

type RegistrationFormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      pmiNumber: '',
      billingAddress: '',
    },
  });

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
    const newAttendee = {
      fullName: `${data.firstName} ${data.lastName}`,
      email: data.email,
      company: data.company,
      pmiNumber: data.pmiNumber,
      billingAddress: data.billingAddress,
      roles: ['attendee'],
      status: 'Confirmed', // Or 'Waitlisted' depending on logic
      registrationDate: serverTimestamp(),
      eventId: EVENT_ID,
      price: 149, // Placeholder price
    };

    addDocumentNonBlocking(attendeesCol, newAttendee).then(() => {
        toast({
            title: "Registration Submitted!",
            description: "Thank you for registering. You will now be redirected to the dashboard.",
        });
        // In a real app, you would navigate to a Stripe checkout page or a thank you page.
        // For now, redirect to dashboard for easy verification.
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
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-primary"><path d="M12 2l-5.5 9h11L12 2zM3 22l5.5-9h6.5l5.5 9H3z"/></svg>
          </div>
          <CardTitle className="text-3xl font-bold">Register for EventFlow</CardTitle>
          <CardDescription>Fill out the form below to secure your spot at the event.</CardDescription>
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

                <CardContent className="flex flex-col gap-4 p-0 pt-6">
                    <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Registering...' : 'Register and Book Ticket'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                        By registering, you agree to our Terms of Service.
                    </p>
                </CardContent>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
