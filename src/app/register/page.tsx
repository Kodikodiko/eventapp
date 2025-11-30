"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

const formSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  pmiNumber: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string().optional(),
});

type RegistrationFormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const { toast } = useToast();

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      pmiNumber: '',
      address: '',
      email: '',
      phone: '',
    },
  });

  function onSubmit(data: RegistrationFormValues) {
    console.log(data);
    toast({
      title: "Registration Successful!",
      description: "Thank you for registering. Please check your email for confirmation.",
    });
    form.reset();
  }

  function handleVerifyPmi() {
    const pmiNumber = form.getValues('pmiNumber');
    if (pmiNumber) {
      // In a real app, you would call an API to verify the number.
      toast({
        title: "Verifying PMI Number...",
        description: `Checking number: ${pmiNumber}`,
      });
      // Simulate API call
      setTimeout(() => {
        toast({
          title: "PMI Membership Verified!",
          description: "The member discount will be applied at checkout.",
        });
      }, 1500);
    } else {
      toast({
        variant: "destructive",
        title: "No PMI Number",
        description: "Please enter a PMI number to verify.",
      });
    }
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
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                name="pmiNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PMI Member Number</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <Button type="button" variant="outline" onClick={handleVerifyPmi}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Verify
                      </Button>
                    </div>
                    <FormDescription>
                      Enter your PMI number to qualify for a member discount.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Anytown, USA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                <CardFooter className="flex flex-col gap-4 p-0 pt-6">
                    <Button type="submit" className="w-full" size="lg">Proceed to Payment</Button>
                    <p className="text-center text-xs text-muted-foreground">
                        By registering, you agree to our Terms of Service.
                    </p>
                </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
