"use client";

import { useState, useMemo } from 'react';
import {
  collection,
  doc,
} from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import {
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListFilter, PlusCircle, ArrowUpDown, X } from 'lucide-react';
import { Speaker, SpeakerProposalStatus, SpeakerSlidesStatus, EVENT_ID } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { SpeakerActions } from '@/components/speakers/speaker-actions';
import { SpeakerFormDialog, SpeakerFormValues } from '@/components/speakers/speaker-form-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const proposalStatuses: SpeakerProposalStatus[] = ['Pending', 'Confirmed', 'Rejected'];
const slidesStatuses: SpeakerSlidesStatus[] = ['Missing', 'Uploaded', 'Review'];

type SortKey = keyof Speaker | '';

export default function SpeakersPage() {
  const [selectedProposalStatuses, setSelectedProposalStatuses] = useState<SpeakerProposalStatus[]>([]);
  const [selectedSlidesStatuses, setSelectedSlidesStatuses] = useState<SpeakerSlidesStatus[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  const firestore = useFirestore();
  const speakersCol = useMemoFirebase(() => collection(firestore, `events/${EVENT_ID}/speakers`), [firestore]);
  const { data: speakers, isLoading } = useCollection<Speaker>(speakersCol);

  const toggleFilter = (
    type: 'proposal' | 'slides',
    value: SpeakerProposalStatus | SpeakerSlidesStatus
  ) => {
    if (type === 'proposal') {
      setSelectedProposalStatuses(prev =>
        prev.includes(value as SpeakerProposalStatus)
          ? prev.filter(s => s !== value)
          : [...prev, value as SpeakerProposalStatus]
      );
    } else {
      setSelectedSlidesStatuses(prev =>
        prev.includes(value as SpeakerSlidesStatus)
          ? prev.filter(s => s !== value)
          : [...prev, value as SpeakerSlidesStatus]
      );
    }
  };
  
  const handleBadgeClick = (
    type: 'proposal' | 'slides',
    value: SpeakerProposalStatus | SpeakerSlidesStatus, 
    e: React.MouseEvent
  ) => {
    const isMultiSelect = e.ctrlKey || e.metaKey;
    const setter = type === 'proposal' ? setSelectedProposalStatuses : setSelectedSlidesStatuses;
    const currentSelection = type === 'proposal' ? selectedProposalStatuses : selectedSlidesStatuses;

    if (isMultiSelect) {
        setter(prev => 
            prev.includes(value as any) 
                ? prev.filter(item => item !== value) 
                : [...prev, value as any]
        );
    } else {
        if (currentSelection.length === 1 && currentSelection[0] === value) {
            setter([]);
        } else {
            setter([value as any]);
        }
    }
  };


  const handleDeleteSpeaker = (speakerId: string) => {
    const docRef = doc(speakersCol, speakerId);
    deleteDocumentNonBlocking(docRef);
  };

  const handleAddSpeaker = (data: SpeakerFormValues) => {
    const newSpeaker = {
      ...data,
      eventId: EVENT_ID,
    };
    addDocumentNonBlocking(speakersCol, newSpeaker);
    toast({
      title: "Speaker Added",
      description: `${data.name} has been successfully added.`,
    });
    setIsAddDialogOpen(false);
  };

  const handleUpdateSpeaker = (id: string, data: Partial<Omit<Speaker, 'id'>>) => {
    const docRef = doc(speakersCol, id);
    updateDocumentNonBlocking(docRef, data);
    toast({
      title: "Speaker Updated",
      description: "The speaker details have been successfully saved.",
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredSpeakers = useMemo(() => {
    if (!speakers) return [];
    let filtered = [...speakers];

    if (selectedProposalStatuses.length > 0) {
        filtered = filtered.filter(speaker =>
            selectedProposalStatuses.includes(speaker.proposalStatus)
        );
    }
    if (selectedSlidesStatuses.length > 0) {
        filtered = filtered.filter(speaker =>
            selectedSlidesStatuses.includes(speaker.slidesStatus)
        );
    }


    if (sortKey) {
      filtered.sort((a, b) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [speakers, selectedProposalStatuses, selectedSlidesStatuses, sortKey, sortDirection]);


  const clearFilters = () => {
    setSelectedProposalStatuses([]);
    setSelectedSlidesStatuses([]);
  };

  const areFiltersActive = selectedProposalStatuses.length > 0 || selectedSlidesStatuses.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Speakers</CardTitle>
              <CardDescription>
                Manage speaker registrations and submissions.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-2 items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={areFiltersActive ? "secondary" : "outline"} size="sm" className="h-8 gap-1" disabled={isLoading}>
                      <ListFilter className="h-3.5 w-3.5" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Filter</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Filter by Proposal Status</DropdownMenuLabel>
                    {proposalStatuses.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedProposalStatuses.includes(status)}
                        onCheckedChange={() => toggleFilter('proposal', status)}
                        className="capitalize"
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Filter by Slides Status</DropdownMenuLabel>
                    {slidesStatuses.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedSlidesStatuses.includes(status)}
                        onCheckedChange={() => toggleFilter('slides', status)}
                        className="capitalize"
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {areFiltersActive && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 px-2">
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">Clear</span>
                  </Button>
                )}
              </div>
              <Button size="sm" className="h-8 gap-1" onClick={() => setIsAddDialogOpen(true)} disabled={isLoading}>
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Add Speaker
                </span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('name')}>
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('proposalStatus')}>
                        Proposal
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('slidesStatus')}>
                        Slides
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : (
                sortedAndFilteredSpeakers.map((speaker) => (
                  <TableRow key={speaker.id}>
                    <TableCell>
                      <div className="font-medium">{speaker.name}</div>
                      <div className="hidden text-sm text-muted-foreground md:inline">
                        {speaker.company}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          speaker.proposalStatus === 'Confirmed' ? 'secondary'
                          : speaker.proposalStatus === 'Pending' ? 'outline'
                          : 'destructive'
                        }
                        className="cursor-pointer"
                        onClick={(e) => handleBadgeClick('proposal', speaker.proposalStatus, e)}
                      >
                        {speaker.proposalStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                       <Badge
                        variant={
                          speaker.slidesStatus === 'Uploaded' ? 'secondary'
                          : speaker.slidesStatus === 'Missing' ? 'outline'
                          : 'default'
                        }
                        className="cursor-pointer"
                        onClick={(e) => handleBadgeClick('slides', speaker.slidesStatus, e)}
                      >
                        {speaker.slidesStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                        <SpeakerActions
                            speaker={speaker}
                            onUpdate={handleUpdateSpeaker}
                            onDelete={handleDeleteSpeaker}
                        />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <div className="text-xs text-muted-foreground">
            {speakers && <>Showing <strong>{sortedAndFilteredSpeakers.length}</strong> of <strong>{speakers.length}</strong> speakers.</>}
          </div>
        </CardFooter>
      </Card>
      <SpeakerFormDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddSpeaker}
      />
    </>
  );
}
