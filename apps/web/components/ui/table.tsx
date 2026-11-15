import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one table treatment: a 40px header row of small muted labels, then rows of
 * at least 56px that grow for a second line. `inCard` is for a table directly in
 * a card's content: hairlines and row highlights run to the card's edges, while
 * the first and last columns line up with the section title at the card's 24px.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { inCard?: boolean }
>(({ className, inCard = false, ...props }, ref) => (
  <div
    className={cn(
      "relative w-full overflow-auto",
      inCard && "-mx-6 w-auto [--table-inset:1.5rem]",
    )}
  >
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "[&_tr]:h-10 [&_tr]:border-b [&_tr]:hover:bg-transparent",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "h-14 border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "px-3 text-left align-middle text-xs font-medium text-muted-foreground lg:first:ps-[var(--table-inset,1rem)] lg:last:pe-[var(--table-inset,1rem)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2 align-middle lg:first:ps-[var(--table-inset,1rem)] lg:last:pe-[var(--table-inset,1rem)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

/**
 * Class names that render a table as stacked rows until the table has room,
 * about 1000px of viewport once the sidebar is taken out. Both layouts share one
 * DOM, so long tables don't mount every row twice. Pair with `StackedLabel` on
 * secondary cells, and put the row's `RowActionsMenu` in `actionsCell`.
 */
const stackedTable = {
  table: "block lg:table",
  header: "hidden lg:table-header-group",
  body: "block lg:table-row-group",
  row: "relative block h-auto px-[var(--table-inset,0px)] py-3 lg:table-row lg:h-14 lg:p-0",
  primaryCell:
    "block p-0 pe-14 font-medium lg:table-cell lg:px-3 lg:py-2 lg:font-normal",
  cell: "block p-0 pe-14 pt-1 text-muted-foreground lg:table-cell lg:px-3 lg:py-2 lg:text-foreground",
  /** A number that sits next to the others while stacked. */
  inlineCell: "inline-block p-0 pe-4 pt-1 lg:table-cell lg:px-3 lg:py-2",
  actionsCell:
    "absolute end-[var(--table-inset,0px)] top-1.5 flex items-center gap-1 p-0 lg:static lg:table-cell lg:w-px lg:px-3 lg:py-2 lg:text-end",
};

function StackedLabel({ children }: { children: React.ReactNode }) {
  return <span className="lg:hidden">{children}: </span>;
}

export {
  stackedTable,
  StackedLabel,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
