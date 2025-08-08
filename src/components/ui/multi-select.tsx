"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

function MultiSelect({
  options,
  selected,
  onChange,
  className,
  ...props
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
   const listId = React.useId()

  const handleSelect = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  };

  return (
  <Popover open={open} onOpenChange={setOpen} {...props}>
  <PopoverTrigger asChild>
    <div
      role="combobox"
      aria-expanded={open}
       aria-controls={listId}
      onClick={() => setOpen(!open)}
      className={cn(
        "w-full min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "flex items-start justify-between gap-2 cursor-pointer",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap gap-1">
        {selected.length ? (
          selected.map((value) => {
            const option = options.find((o) => o.value === value)
            return (
              <Badge variant="secondary" key={value} className="max-w-full">
                <span className="truncate">{option?.label}</span>
                <button
                  className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); handleSelect(value); }}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </Badge>
            )
          })
        ) : (
          <span className="text-muted-foreground">Select files to exclude</span>
        )}
      </div>

      <ChevronsUpDown className="mt-1 h-4 w-4 shrink-0 opacity-50" />
    </div>
  </PopoverTrigger>

  <PopoverContent className="w-full p-0">
    <Command>
      <CommandInput placeholder="Search files..." />
      <CommandList>
        <CommandEmpty>No files found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              onSelect={(val) => handleSelect(val)}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selected.includes(option.value) ? "opacity-100" : "opacity-0"
                )}
              />
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>

  );
}

export { MultiSelect };
