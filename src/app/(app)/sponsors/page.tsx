import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sponsors } from '@/lib/data';
import { Check, PlusCircle, Star } from 'lucide-react';

const packages = [
  {
    name: 'Platinum',
    price: 10000,
    features: ['Keynote shout-out', 'Large booth space', 'Logo on all materials', '4 free tickets'],
  },
  {
    name: 'Gold',
    price: 5000,
    features: ['Medium booth space', 'Logo on website', '2 free tickets'],
  },
  {
    name: 'Silver',
    price: 2500,
    features: ['Small booth space', '1 free ticket'],
  },
];

export default function SponsorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sponsorship Packages</h1>
        <p className="text-muted-foreground">Manage sponsor packages and deliverables.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <Card key={pkg.name} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="text-primary"/> {pkg.name}
              </CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">${pkg.price.toLocaleString()}</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-6 pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" /> {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
             <CardFooter>
              <Button className="w-full">Choose Plan</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Sponsors</CardTitle>
              <CardDescription>
                A list of companies sponsoring this event.
              </CardDescription>
            </div>
            <Button size="sm" className="h-8 gap-1">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add Sponsor
              </span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sponsors.map((sponsor) => (
                <TableRow key={sponsor.id}>
                  <TableCell className="font-medium">{sponsor.companyName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sponsor.package}</Badge>
                  </TableCell>
                  <TableCell>{sponsor.contactName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
