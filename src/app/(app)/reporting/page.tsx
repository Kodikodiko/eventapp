"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Legend, Label } from 'recharts';

const burnupData = [
  { date: 'Wk 1', goal: 500, actual: 120 },
  { date: 'Wk 2', goal: 1000, actual: 460 },
  { date: 'Wk 3', goal: 1500, actual: 910 },
  { date: 'Wk 4', goal: 2000, actual: 1580 },
  { date: 'Wk 5', goal: 2500, actual: 2140 },
  { date: 'Wk 6', goal: 3000, actual: 2800 },
];

const demographicsData = [
  { name: 'Developers', value: 400, fill: 'var(--color-devs)' },
  { name: 'Designers', value: 300, fill: 'var(--color-designers)' },
  { name: 'Managers', value: 300, fill: 'var(--color-managers)' },
  { name: 'Students', value: 200, fill: 'var(--color-students)' },
];

const burnupChartConfig = {
  actual: { label: 'Registered', color: 'hsl(var(--primary))' },
  goal: { label: 'Goal', color: 'hsl(var(--muted-foreground))' },
};

const demographicsChartConfig = {
  devs: { label: 'Developers', color: 'hsl(var(--chart-1))' },
  designers: { label: 'Designers', color: 'hsl(var(--chart-2))' },
  managers: { label: 'Managers', color: 'hsl(var(--chart-3))' },
  students: { label: 'Students', color: 'hsl(var(--chart-4))' },
}

export default function ReportingPage() {
  return (
    <div className="space-y-8">
       <div>
        <h1 className="text-2xl font-bold tracking-tight">Reporting & Analytics</h1>
        <p className="text-muted-foreground">Track event performance and attendee demographics.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendee Registration Burn-up</CardTitle>
            <CardDescription>
              Progress towards the attendee registration goal of 3,000.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={burnupChartConfig} className="h-[300px] w-full">
              <AreaChart data={burnupData} margin={{ left: -20, top: 10, right: 10, bottom: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Area dataKey="goal" type="natural" fill="var(--color-goal)" fillOpacity={0.1} stroke="var(--color-goal)" strokeDasharray="4 4" stackId="a" />
                <Area dataKey="actual" type="natural" fill="var(--color-actual)" fillOpacity={0.4} stroke="var(--color-actual)" stackId="a" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendee Demographics</CardTitle>
            <CardDescription>Breakdown of attendees by role.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center [&>div]:h-[300px]">
            <ChartContainer config={demographicsChartConfig}>
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie data={demographicsData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80}>
                        <Label
                            content={({ viewBox }) => {
                                if (viewBox) {
                                    const { cx, cy } = viewBox;
                                    return (
                                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                            <tspan x={cx} y={cy - 10} className="text-2xl font-bold fill-foreground">
                                                {demographicsData.reduce((acc, cur) => acc + cur.value, 0)}
                                            </tspan>
                                            <tspan x={cx} y={cy + 10} className="text-sm fill-muted-foreground">
                                                Attendees
                                            </tspan>
                                        </text>
                                    );
                                }
                                return null;
                            }}
                        />
                    </Pie>
                    <Legend content={({ payload }) => (
                        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4">
                            {payload?.map((entry, index) => (
                                <div key={`item-${index}`} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}/>
                                    <span className="text-sm text-muted-foreground">{entry.value}</span>
                                </div>
                            ))}
                        </div>
                    )} />
                </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
